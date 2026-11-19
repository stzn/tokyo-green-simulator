// パイロット区域（大手町・丸の内）の地点データ（stage.json、データ契約の版 2）を書き出す。
//   npm run stage:export                     # 2025-08-30 で計算
//   npm run stage:export -- --date 2025-07-15
// 建物は地図表示と同じ PLATEAU の MVT、街路樹の樹冠は public/data/trees.json、通路は OpenStreetMap（Overpass API）から取り、
// 取得結果は scripts/.cache/ に置いて再実行時はそこから読む。公園・街路樹は public/data/ の生成済みデータを使う
import { execSync } from 'node:child_process'
import { setDefaultResultOrder } from 'node:dns'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { PLATEAU_BUILDINGS_TILES } from '../src/config/sources'
import type { CityTreeFeature } from '../src/data/cityTrees'
import { computeGreenContext } from '../src/data/greenContext'
import type { ParkFeature } from '../src/data/parks'
import { toTreeData } from '../src/data/trees'
import { createBuildingIndex, createTreeIndex, crownOf, DEFAULT_MAX_DISTANCE_M, localProjection, type LocalBuilding, type LocalTree } from '../src/lib/shade'
import { STAGE_OUTPUT_PATH, stageIntegrityErrors, toStageGreen, type Stage } from '../src/lib/stage'
import { decodeBuildingTile } from './lib/buildingTiles'
import { tileRange } from './lib/dem'
import type { OverpassElement } from './lib/parks'
import type { TreesColumnar } from './lib/parseTrees'
import { assembleStage, DEFAULT_SPOT_RULES, extractCandidateSpots } from './lib/stageSpots'

const AREA: Stage['area'] = { id: 'otemachi', name: '大手町・丸の内', bbox: [139.758, 35.676, 139.772, 35.692] }
const ID_PREFIX = 'OTM'
const DEFAULT_DATE = '2025-08-30'
/** 緑の文脈を数える半径[m]（計測ログの既定と同じ） */
const GREEN_RADIUS_M = 100
/** 建物タイルのズーム（地図表示の maxZoom と同じ） */
const TILE_ZOOM = 16

const CACHE_DIR = 'scripts/.cache/stage'
const TILE_CACHE_DIR = `${CACHE_DIR}/plateau-bldg/${TILE_ZOOM}`
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
const USER_AGENT = 'urban-green-twin-tokyo/0.1 (research prototype)'
const WAIT_MS = 200
const MAX_ATTEMPTS = 4

// IPv6経路だと overpass-api.de への接続がタイムアウトする環境があるため、IPv4を優先する（fetch-parks.ts と同じ）
setDefaultResultOrder('ipv4first')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchWithRetry(label: string, request: (attempt: number) => Promise<Response>): Promise<Response | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await request(attempt)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) throw new Error(`${label} の取得に失敗しました（${MAX_ATTEMPTS}回試行）: ${message}`)
      console.warn(`  ${label}: 失敗（${message}）。${attempt * 5}秒後に再試行します`)
      await sleep(attempt * 5_000)
    }
  }
  throw new Error('unreachable')
}

/** 建物タイル。取得済みはキャッシュから読む。404（建物の無いタイル）は空ファイルを目印にキャッシュする */
async function fetchBuildingTile(x: number, y: number): Promise<Uint8Array | null> {
  const cachePath = `${TILE_CACHE_DIR}/${x}-${y}.pbf`
  const cached = await readFile(cachePath).catch(() => null)
  if (cached) return cached.length > 0 ? cached : null
  const url = PLATEAU_BUILDINGS_TILES.replace('{z}', String(TILE_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y))
  const res = await fetchWithRetry(`建物タイル ${x}/${y}`, () => fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) }))
  const body = res ? new Uint8Array(await res.arrayBuffer()) : new Uint8Array(0)
  await writeFile(cachePath, body)
  await sleep(WAIT_MS)
  return body.length > 0 ? body : null
}

