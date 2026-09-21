// 区道の街路樹（public/data/city-trees.geojson）の読み込みと絞り込み。
// 区市町村道は単木の位置が公開されていないため、路線の線に樹種と本数が付いたデータになっている
import type { CityTreeRoute } from '../../scripts/lib/cityTrees'
import { pathIntersectsExtent, type Position } from '../lib/geo'
import type { Extent } from '../lib/projection'

export type CityTreeGeometry = { type: 'LineString'; coordinates: Position[] } | { type: 'MultiLineString'; coordinates: Position[][] }

export type CityTreeFeature = {
  type: 'Feature'
  geometry: CityTreeGeometry
  properties: CityTreeRoute
}

export const CITY_TREES_URL = `${import.meta.env.BASE_URL}data/city-trees.geojson`

export async function loadCityTrees(signal?: AbortSignal): Promise<CityTreeFeature[]> {
  const res = await fetch(CITY_TREES_URL, { signal })
  if (!res.ok) throw new Error(`区道の街路樹データの読み込みに失敗しました（HTTP ${res.status}）`)
  const { features } = (await res.json()) as { features?: CityTreeFeature[] }
  if (!Array.isArray(features)) throw new Error('区道の街路樹データの形式が想定と違います')
  return features
}

/** 街路樹（都道）と同じ絞り込みを路線にも効かせる。樹種は路線に含まれていれば対象 */
export function filterCityTrees(features: CityTreeFeature[], speciesFilter: string[], wardFilter: string | null): CityTreeFeature[] {
  if (speciesFilter.length === 0 && wardFilter === null) return features
  const wanted = new Set(speciesFilter)
  return features.filter(({ properties }) => {
    const wardOk = wardFilter === null || properties.ward === wardFilter
    const speciesOk = wanted.size === 0 || properties.species.some((s) => wanted.has(s))
    return wardOk && speciesOk
  })
}

/** 本数の合計。本数が公開されていない路線は数に入れず、その路線数を返す */
export function totalCityTreeCount(features: CityTreeFeature[]): { count: number; unknownRoutes: number } {
  return features.reduce(
    (acc, { properties }) =>
      properties.count === null ? { ...acc, unknownRoutes: acc.unknownRoutes + 1 } : { ...acc, count: acc.count + properties.count },
    { count: 0, unknownRoutes: 0 },
  )
}

/**
 * 表示範囲を通る路線の集計。本数が公開されていない路線は本数に足さず、路線数として別に返す。
 * 路線は線なので、範囲に入っている長さではなく路線全体の本数を数える（範囲をまたぐ路線は全体を数える）
 */
export function summarizeCityTreesInExtent(
  features: CityTreeFeature[],
  extent: Extent,
): { routes: number; count: number; unknownRoutes: number } {
  let routes = 0
  let count = 0
  let unknownRoutes = 0
  for (const { geometry, properties } of features) {
    const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
    if (!parts.some((path) => pathIntersectsExtent(extent, path))) continue
    routes++
    if (properties.count === null) unknownRoutes++
    else count += properties.count
  }
  return { routes, count, unknownRoutes }
}

/** deck.glのPathLayerに渡す1本の線 */
export type CityTreePath = { route: CityTreeRoute; path: Position[] }

/**
 * 路線（FeatureのLineString / MultiLineString）を線の配列に展開する。
 * 1つの路線が途中で切れている（MultiLineString）場合は、パートごとに分かれるが路線の情報は同じ
 */
export function toCityTreePaths(features: CityTreeFeature[]): CityTreePath[] {
  const paths: CityTreePath[] = []
  for (const { geometry, properties } of features) {
    const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
    for (const path of parts) {
      // 頂点が1つでは線にならない
      if (path.length >= 2) paths.push({ route: properties, path })
    }
  }
  return paths
}
