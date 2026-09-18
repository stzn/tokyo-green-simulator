// Overpass API（行政界のrelation, out geom）→ 区の境界Feature（現在地ミニマップ表示用）
import { simplifyRing, type Geometry, type Position } from '../../src/lib/geo'
import { geometryFromElement, type OverpassElement } from './parks'

export type WardFeature = {
  type: 'Feature'
  geometry: Geometry
  properties: { name: string }
}

const simplifyRings = (rings: Position[][], toleranceDeg: number) => rings.map((ring) => simplifyRing(ring, toleranceDeg))

/**
 * 行政界のOverpass応答を1つの区のFeatureに変換する。
 * ミニマップでの表示専用のため、指定した許容誤差[度]でリングを単純化する
 */
export function overpassToWard(elements: OverpassElement[], wardName: string, toleranceDeg: number): WardFeature | null {
  const relation = elements.find((el) => el.type === 'relation')
  if (!relation) return null
  const geometry = geometryFromElement(relation)
  if (!geometry) return null
  const simplified: Geometry =
    geometry.type === 'Polygon'
      ? { type: 'Polygon', coordinates: simplifyRings(geometry.coordinates, toleranceDeg) }
      : { type: 'MultiPolygon', coordinates: geometry.coordinates.map((rings) => simplifyRings(rings, toleranceDeg)) }
  return { type: 'Feature', geometry: simplified, properties: { name: wardName } }
}