/** 区域の中の歩行者用の通路と地下・屋内の廊下・階段（地上・屋根付きの分類は stageSpots.ts で行う）。網を作るためノードの番号も取る */
async function fetchPedestrianWays(): Promise<OverpassElement[]> {
  const cachePath = `${CACHE_DIR}/osm-ways-v2-${AREA.id}.json`
  const cached = await readFile(cachePath, 'utf8').catch(() => null)
  if (cached) return JSON.parse(cached)
  const [west, south, east, north] = AREA.bbox
  const query = `[out:json][timeout:120];way["highway"~"^(footway|pedestrian|path|corridor|steps)$"](${south},${west},${north},${east});out body geom;`
  const res = await fetchWithRetry('Overpass（歩行者用の通路）', (attempt) =>
    fetch(OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(150_000),
    }),
  )
  if (!res) throw new Error('Overpass が 404 を返しました')
  const { elements } = (await res.json()) as { elements: OverpassElement[] }
  await writeFile(cachePath, JSON.stringify(elements))
  return elements
}

/** 区域の中の出入口（建物の出入口と地下鉄の出入口）の点。屋根付きの網に接するかは stageSpots.ts で見る */
async function fetchEntrances(): Promise<OverpassElement[]> {
  const cachePath = `${CACHE_DIR}/osm-entrances-${AREA.id}.json`
  const cached = await readFile(cachePath, 'utf8').catch(() => null)
  if (cached) return JSON.parse(cached)
  const [west, south, east, north] = AREA.bbox
  const box = `${south},${west},${north},${east}`
  const query = `[out:json][timeout:120];(node["entrance"](${box});node["railway"="subway_entrance"](${box}););out body;`
  const res = await fetchWithRetry('Overpass（出入口）', (attempt) =>
    fetch(OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(150_000),
    }),
  )
  if (!res) throw new Error('Overpass が 404 を返しました')
  const { elements } = (await res.json()) as { elements: OverpassElement[] }
  await writeFile(cachePath, JSON.stringify(elements))
  return elements
}

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T

function dateFromArgs(): string {
  const i = process.argv.indexOf('--date')
  const date = i >= 0 ? process.argv[i + 1] : DEFAULT_DATE
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error(`--date は YYYY-MM-DD で指定してください: ${date}`)
  return date
}

function generatorName(): string {
  try {
    return `tokyo-green-simulator@${execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}`
  } catch {
    return 'tokyo-green-simulator@unknown'
  }
}

const date = dateFromArgs()
const [west, south, east, north] = AREA.bbox
const proj = localProjection({ lon: (west + east) / 2, lat: (south + north) / 2 })
await mkdir(TILE_CACHE_DIR, { recursive: true })

// 1. 建物：区域の外の建物も影を落とすので、遮蔽を数える距離ぶん広げて取る
const [mWest, mSouth] = proj.toLonLat([...proj.toXY([west, south])].map((v) => v - DEFAULT_MAX_DISTANCE_M))
const [mEast, mNorth] = proj.toLonLat([...proj.toXY([east, north])].map((v) => v + DEFAULT_MAX_DISTANCE_M))
const tiles = tileRange({ west: mWest, south: mSouth, east: mEast, north: mNorth }, TILE_ZOOM)
console.log(`建物タイル ${tiles.length} 枚（z=${TILE_ZOOM}）を読みます`)
const buildings: LocalBuilding[] = []
for (const { x, y } of tiles) {
  const pbf = await fetchBuildingTile(x, y)
  if (pbf) buildings.push(...decodeBuildingTile(pbf, { x, y, z: TILE_ZOOM }, proj))
}
console.log(`  建物（タイルごとの断片） ${buildings.length.toLocaleString()} 件`)
const index = createBuildingIndex(buildings)

// 2. 通路・公園・街路樹
const ways = await fetchPedestrianWays()
const entrances = await fetchEntrances()
const parks = (await readJson<{ features: ParkFeature[] }>('public/data/parks.geojson')).features
const trees = toTreeData(await readJson<TreesColumnar>('public/data/trees.json'))
const cityTrees = (await readJson<{ features: CityTreeFeature[] }>('public/data/city-trees.geojson')).features
console.log(`歩行者用の通路 ${ways.length} 本、出入口 ${entrances.length} 個、公園 ${parks.length.toLocaleString()} 件、街路樹 ${trees.count.toLocaleString()} 本`)

