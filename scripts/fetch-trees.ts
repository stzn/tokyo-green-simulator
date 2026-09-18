// 東京都オープンデータ「都道の街路樹（23区）」を取得し public/data/trees.json に保存する
import { mkdir, writeFile } from 'node:fs/promises'
import { parseTreesCsv } from './lib/parseTrees'

const SOURCE_URL = 'https://www.opendata.metro.tokyo.lg.jp/kensetsu/tokyo_gairoju.csv'
const OUT_PATH = 'public/data/trees.json'

const res = await fetch(SOURCE_URL)
if (!res.ok) throw new Error(`街路樹CSVの取得に失敗しました: HTTP ${res.status}`)
// 配布CSVはShift_JIS
const csv = new TextDecoder('shift_jis').decode(await res.arrayBuffer())
const data = parseTreesCsv(csv)

await mkdir('public/data', { recursive: true })
await writeFile(OUT_PATH, JSON.stringify({ source: SOURCE_URL, fetchedAt: new Date().toISOString(), ...data }))
console.log(`街路樹 ${data.count.toLocaleString()} 本 / 樹種 ${data.dict.species.length} / 区 ${data.dict.wards.length} → ${OUT_PATH}`)
