// OpenStreetMap（Overpass API）から23区の行政界を取得し、現在地ミニマップ表示用に単純化して public/data/wards.geojson に保存する
import { setDefaultResultOrder } from 'node:dns'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { OverpassElement } from './lib/parks'
import { TOKYO_23_WARDS } from './lib/tokyoWards'
import { overpassToWard, type WardFeature } from './lib/wards'

// 公開インスタンスは混雑・停止することがあるため、失敗したら次のエンドポイントへ切り替える
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
// 区ごとのOverpass応答（変換前）を保存し、途中で失敗しても再実行時に続きから取得する
const CACHE_DIR = 'scripts/.cache/wards-raw'
const OUT_PATH = 'public/data/wards.geojson'
const WARDS = TOKYO_23_WARDS
// 公開サーバーに負荷をかけないよう区ごとに待機する
const WAIT_MS = 3000
const MAX_ATTEMPTS = 8
// ミニマップでの表示専用なので、頂点数を大きく減らすため粗めの許容誤差にする（実データで検証済み: 1区あたり15〜60点程度）
const SIMPLIFY_TOLERANCE_DEG = 0.0015

// IPv6経路だと overpass-api.de への接続がタイムアウトする環境があるため、IPv4を優先する
setDefaultResultOrder('ipv4first')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function queryOverpass(ward: string): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:120];relation["name"="${ward}"]["admin_level"="7"]["boundary"="administrative"];out geom;`
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
      return ((await res.json()) as { elements: OverpassElement[] }).elements
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) throw new Error(`${ward} の取得に失敗しました（${MAX_ATTEMPTS}回試行）: ${message}`)
      console.warn(`  ${ward}: ${new URL(endpoint).host} で失敗（${message}）。${attempt * 10}秒後に再試行します`)
      await sleep(attempt * 10_000)
    }
  }
  throw new Error('unreachable')
}

async function fetchWard(ward: string): Promise<WardFeature | null> {
  const cachePath = `${CACHE_DIR}/${ward}.json`
  const cached = await readFile(cachePath, 'utf8').catch(() => null)
  let elements: OverpassElement[]
  if (cached) {
    elements = JSON.parse(cached)
  } else {
    elements = await queryOverpass(ward)
    await writeFile(cachePath, JSON.stringify(elements))
    await sleep(WAIT_MS)
  }
  return overpassToWard(elements, ward, SIMPLIFY_TOLERANCE_DEG)
}

await mkdir(CACHE_DIR, { recursive: true })
const features: WardFeature[] = []
for (const ward of WARDS) {
  const feature = await fetchWard(ward)
  if (feature) features.push(feature)
  console.log(`  ${ward}: ${feature ? '取得' : '取得失敗'}`)
}

await mkdir('public/data', { recursive: true })
await writeFile(OUT_PATH, JSON.stringify({ type: 'FeatureCollection', source: 'OpenStreetMap contributors (ODbL)', fetchedAt: new Date().toISOString(), features }))
console.log(`行政界 ${features.length}/${WARDS.length} 件 → ${OUT_PATH}`)