// 街路樹の樹冠：建物と同じく区域から遮蔽を数える距離ぶん広げた範囲の木を使う。
// 区道の街路樹（city-trees.geojson）は路線ごとの樹種・本数だけで単木の位置・高さ・枝張りが無いため、樹冠には入れない
const localTrees: LocalTree[] = []
let estimatedSpread = 0
for (let i = 0; i < trees.count; i++) {
  const lon = trees.positions[i * 2]
  const lat = trees.positions[i * 2 + 1]
  if (lon < mWest || lon > mEast || lat < mSouth || lat > mNorth) continue
  const crown = crownOf(trees.height[i], trees.spread[i])
  if (!crown) continue
  if (!(trees.spread[i] > 0)) estimatedSpread++
  const [x, y] = proj.toXY([lon, lat])
  localTrees.push({ x, y, ...crown })
}
console.log(`  樹冠に使う街路樹 ${localTrees.length.toLocaleString()} 本（うち枝張りを樹高から近似 ${estimatedSpread.toLocaleString()} 本）`)
const treeIndex = createTreeIndex(localTrees)

// 3. 候補地点 → 遮蔽率・天空率・緑の文脈
const candidates = extractCandidateSpots({ ways, parks, index, proj, bbox: AREA.bbox, idPrefix: ID_PREFIX, entrances })
const stage = assembleStage({
  area: AREA,
  date,
  generator: generatorName(),
  candidates,
  index,
  trees: treeIndex,
  proj,
  greenOf: (spot) => {
    const context = computeGreenContext(spot, GREEN_RADIUS_M, { trees, cityTrees, parks })
    if (!context) throw new Error('緑の文脈を数えられませんでした')
    return toStageGreen(context, GREEN_RADIUS_M)
  },
})

// 4. 契約のスキーマと整合性を確かめてから書き出す
const validate = new Ajv2020({ allErrors: true, formats: { date: /^\d{4}-\d{2}-\d{2}$/ } }).compile(await readJson<object>('contracts/stage.schema.json'))
if (!validate(stage)) throw new Error(`スキーマに合いません: ${JSON.stringify(validate.errors?.slice(0, 5))}`)
const integrity = stageIntegrityErrors(stage)
if (integrity.length > 0) throw new Error(`整合性の問題: ${integrity.join(' / ')}`)
await mkdir(dirname(STAGE_OUTPUT_PATH), { recursive: true })
await writeFile(STAGE_OUTPUT_PATH, `${JSON.stringify(stage)}\n`)

// 5. 結果の要約
const kindCounts = new Map<string, number>()
for (const { kind } of stage.spots) kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1)
const byKind = [...kindCounts].map(([kind, n]) => `${kind} ${n}`)
console.log(`\n候補地点 ${stage.spots.length} 件（${byKind.join('、')}）。規則: ${JSON.stringify(DEFAULT_SPOT_RULES)}`)
const covered = stage.spots.filter((s) => s.shelter === 'covered')
const netSizes = new Map<string, number>()
for (const s of covered) netSizes.set(s.shelter_network!, (netSizes.get(s.shelter_network!) ?? 0) + 1)
const largest = [...netSizes.values()].sort((a, b) => b - a).slice(0, 5)
console.log(`うち屋根付き ${covered.length} 件、網 ${netSizes.size} 個（地点の多い網: ${largest.join('、')} 件）`)
const access = stage.spots.filter((s) => s.shelter_access)
const accessByNet = new Map<string, number>()
for (const s of access) accessByNet.set(s.shelter_access!, (accessByNet.get(s.shelter_access!) ?? 0) + 1)
console.log(
  `地上 ${stage.spots.length - covered.length} 件のうち、${DEFAULT_SPOT_RULES.shelterAccessM}m 以内の出入口から網へ入れる地点 ${access.length} 件（${[...accessByNet].map(([n, k]) => `${n} ${k}`).join('、')}）`,
)
console.log('時刻  日影(≥0.5)の割合  平均遮蔽率')
for (let hour = 0; hour < 24; hour++) {
  const values = stage.spots.map((s) => s.hourly[hour].shade_fraction)
  const shaded = values.filter((v) => v >= 0.5).length / values.length
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  console.log(`${String(hour).padStart(2)}時  ${(shaded * 100).toFixed(0).padStart(5)}%  ${mean.toFixed(2).padStart(10)}`)
}
const svf = stage.spots.map((s) => s.sky_view_factor).sort((a, b) => a - b)
const q = (p: number) => svf[Math.min(svf.length - 1, Math.floor(p * svf.length))].toFixed(2)
console.log(`天空率: 最小 ${svf[0].toFixed(2)} / 四分位 ${q(0.25)} / 中央 ${q(0.5)} / ${q(0.75)} / 最大 ${svf[svf.length - 1].toFixed(2)}`)
console.log(`→ ${STAGE_OUTPUT_PATH}（日付 ${date}）`)
