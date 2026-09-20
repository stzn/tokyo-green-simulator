// 東京都都市整備局「緑のオープンデータ（GISデータ）」の街路樹シェープファイルを取得し、
// 23区の区市町村道ぶんを public/data/city-trees.geojson に保存する。
//
// 同じZIPには区部都道の単木データ（144,183点）も入っているが、それは既存の trees.json と同じものなので使わない。
// 区市町村道は単木の位置が公開されておらず、路線の線に樹種と本数が付く形で配布されている
import AdmZip from 'adm-zip'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { open } from 'shapefile'
import { simplifyRing, type Position } from '../src/lib/geo'
import { isTokyo23Ward, toCityTreeRoute, toWgs84, type CityTreeAttributes } from './lib/cityTrees'

const SOURCE_URL = 'https://data.storage.data.metro.tokyo.lg.jp/toshiseibi/02_gairoju.zip'
const CACHE_PATH = 'scripts/.cache/city-trees/02_gairoju.zip'
const OUT_PATH = 'public/data/city-trees.geojson'
// 道路の形をなぞる線なので、区境界（0.0015度）よりずっと細かく残す。約5m相当
const SIMPLIFY_TOLERANCE_DEG = 0.00005

/** ZIP内のファイル名はShift_JISで文字化けするため、末尾のASCII部分で見分ける */
const endsWith = (name: string, suffix: string) => name.toLowerCase().endsWith(suffix)

async function fetchZip(): Promise<Buffer> {
  const cached = await readFile(CACHE_PATH).catch(() => null)
  if (cached) {
    console.log('キャッシュを使います:', CACHE_PATH)
    return cached
  }
  console.log('ダウンロード中:', SOURCE_URL)
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(300_000) })
  if (!res.ok) throw new Error(`街路樹シェープファイルの取得に失敗しました: HTTP ${res.status}`)
  const zip = Buffer.from(await res.arrayBuffer())
  await mkdir('scripts/.cache/city-trees', { recursive: true })
  await writeFile(CACHE_PATH, zip)
  return zip
}

type LineGeometry = { type: 'LineString'; coordinates: Position[] } | { type: 'MultiLineString'; coordinates: Position[][] }

/** 第9系の座標を緯度経度に直し、頂点を間引く */
function toWgs84Geometry(geometry: LineGeometry): LineGeometry {
  const line = (points: Position[]) => simplifyRing(points.map((p) => toWgs84([p[0], p[1]])), SIMPLIFY_TOLERANCE_DEG)
  return geometry.type === 'LineString'
    ? { type: 'LineString', coordinates: line(geometry.coordinates) }
    : { type: 'MultiLineString', coordinates: geometry.coordinates.map(line) }
}

const zip = new AdmZip(await fetchZip())
const entries = zip.getEntries()
const entryOf = (suffix: string) => {
  const entry = entries.find((e) => endsWith(e.entryName, suffix))
  if (!entry) throw new Error(`ZIPに ${suffix} が見つかりません`)
  return entry.getData()
}

// 路線単位（多摩部都道・区市町村道）のシェープファイルを読む
const source = await open(entryOf('_line.shp'), entryOf('_line.dbf'), { encoding: 'shift-jis' })

type Feature = { type: 'Feature'; geometry: LineGeometry; properties: ReturnType<typeof toCityTreeRoute> }
const features: Feature[] = []
let known = 0
let unknown = 0
let total = 0
let skipped = 0

for (let r = await source.read(); !r.done; r = await source.read()) {
  const route = toCityTreeRoute((r.value.properties ?? {}) as CityTreeAttributes)
  if (!isTokyo23Ward(route.ward)) {
    skipped++
    continue
  }
  if (route.count === null) unknown++
  else {
    known++
    total += route.count
  }
  features.push({ type: 'Feature', geometry: toWgs84Geometry(r.value.geometry as unknown as LineGeometry), properties: route })
}

await mkdir('public/data', { recursive: true })
await writeFile(
  OUT_PATH,
  JSON.stringify({
    type: 'FeatureCollection',
    source: SOURCE_URL,
    note: '東京都都市整備局「緑のオープンデータ（GISデータ）」街路樹（多摩部都道、区市町村道）のうち23区ぶん',
    fetchedAt: new Date().toISOString(),
    features,
  }),
)

const [lon, lat] = (features[0].geometry.type === 'LineString' ? features[0].geometry.coordinates : features[0].geometry.coordinates[0])[0]
console.log(`区道の街路樹 ${features.length.toLocaleString()} 路線（23区外 ${skipped.toLocaleString()} 路線は除外） → ${OUT_PATH}`)
console.log(`  本数の分かる ${known.toLocaleString()} 路線の合計 ${total.toLocaleString()} 本 / 本数不明 ${unknown.toLocaleString()} 路線`)
console.log(`  先頭の座標: ${lon}, ${lat}（東京23区は経度139.5〜139.95・緯度35.5〜35.85）`)
