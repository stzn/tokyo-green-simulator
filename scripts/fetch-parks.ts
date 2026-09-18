// OpenStreetMap（Overpass API）から23区の公園ポリゴンを区ごとに取得し public/data/parks.geojson に保存する
import { setDefaultResultOrder } from 'node:dns'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { overpassToParks, type ParkFeature } from './lib/parks'

// 公開インスタンスは混雑・停止することがあるため、失敗したら次のエンドポイントへ切り替える
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
// 区ごとのOverpass応答（変換前）を保存し、途中で失敗しても再実行時に続きから取得する。
// 変換ルールを変えたときも、再取得せずに作り直せる
const CACHE_DIR = 'scripts/.cache/parks-raw'
const OUT_PATH = 'public/data/parks.geojson'
const WARDS = [
  '千代田区', '中央区', '港区', '新宿区', '文京区', '台東区', '墨田区', '江東区', '品川区', '目黒区', '大田区', '世田谷区',
  '渋谷区', '中野区', '杉並区', '豊島区', '北区', '荒川区', '板橋区', '練馬区', '足立区', '葛飾区', '江戸川区',
]
// 公開サーバーに負荷をかけないよう区ごとに待機する
const WAIT_MS = 3000
const MIN_AREA_M2 = 200 // 小さすぎる植栽帯は除外
const MAX_ATTEMPTS = 8

// IPv6経路だと overpass-api.de への接続がタイムアウトする環境があるため、IPv4を優先する
setDefaultResultOrder('ipv4first')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function queryOverpass(ward: string): Promise<Parameters<typeof overpassToParks>[0]> {
  const query = `[out:json][timeout:120];area["name"="${ward}"]["admin_level"="7"]->.a;(way["leisure"="park"](area.a);relation["leisure"="park"](area.a););out geom;`
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const endpoint = ENDPOINTS[(attempt - 1) % ENDPOINTS.length]
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'urban-green-twin-tokyo/0.1 (research prototype)' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(150_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return ((await res.json()) as { elements: Parameters<typeof overpassToParks>[0] }).elements
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) throw new Error(`${ward} の取得に失敗しました（${MAX_ATTEMPTS}回試行）: ${message}`)
      console.warn(`  ${ward}: ${new URL(endpoint).host} で失敗（${message}）。${attempt * 10}秒後に再試行します`)
      await sleep(attempt * 10_000)
    }
  }
  throw new Error('unreachable')
}

async function fetchWard(ward: string): Promise<ParkFeature[]> {
  const cachePath = `${CACHE_DIR}/${ward}.json`
  const cached = await readFile(cachePath, 'utf8').catch(() => null)
  let elements: Parameters<typeof overpassToParks>[0]
  if (cached) {
    elements = JSON.parse(cached)
  } else {
    elements = await queryOverpass(ward)
    await writeFile(cachePath, JSON.stringify(elements))
    await sleep(WAIT_MS)
  }
  return overpassToParks(elements, ward).features.filter((f) => f.properties.areaM2 >= MIN_AREA_M2)
}

await mkdir(CACHE_DIR, { recursive: true })
const features: ParkFeature[] = []
const seen = new Set<string>()
for (const ward of WARDS) {
  const parks = await fetchWard(ward)
  // 区境をまたぐ公園は最初に見つかった区に帰属させる
  const fresh = parks.filter((p) => !seen.has(p.properties.id))
  fresh.forEach((p) => seen.add(p.properties.id))
  features.push(...fresh)
  console.log(`  ${ward}: ${fresh.length} 件`)
}

await mkdir('public/data', { recursive: true })
await writeFile(OUT_PATH, JSON.stringify({ type: 'FeatureCollection', source: 'OpenStreetMap contributors (ODbL)', fetchedAt: new Date().toISOString(), features }))
console.log(`公園 ${features.length.toLocaleString()} 件 → ${OUT_PATH}`)
