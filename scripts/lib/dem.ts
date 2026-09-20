import { DEM_BBOX, decodeGsiPixel, decodeHeight, encodeHeight, type Bbox } from '../../src/lib/dem'

// 標高タイルの取得範囲（fetch-dem.ts で使う）。アプリが読む範囲と同じものを使う
export const TOKYO_23KU_BBOX = DEM_BBOX
export type { Bbox }

export type Tile = { x: number; y: number }

/** 緯度経度 → Web Mercator（XYZ）のタイル座標 */
export function lonLatToTile(lon: number, lat: number, zoom: number): Tile {
  const n = 2 ** zoom
  const rad = (lat * Math.PI) / 180
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  }
}

/** bboxに重なるタイルをすべて列挙する（北西から南東へ） */
export function tileRange(bbox: Bbox, zoom: number): Tile[] {
  const nw = lonLatToTile(bbox.west, bbox.north, zoom)
  const se = lonLatToTile(bbox.east, bbox.south, zoom)
  const tiles: Tile[] = []
  for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) tiles.push({ x, y })
  return tiles
}

/**
 * 地理院標高タイルのRGBA画素列を、配信形式（src/lib/dem.ts のELEVATION_DECODERで読める形）に詰め替える。
 * 無効値（海域・範囲外）は標高0mとして扱う
 */
export function convertGsiPixels(rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const h = decodeGsiPixel(rgba[i], rgba[i + 1], rgba[i + 2]) ?? 0
    const [r, g, b] = encodeHeight(h)
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = 255
  }
  return out
}

/** 1段上（低ズーム）のタイル座標 */
export const parentTile = ({ x, y }: Tile): Tile => ({ x: x >> 1, y: y >> 1 })

export type ChildTiles = { nw: Uint8Array | null; ne: Uint8Array | null; sw: Uint8Array | null; se: Uint8Array | null }

/**
 * 配信形式の子タイル4枚を1枚（1段上のズーム）にまとめる。
 * 各画素は子タイルの2×2画素の平均標高。欠けている子タイルの範囲は標高0m（海面）とする
 */
export function mergeChildTiles(children: ChildTiles, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  const half = size / 2
  const quadrants: [Uint8Array | null, number, number][] = [
    [children.nw, 0, 0],
    [children.ne, half, 0],
    [children.sw, 0, half],
    [children.se, half, half],
  ]
  for (const [child, offsetX, offsetY] of quadrants) {
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        let h = 0
        if (child) {
          // 子タイルの2×2画素を平均する
          let sum = 0
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const i = ((y * 2 + dy) * size + (x * 2 + dx)) * 4
              sum += decodeHeight(child[i], child[i + 1], child[i + 2])
            }
          }
          h = sum / 4
        }
        const [r, g, b] = encodeHeight(h)
        const o = ((y + offsetY) * size + (x + offsetX)) * 4
        out.set([r, g, b, 255], o)
      }
    }
  }
  return out
}
