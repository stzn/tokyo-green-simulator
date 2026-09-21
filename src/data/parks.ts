// 公園ポリゴン（public/data/parks.geojson）の読み込みと、表示範囲内の集計。
// 描画（layers/parks.ts）と集計で同じデータを使うため、アプリ側で一度だけ読み込む
import { ringIntersectsExtent, type PolygonRings } from '../lib/geo'
import type { Extent } from '../lib/projection'
import type { ParkInfo } from '../store/appStore'

export type ParkFeature = {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: PolygonRings } | { type: 'MultiPolygon'; coordinates: PolygonRings[] }
  properties: ParkInfo
}

export const PARKS_URL = `${import.meta.env.BASE_URL}data/parks.geojson`

export async function loadParks(signal?: AbortSignal): Promise<ParkFeature[]> {
  const res = await fetch(PARKS_URL, { signal })
  if (!res.ok) throw new Error(`公園データの読み込みに失敗しました（HTTP ${res.status}）`)
  const { features } = (await res.json()) as { features?: ParkFeature[] }
  if (!Array.isArray(features)) throw new Error('公園データの形式が想定と違います')
  return features
}

/** 公園の外周リング（MultiPolygonは各パートの外周）。穴は範囲判定に影響しないので使わない */
const outerRings = (f: ParkFeature): PolygonRings =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((rings) => rings[0])

/** 表示範囲と重なる公園の数と面積の合計。範囲をまたぐ公園は面積全体を数える */
export function summarizeParksInExtent(parks: ParkFeature[], extent: Extent): { count: number; areaM2: number } {
  let count = 0
  let areaM2 = 0
  for (const park of parks) {
    if (outerRings(park).some((ring) => ringIntersectsExtent(extent, ring))) {
      count++
      areaM2 += park.properties.areaM2
    }
  }
  return { count, areaM2 }
}
