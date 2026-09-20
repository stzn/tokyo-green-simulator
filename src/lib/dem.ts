// 標高タイルのエンコーディング。取得スクリプト（scripts/fetch-dem.ts）とアプリの両方で使う
//
// 地理院標高タイル（dem_png）は x = R*65536 + G*256 + B とし、x >= 2^23 のときは
// (x - 2^24) * 0.01 として負の標高を2の補数で表す。無効値は (128,0,0)。
// deck.glのTerrainLayer（elevationDecoder）もMapLibreのraster-demも線形変換しか持てないため、
// この分岐をそのまま渡せない（海域が +83,886m の壁に、低地が +650m の柱になる）。
// そこで取得時に一度標高へ戻し、線形に復号できる独自形式へ詰め直したタイルを配信する。
//
//   配信形式: h = (R*256 + G) * 0.1 - 1000  （0.1m刻み、Bは未使用で常に0）
//
// Bを使わないのは容量のため。0.1m刻みの最下位を青に入れると画素ごとにばらついてPNGが圧縮できない。

export type Bbox = { west: number; south: number; east: number; north: number }

/**
 * 標高タイルを用意してある範囲（東京23区）。区境界の外接矩形に余裕を持たせた値で、
 * 練馬区の西端・足立区の北端・江戸川区の東端・大田区の南端（羽田沖）まで含む。
 * この外はタイルが無いので読みに行かない
 */
export const DEM_BBOX: Bbox = { west: 139.56, south: 35.5, east: 139.93, north: 35.82 }

/** 配信形式の量子化幅（m） */
const STEP_M = 0.1
/** 配信形式の基準（m）。この分だけ持ち上げて符号なし整数にする */
const BASE_M = 1000

export const MIN_HEIGHT_M = -BASE_M
export const MAX_HEIGHT_M = 65535 * STEP_M - BASE_M

/** deck.glのTerrainLayerにそのまま渡せる線形デコーダ（配信形式に対応） */
export const ELEVATION_DECODER = {
  rScaler: 256 * STEP_M,
  gScaler: STEP_M,
  bScaler: 0,
  offset: -BASE_M,
} as const

/** 地理院標高タイルの画素を標高（m）に読む。無効値はnull */
export function decodeGsiPixel(r: number, g: number, b: number): number | null {
  if (r === 128 && g === 0 && b === 0) return null
  const x = r * 65536 + g * 256 + b
  return (x >= 2 ** 23 ? x - 2 ** 24 : x) * 0.01
}

/** 標高（m）を配信形式の画素に詰める。表現できる範囲を外れた値は端に丸める */
export function encodeHeight(heightM: number): [number, number, number] {
  const clamped = Math.min(Math.max(heightM, MIN_HEIGHT_M), MAX_HEIGHT_M)
  const value = Math.round((clamped + BASE_M) / STEP_M)
  return [value >> 8, value & 0xff, 0]
}

/** 配信形式の画素を標高（m）に読む（ELEVATION_DECODERと同じ式） */
export function decodeHeight(r: number, g: number, b: number): number {
  return r * ELEVATION_DECODER.rScaler + g * ELEVATION_DECODER.gScaler + b * ELEVATION_DECODER.bScaler + ELEVATION_DECODER.offset
}
