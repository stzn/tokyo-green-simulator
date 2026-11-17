// PLATEAU 建物の MVT（地図表示と同じ indigo-lab の配信）を、遮蔽の計算用の建物（局所の平面座標の外周と高さ）に変換する
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import type { LocalBuilding, LocalPoint, localProjection } from '../../src/lib/shade'

type Projection = ReturnType<typeof localProjection>
type Geometry = { type: string; coordinates?: unknown }

/** 建物タイルのレイヤー名 */
const BUILDING_LAYER = 'bldg'
/** measuredHeight が未設定（0）の建物に使う高さ。地図表示（src/layers/buildings.ts）と同じ平屋相当 */
const FALLBACK_HEIGHT_M = 3

/** 面の地物を建物にする。穴は遮蔽に関係しないので外周だけ残す。面でなければ null */
export function toLocalBuilding(geometry: Geometry, properties: Record<string, unknown>, proj: Projection): LocalBuilding | null {
  let polygons: number[][][][]
  if (geometry.type === 'Polygon') polygons = [geometry.coordinates as number[][][]]
  else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates as number[][][][]
  else return null
  const height = Number(properties.measuredHeight)
  return {
    rings: polygons.filter((p) => p[0]?.length >= 3).map((p) => p[0].map((c): LocalPoint => proj.toXY(c))),
    heightM: height > 0 ? height : FALLBACK_HEIGHT_M,
  }
}

/** 1枚のタイル（pbf）に含まれる建物。タイル境界で分かれた建物はそれぞれの断片のまま扱う（遮蔽の結果は変わらない） */
export function decodeBuildingTile(pbf: Uint8Array, tile: { x: number; y: number; z: number }, proj: Projection): LocalBuilding[] {
  const layer = new VectorTile(new Pbf(pbf)).layers[BUILDING_LAYER]
  if (!layer) return []
  const buildings: LocalBuilding[] = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const { geometry } = feature.toGeoJSON(tile.x, tile.y, tile.z)
    const building = toLocalBuilding(geometry, feature.properties, proj)
    if (building && building.rings.length > 0) buildings.push(building)
  }
  return buildings
}
