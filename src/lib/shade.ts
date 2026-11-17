// 建物（外周と高さ）による日射の遮蔽と天空率。
// 地点ごとに「方位ごとの地平線の仰角（horizon profile）」を一度求め、
// 太陽の高度がその方位の仰角より低ければ日影、天空率は仰角から近似する。
// 座標は区域の中心を原点にした局所の平面（x=東[m]、y=北[m]）で扱う。地形の起伏は見ない
import { jstDate, solarPosition } from './solar'
import { pointInRing } from './geo'

export type LocalPoint = [number, number]
/** 建物の外周（穴は使わない）と高さ[m] */
export type LocalBuilding = { rings: LocalPoint[][]; heightM: number }

/** 方位の分割数（1°刻み）。bin i は方位 [i, i+1)° */
export const HORIZON_BINS = 360
/** 遮蔽を数える距離の既定値[m] */
export const DEFAULT_MAX_DISTANCE_M = 500

const EARTH_RADIUS_M = 6371008.8
const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** 原点のまわり数km程度で使う、緯度で補正した正距円筒の平面座標 */
export function localProjection(origin: { lat: number; lon: number }) {
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M
  const mPerDegLon = mPerDegLat * Math.cos(toRad(origin.lat))
  return {
    toXY: ([lon, lat]: number[]): LocalPoint => [(lon - origin.lon) * mPerDegLon, (lat - origin.lat) * mPerDegLat],
    toLonLat: ([x, y]: number[]): [number, number] => [origin.lon + x / mPerDegLon, origin.lat + y / mPerDegLat],
  }
}

type Edge = { ax: number; ay: number; bx: number; by: number; heightM: number }

export type BuildingIndex = {
  cellM: number
  edges: Edge[]
  buildings: LocalBuilding[]
  /** セルのキー → そのセルに掛かる辺の番号 */
  edgeCells: Map<string, number[]>
  /** セルのキー → そのセルに掛かる建物の番号 */
  buildingCells: Map<string, number[]>
}

const cellKey = (cx: number, cy: number) => `${cx},${cy}`

function addToCells(cells: Map<string, number[]>, cellM: number, minX: number, minY: number, maxX: number, maxY: number, id: number) {
  for (let cx = Math.floor(minX / cellM); cx <= Math.floor(maxX / cellM); cx++) {
    for (let cy = Math.floor(minY / cellM); cy <= Math.floor(maxY / cellM); cy++) {
      const key = cellKey(cx, cy)
      const list = cells.get(key)
      if (list) list.push(id)
      else cells.set(key, [id])
    }
  }
}

/** 建物の辺と外周を格子（既定50m）に振り分けて、近くの建物だけを引けるようにする */
export function createBuildingIndex(buildings: LocalBuilding[], cellM = 50): BuildingIndex {
  const edges: Edge[] = []
  const edgeCells = new Map<string, number[]>()
  const buildingCells = new Map<string, number[]>()
  buildings.forEach((building, bi) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const ring of building.rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        minX = Math.min(minX, a[0])
        minY = Math.min(minY, a[1])
        maxX = Math.max(maxX, a[0])
        maxY = Math.max(maxY, a[1])
        if (a[0] === b[0] && a[1] === b[1]) continue
        const id = edges.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], heightM: building.heightM }) - 1
        addToCells(edgeCells, cellM, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), id)
      }
    }
    if (minX <= maxX) addToCells(buildingCells, cellM, minX, minY, maxX, maxY, bi)
  })
  return { cellM, edges, buildings, edgeCells, buildingCells }
}

/** 点のまわり radiusM の正方形に掛かるセルから、番号を重複なく集める */
function collect(cells: Map<string, number[]>, cellM: number, [x, y]: LocalPoint, radiusM: number): Set<number> {
  const ids = new Set<number>()
  for (let cx = Math.floor((x - radiusM) / cellM); cx <= Math.floor((x + radiusM) / cellM); cx++) {
    for (let cy = Math.floor((y - radiusM) / cellM); cy <= Math.floor((y + radiusM) / cellM); cy++) {
      for (const id of cells.get(cellKey(cx, cy)) ?? []) ids.add(id)
    }
  }
  return ids
}

