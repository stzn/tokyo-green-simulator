// 地理院標高タイル（dem_png）を取得し、線形デコードできる配信形式に詰め替えて public/data/dem/ に保存する。
// 変換が必要な理由は src/lib/dem.ts のコメントを参照（無効値と負値のラップは線形デコーダで表せない）
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { decodeGsiPixel } from '../src/lib/dem'
import { TOKYO_23KU_BBOX, convertGsiPixels, mergeChildTiles, parentTile, tileRange, type Tile } from './lib/dem'

/** 出典: 地理院タイル（標高タイル DEM10B）。利用にあたり出典の明示と、加工した旨の記載が必要 */
const TILE_URL = (z: number, { x, y }: Tile) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`
// z=13 は23区で100枚・約19m/px。地形の起伏を見るには十分で、配信サイズも小さく収まる
const ZOOM = 13
// アプリの最小ズーム（10）まで地形を出せるよう、z=13を間引いて低ズームのタイルも作る。
// MapLibreのterrainはDEMの無いズームだとベースマップを描けないため、下の段を欠かせない
const MIN_ZOOM = 10
const CACHE_DIR = `scripts/.cache/dem-raw/${ZOOM}`
const OUT_ROOT = 'public/data/dem'
const OUT_DIR = `${OUT_ROOT}/${ZOOM}`
// 公開サーバーに負荷をかけないようタイルごとに待機する
const WAIT_MS = 200
const MAX_ATTEMPTS = 4

const TILE_SIZE = 256

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 取得済みのタイルはキャッシュから読む。404（その範囲に標高データ無し）はnull */
async function fetchTile(tile: Tile): Promise<Buffer | null> {
  const cachePath = `${CACHE_DIR}/${tile.x}-${tile.y}.png`
  const cached = await readFile(cachePath).catch(() => null)
  if (cached) return cached.length > 0 ? cached : null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(TILE_URL(ZOOM, tile), {
        headers: { 'User-Agent': 'urban-green-twin-tokyo/0.1 (research prototype)' },
        signal: AbortSignal.timeout(30_000),
      })
      if (res.status === 404) {
        // 「データ無し」もキャッシュして再実行時に再取得しない（空ファイルを目印にする）
        await writeFile(cachePath, Buffer.alloc(0))
        return null
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const png = Buffer.from(await res.arrayBuffer())
      await writeFile(cachePath, png)
      await sleep(WAIT_MS)
      return png
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) throw new Error(`タイル ${tile.x}/${tile.y} の取得に失敗しました（${MAX_ATTEMPTS}回試行）: ${message}`)
      console.warn(`  ${tile.x}/${tile.y}: 失敗（${message}）。${attempt * 5}秒後に再試行します`)
      await sleep(attempt * 5_000)
    }
  }
  throw new Error('unreachable')
}

/** 標高データの無いタイル用に、全画素0mのPNGを1枚だけ作っておく */
function flatTilePng(size: number): Buffer {
  const png = new PNG({ width: size, height: size })
  png.data.set(convertGsiPixels(new Uint8Array(size * size * 4)))
  return PNG.sync.write(png)
}

const tileKey = ({ x, y }: Tile) => `${x}-${y}`

/** 配信形式のタイルをPNGとして書き出す */
async function writeTile(dir: string, tile: Tile, rgba: Uint8Array, size: number): Promise<void> {
  const png = new PNG({ width: size, height: size })
  png.data.set(rgba)
  await writeFile(`${dir}/${tileKey(tile)}.png`, PNG.sync.write(png))
}

await mkdir(CACHE_DIR, { recursive: true })
await mkdir(OUT_DIR, { recursive: true })

const tiles = tileRange(TOKYO_23KU_BBOX, ZOOM)
console.log(`標高タイル ${tiles.length} 枚（z=${ZOOM}）を取得します`)

const pixelsByTile = new Map<string, Uint8Array>()
let converted = 0
let flat = 0
let min = Infinity
let max = -Infinity
for (const tile of tiles) {
  const source = await fetchTile(tile)
  const outPath = `${OUT_DIR}/${tile.x}-${tile.y}.png`
  if (!source) {
    await writeFile(outPath, flatTilePng(TILE_SIZE))
    flat++
    continue
  }
  const png = PNG.sync.read(source)
  // 元データの標高range（ログで妥当性を確かめる用）
  for (let i = 0; i < png.data.length; i += 4) {
    const h = decodeGsiPixel(png.data[i], png.data[i + 1], png.data[i + 2])
    if (h === null) continue
    if (h < min) min = h
    if (h > max) max = h
  }
  png.data.set(convertGsiPixels(png.data))
  pixelsByTile.set(tileKey(tile), new Uint8Array(png.data))
  await writeFile(outPath, PNG.sync.write(png))
  converted++
  if (converted % 20 === 0) console.log(`  ${converted}/${tiles.length} 枚`)
}

console.log(`標高タイル ${converted} 枚 + データ無し ${flat} 枚 → ${OUT_DIR}/`)

// 低ズームのタイルを、1段ずつ間引いて作る
let childPixels = pixelsByTile
for (let zoom = ZOOM - 1; zoom >= MIN_ZOOM; zoom--) {
  const dir = `${OUT_ROOT}/${zoom}`
  await mkdir(dir, { recursive: true })
  const parents = new Map<string, Tile>()
  for (const key of childPixels.keys()) {
    const [x, y] = key.split('-').map(Number)
    const parent = parentTile({ x, y })
    parents.set(tileKey(parent), parent)
  }
  const parentPixels = new Map<string, Uint8Array>()
  for (const parent of parents.values()) {
    const child = (dx: number, dy: number) => childPixels.get(tileKey({ x: parent.x * 2 + dx, y: parent.y * 2 + dy })) ?? null
    const merged = mergeChildTiles({ nw: child(0, 0), ne: child(1, 0), sw: child(0, 1), se: child(1, 1) }, TILE_SIZE)
    await writeTile(dir, parent, merged, TILE_SIZE)
    parentPixels.set(tileKey(parent), merged)
  }
  console.log(`  z=${zoom}: ${parentPixels.size} 枚`)
  childPixels = parentPixels
}
console.log(`元データの標高範囲: ${min.toFixed(2)}m 〜 ${max.toFixed(2)}m`)
