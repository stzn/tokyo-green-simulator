// Overpass API（out geom）の応答 → 公園ポリゴンのGeoJSON
import { polygonAreaM2, type Geometry, type Position } from '../../src/lib/geo'

type LatLon = { lat: number; lon: number }

export type OverpassElement = {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: LatLon[]
  members?: { type: string; role: string; geometry?: LatLon[] }[]
}

export type ParkProperties = {
  id: string
  name: string
  ward: string
  areaM2: number
  manager: string
  managerEstimated: boolean
}

export type ParkFeature = {
  type: 'Feature'
  geometry: Geometry
  properties: ParkProperties
}

export type ParkCollection = { type: 'FeatureCollection'; features: ParkFeature[] }

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
const toPositions = (g: LatLon[]): Position[] => g.map((p) => [round6(p.lon), round6(p.lat)])
const samePoint = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
const isClosed = (ring: Position[]) => ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])

/** 分割されたwayの断片を端点でつなぎ、閉じたリングだけを返す */
export function joinRings(segments: Position[][]): Position[][] {
  const rest = segments.filter((s) => s.length >= 2).map((s) => [...s])
  const rings: Position[][] = []
  while (rest.length > 0) {
    let ring = rest.shift()!
    let extended = true
    while (!isClosed(ring) && extended) {
      extended = false
      const tail = ring[ring.length - 1]
      for (let i = 0; i < rest.length; i++) {
        const seg = rest[i]
        if (samePoint(seg[0], tail)) ring = ring.concat(seg.slice(1))
        else if (samePoint(seg[seg.length - 1], tail)) ring = ring.concat([...seg].reverse().slice(1))
        else continue
        rest.splice(i, 1)
        extended = true
        break
      }
    }
    if (isClosed(ring)) rings.push(ring)
  }
  return rings
}

/** 点がリング内にあるか（レイキャスト法）。穴をどの外周に属させるかの判定に使う */
function pointInRing(pt: Position, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * 管理者を決める。OSMのタグを優先し、名称に「都立」「区立」とある場合だけ推定する。
 * 手がかりが無いときに区立と決めつけると、都立公園（水元公園など）を誤表示するため「不明」とする
 */
export function inferManager(tags: Record<string, string>, ward: string): Pick<ParkProperties, 'manager' | 'managerEstimated'> {
  const tagged = tags.operator ?? tags.owner
  if (tagged) return { manager: tagged, managerEstimated: false }
  const name = tags.name ?? ''
  if (name.includes('都立')) return { manager: '東京都', managerEstimated: true }
  if (name.includes('区立')) return { manager: ward, managerEstimated: true }
  return { manager: '不明', managerEstimated: false }
}

/** wayまたはrelation（行政界にも公園にも同じ形の要素）からGeoJSON風のジオメトリを作る */
export function geometryFromElement(el: OverpassElement): Geometry | null {
  if (el.type === 'way' && el.geometry) {
    const ring = toPositions(el.geometry)
    return isClosed(ring) ? { type: 'Polygon', coordinates: [ring] } : null
  }
  if (el.type === 'relation' && el.members) {
    const byRole = (role: string) =>
      joinRings(el.members!.filter((m) => m.type === 'way' && m.role === role && m.geometry).map((m) => toPositions(m.geometry!)))
    const outers = byRole('outer')
    if (outers.length === 0) return null
    const polygons: Position[][][] = outers.map((o) => [o])
    for (const inner of byRole('inner')) {
      const owner = polygons.find((p) => pointInRing(inner[0], p[0]))
      owner?.push(inner)
    }
    return { type: 'MultiPolygon', coordinates: polygons }
  }
  return null
}

const areaOf = (g: Geometry) => (g.type === 'Polygon' ? polygonAreaM2(g.coordinates) : g.coordinates.reduce((sum, p) => sum + polygonAreaM2(p), 0))

export function overpassToParks(elements: OverpassElement[], ward: string): ParkCollection {
  const features: ParkFeature[] = []
  for (const el of elements) {
    const geometry = geometryFromElement(el)
    if (!geometry) continue
    const tags = el.tags ?? {}
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: `${el.type}/${el.id}`,
        name: tags.name ?? '名称不明の公園',
        ward,
        areaM2: Math.round(areaOf(geometry)),
        ...inferManager(tags, ward),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