// 原点から線分 (ax,ay)-(bx,by) までの距離
function distanceToSegment(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/** 点が建物の外周の内側にあるか */
export function isInsideBuilding(index: BuildingIndex, point: LocalPoint): boolean {
  for (const bi of collect(index.buildingCells, index.cellM, point, 0)) {
    if (index.buildings[bi].rings.some((ring) => pointInRing(ring, point[0], point[1]))) return true
  }
  return false
}

/** 最寄りの建物の壁（外周の辺）までの距離[m]。searchM 以内に無ければ Infinity */
export function nearestWallDistanceM(index: BuildingIndex, [x, y]: LocalPoint, searchM: number): number {
  let min = Infinity
  for (const id of collect(index.edgeCells, index.cellM, [x, y], searchM)) {
    const e = index.edges[id]
    min = Math.min(min, distanceToSegment(e.ax - x, e.ay - y, e.bx - x, e.by - y))
  }
  return min <= searchM ? min : Infinity
}

/**
 * 方位ごと（1°刻み）の、建物がつくる地平線の仰角[°]。
 * 各方位の中心へ伸ばした半直線が辺と交わる距離 d と建物の高さ H から atan(H/d) を求め、最大を取る
 * （手前の壁ほど仰角が大きいので、奥の壁や同じ建物の裏側は自然に隠れる）。
 * 地点の高さは地面（0m）とし、maxDistanceM より遠い交点は数えない
 */
export function horizonProfile(index: BuildingIndex, point: LocalPoint, { maxDistanceM = DEFAULT_MAX_DISTANCE_M } = {}): Float64Array {
  const profile = new Float64Array(HORIZON_BINS)
  const [px, py] = point
  for (const id of collect(index.edgeCells, index.cellM, point, maxDistanceM)) {
    const e = index.edges[id]
    const ax = e.ax - px
    const ay = e.ay - py
    const bx = e.bx - px
    const by = e.by - py
    if (distanceToSegment(ax, ay, bx, by) > maxDistanceM) continue
    // 辺の両端の方位（北から時計回り）と、短い向きに測った開き
    const azA = toDeg(Math.atan2(ax, ay))
    const span = ((toDeg(Math.atan2(bx, by)) - azA + 540) % 360) - 180
    // 地点が辺の上にある（開きが180°）ときは方位が決まらないので数えない
    if (Math.abs(span) >= 179.999) continue
    const start = Math.min(azA, azA + span)
    const end = Math.max(azA, azA + span)
    const ex = bx - ax
    const ey = by - ay
    const aCrossE = ax * ey - ay * ex
    for (let i = Math.ceil(start - 0.5); i <= Math.floor(end - 0.5); i++) {
      const theta = toRad(i + 0.5)
      const ux = Math.sin(theta)
      const uy = Math.cos(theta)
      const uCrossE = ux * ey - uy * ex
      if (uCrossE === 0) continue
      const t = aCrossE / uCrossE
      if (t <= 0 || t > maxDistanceM) continue
      const bin = ((i % HORIZON_BINS) + HORIZON_BINS) % HORIZON_BINS
      const angle = toDeg(Math.atan(e.heightM / t))
      if (angle > profile[bin]) profile[bin] = angle
    }
  }
  return profile
}

/**
 * 指定日の hour 時台（hour:00〜hour:59、日本時間）の日射遮蔽率。
 * 1時間を samplesPerHour 等分した各時刻の中央で太陽位置を求め、
 * 夜（太陽高度 ≤ 0）または建物の仰角より太陽が低い時刻を「遮蔽」として割合を取る
 */
export function shadeFractionForHour(
  profile: Float64Array,
  date: string,
  hour: number,
  latDeg: number,
  lonDeg: number,
  samplesPerHour = 12,
): number {
  let shaded = 0
  for (let k = 0; k < samplesPerHour; k++) {
    const minute = ((k + 0.5) * 60) / samplesPerHour
    const sun = solarPosition(jstDate(date, hour, minute), latDeg, lonDeg)
    if (sun.altitudeDeg <= 0) shaded++
    else if (sun.altitudeDeg < profile[Math.floor(sun.azimuthDeg) % HORIZON_BINS]) shaded++
  }
  return shaded / samplesPerHour
}

/**
 * 天空率（水平面から見た天空の割合）。方位ごとの仰角 β から 1 − mean(sin²β) で近似する
 * （各方位の天空を、仰角 β の壁が無限に続く谷として扱う一般的な近似）
 */
export function skyViewFactor(profile: Float64Array): number {
  let sum = 0
  for (const beta of profile) sum += Math.sin(toRad(beta)) ** 2
  return 1 - sum / profile.length
}
