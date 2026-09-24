// 軽量な測地計算（turf.js 相当の球面近似）。依存を増やさないため自前実装。

export type Position = [number, number] | number[]
/** 1つ目が外周、2つ目以降が穴 */
export type PolygonRings = Position[][]
/** GeoJSON風のポリゴン形状（座標はPolygonRings/PolygonRings[]と同じ形） */
export type Geometry = { type: 'Polygon'; coordinates: PolygonRings } | { type: 'MultiPolygon'; coordinates: PolygonRings[] }

const EARTH_RADIUS_M = 6371008.8
const toRad = (deg: number) => (deg * Math.PI) / 180

// 球面上のリング面積（Chamberlain & Duquette の近似式）。向きに依存しないよう絶対値を返す
function ringAreaM2(ring: Position[]): number {
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i++) {
    const p1 = ring[i]
    const p2 = ring[(i + 1) % n]
    const p3 = ring[(i + 2) % n]
    total += (toRad(p3[0]) - toRad(p1[0])) * Math.sin(toRad(p2[1]))
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

/** 2点間の距離[m]（球面近似） */
export function distanceM(a: Position, b: Position): number {
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** ポリゴン面積[m²]。穴は差し引く */
export function polygonAreaM2(rings: PolygonRings): number {
  if (rings.length === 0) return 0
  const [outer, ...holes] = rings
  return Math.max(0, holes.reduce((area, hole) => area - ringAreaM2(hole), ringAreaM2(outer)))
}

/** 外周リングの長さ[m]（壁面積の算出用なので穴は含めない） */
export function polygonPerimeterM(rings: PolygonRings): number {
  const outer = rings[0]
  if (!outer || outer.length < 2) return 0
  let length = 0
  for (let i = 0; i < outer.length - 1; i++) length += distanceM(outer[i], outer[i + 1])
  return length
}

/**
 * リングを頂点の重心まわりに factor 倍する（緑化範囲の演出用）。
 * z を指定すると各頂点に高さを付ける
 */
export function scaleRing(ring: Position[], factor: number, z?: number): Position[] {
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const vertices = closed ? ring.slice(0, -1) : ring
  const cx = vertices.reduce((s, p) => s + p[0], 0) / vertices.length
  const cy = vertices.reduce((s, p) => s + p[1], 0) / vertices.length
  const scaled = vertices.map((p) => {
    const q = [cx + (p[0] - cx) * factor, cy + (p[1] - cy) * factor]
    return z === undefined ? q : [...q, z]
  })
  return closed ? [...scaled, scaled[0]] : scaled
}

// 点から線分（両端が同じ点なら1点）までの垂直距離。単位は入力座標と同じ（度）
function perpendicularDistance(point: Position, lineStart: Position, lineEnd: Position): number {
  const [x, y] = point
  const [x1, y1] = lineStart
  const [x2, y2] = lineEnd
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(x - cx, y - cy)
}

/**
 * リング（折れ線）をRamer-Douglas-Peuckerで単純化する。tolerance は入力座標と同じ単位（度）。
 * 閉じたリング（始点=終点）にもそのまま使える。ミニマップ表示など、精密さより頂点数の削減を優先する用途向け
 */
export function simplifyRing(points: Position[], tolerance: number): Position[] {
  if (points.length <= 2) return points
  const start = points[0]
  const end = points[points.length - 1]
  let maxDist = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end)
    if (dist > maxDist) {
      maxDist = dist
      index = i
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyRing(points.slice(0, index + 1), tolerance)
    const right = simplifyRing(points.slice(index), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [start, end]
}

// --- 表示範囲（Extent）との重なり判定（エリア集計用） ---

type Bounds = { west: number; south: number; east: number; north: number }

export function containsPoint(extent: Bounds, lon: number, lat: number): boolean {
  return lon >= extent.west && lon <= extent.east && lat >= extent.south && lat <= extent.north
}

/** Liang-Barsky法で、線分が矩形と交わるかを判定する */
function segmentIntersectsExtent(extent: Bounds, a: Position, b: Position): boolean {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  return (
    clip(-dx, a[0] - extent.west) &&
    clip(dx, extent.east - a[0]) &&
    clip(-dy, a[1] - extent.south) &&
    clip(dy, extent.north - a[1])
  )
}

/** 折れ線が範囲と重なるか。頂点が範囲の外でも、線分が範囲を横切れば重なる */
export function pathIntersectsExtent(extent: Bounds, path: Position[]): boolean {
  if (path.length === 1) return containsPoint(extent, path[0][0], path[0][1])
  for (let i = 0; i < path.length - 1; i++) {
    if (segmentIntersectsExtent(extent, path[i], path[i + 1])) return true
  }
  return false
}

/** 点がリングの内側にあるか（偶奇規則） */
export function pointInRing(ring: Position[], lon: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** リング（ポリゴンの外周）が範囲と重なるか。範囲がポリゴンの内側に収まっている場合も重なりとする */
export function ringIntersectsExtent(extent: Bounds, ring: Position[]): boolean {
  if (pathIntersectsExtent(extent, ring)) return true
  // 辺が交わらなくても、範囲の中心がポリゴンの内側にあれば重なる
  return pointInRing(ring, (extent.west + extent.east) / 2, (extent.south + extent.north) / 2)
}

/**
 * 点から折れ線までの最短距離[m]。点のまわり数百m程度を想定し、緯度で補正した平面近似で測る
 * （経度1度の長さは cos(緯度) 倍）。1点だけの線はその点までの距離
 */
export function distanceToPathM(point: Position, path: Position[]): number {
  if (path.length === 0) return Infinity
  if (path.length === 1) return distanceM(point, path[0])
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M
  const mPerDegLon = mPerDegLat * Math.cos(toRad(point[1]))
  let min = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const ax = (path[i][0] - point[0]) * mPerDegLon
    const ay = (path[i][1] - point[1]) * mPerDegLat
    const bx = (path[i + 1][0] - point[0]) * mPerDegLon
    const by = (path[i + 1][1] - point[1]) * mPerDegLat
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    // 点は原点。線分上の最近点のパラメータ t を [0,1] に収める
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return min
}
