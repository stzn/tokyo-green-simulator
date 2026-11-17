// 建物（外周と高さ）と街路樹の樹冠による日射の遮蔽と、建物による天空率。
// 地点ごとに「方位ごとの地平線の仰角（horizon profile）」を一度求め、
// 太陽の高度がその方位の仰角より低ければ日影、天空率は仰角から近似する。
// 樹冠は円板（円柱）とみなし、地点から太陽への線が通れば透過率の分だけ日射を通す（下の「街路樹の樹冠」）。
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

// ---- 街路樹の樹冠 ----
// 仮定（README の「街路樹の樹冠による遮蔽」にも書いている）:
// - 樹冠は幹の位置を中心とする半径 crownRadiusM（= 枝張り/2）の円板で、高さ 0.6H〜1.0H（H = 樹高）を占める円柱とする。
//   枝下高を樹高の 6 割とするのは街路樹の剪定（建築限界 4.5 m 程度の確保）と一般的な樹形からの目安
// - 地点から太陽への線が樹冠を通れば、日射の透過率を 0.2 とする（遮蔽 0.8）。
//   都市の街路樹の夏季の日射透過率はおおむね 0.1〜0.3 と報告されており、その中央の値。
//   データに落葉・常緑の別が無いため、季節によらず葉の茂った夏の値を使う（冬の落葉樹では遮蔽を過大に見積もる）
// - 線が複数の樹冠を通っても透過率は重ねない（並木の連なった樹冠を 1 枚の葉群とみなす。遮蔽を過大にしない側）

/** 樹冠の日射透過率（夏の値を仮定） */
export const CANOPY_TRANSMITTANCE = 0.2
/** 樹冠の下端の高さの、樹高に対する比 */
export const CROWN_BASE_RATIO = 0.6

/** 地点まわりの局所座標の木。x, y は幹の位置[m]、heightM は樹高、crownRadiusM は樹冠の半径 */
export type LocalTree = { x: number; y: number; heightM: number; crownRadiusM: number }

/**
 * 枝張り[m]を樹高[m]から近似する: 枝張り ≈ 0.40 × 樹高 + 0.36。
 * 東京都の街路樹データ（public/data/trees.json）のうち、樹高・枝張りが両方ある 92,152 本への最小二乗の直線
 */
export function estimateCrownSpreadM(heightM: number): number {
  return 0.4 * heightM + 0.36
}

/** 樹高・枝張り（欠損は負の値）から樹冠を作る。樹高が無い木は数えない（null） */
export function crownOf(heightM: number, spreadM: number): { heightM: number; crownRadiusM: number } | null {
  if (!(heightM > 0)) return null
  const spread = spreadM > 0 ? spreadM : estimateCrownSpreadM(heightM)
  return { heightM, crownRadiusM: spread / 2 }
}

export type TreeIndex = { cellM: number; trees: LocalTree[]; cells: Map<string, number[]> }

/** 木を格子（既定50m）に振り分ける（樹冠の広がりの分だけ周りのセルにも入れる） */
export function createTreeIndex(trees: LocalTree[], cellM = 50): TreeIndex {
  const cells = new Map<string, number[]>()
  trees.forEach((t, i) => addToCells(cells, cellM, t.x - t.crownRadiusM, t.y - t.crownRadiusM, t.x + t.crownRadiusM, t.y + t.crownRadiusM, i))
  return { cellM, trees, cells }
}

/** 地点から maxDistanceM 以内（幹までの距離）の木を、地点を原点にした座標で返す */
export function nearbyCrowns(index: TreeIndex, [x, y]: LocalPoint, maxDistanceM = DEFAULT_MAX_DISTANCE_M): LocalTree[] {
  const crowns: LocalTree[] = []
  for (const id of collect(index.cells, index.cellM, [x, y], maxDistanceM)) {
    const t = index.trees[id]
    if (Math.hypot(t.x - x, t.y - y) > maxDistanceM) continue
    crowns.push({ ...t, x: t.x - x, y: t.y - y })
  }
  return crowns
}

/**
 * 地点（原点・地面）から太陽への線が樹冠を通るときの遮蔽（1 − 透過率）、通らなければ 0。
 * 線は水平距離 t のとき高さ t·tan(高度) なので、樹冠の高さ 0.6H〜H を通る区間は t ∈ [0.6H, H] / tan(高度)。
 * その水平の線分が樹冠の円（半径 r）に掛かれば通るとみなす
 */
export function canopyShadeForSun(crowns: LocalTree[], azimuthDeg: number, altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 0
  const ux = Math.sin(toRad(azimuthDeg))
  const uy = Math.cos(toRad(azimuthDeg))
  // 真上の太陽では tan が発散するので 0 として扱う（線分は原点の 1 点）
  const cot = altitudeDeg >= 90 ? 0 : 1 / Math.tan(toRad(altitudeDeg))
  for (const t of crowns) {
    const t0 = CROWN_BASE_RATIO * t.heightM * cot
    const t1 = t.heightM * cot
    if (distanceToSegment(t0 * ux - t.x, t0 * uy - t.y, t1 * ux - t.x, t1 * uy - t.y) <= t.crownRadiusM) return 1 - CANOPY_TRANSMITTANCE
  }
  return 0
}

/** 建物と樹冠の遮蔽の合成: 1 − (1 − 建物)(1 − 樹冠)（それぞれを独立な透過とみなす） */
export function combineShade(building: number, canopy: number): number {
  return 1 - (1 - building) * (1 - canopy)
}

/**
 * 指定日の hour 時台（hour:00〜hour:59、日本時間）の日射遮蔽率。
 * 1時間を samplesPerHour 等分した各時刻の中央で太陽位置を求め、各時刻の遮蔽を平均する。
 * 各時刻の遮蔽は、建物（夜 = 太陽高度 ≤ 0、または建物の仰角より太陽が低ければ 1、それ以外は 0）と
 * 樹冠（crowns、地点を原点にした座標。canopyShadeForSun）を combineShade で合わせたもの
 */
export function shadeFractionForHour(
  profile: Float64Array,
  date: string,
  hour: number,
  latDeg: number,
  lonDeg: number,
  { samplesPerHour = 12, crowns = [] }: { samplesPerHour?: number; crowns?: LocalTree[] } = {},
): number {
  let shaded = 0
  for (let k = 0; k < samplesPerHour; k++) {
    const minute = ((k + 0.5) * 60) / samplesPerHour
    const sun = solarPosition(jstDate(date, hour, minute), latDeg, lonDeg)
    const building = sun.altitudeDeg <= 0 || sun.altitudeDeg < profile[Math.floor(sun.azimuthDeg) % HORIZON_BINS] ? 1 : 0
    shaded += building === 1 ? 1 : combineShade(building, canopyShadeForSun(crowns, sun.azimuthDeg, sun.altitudeDeg))
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
