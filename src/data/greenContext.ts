// 計測地点まわり（半径R m以内）の緑の集計。表示範囲の集計（矩形）とは別に、地点を中心とした円で数える。
// 研究用の数値が画面の状態で変わらないよう、樹種・行政区の絞り込みは使わず全件で数える
import { distanceM, distanceToPathM, pointInRing } from '../lib/geo'
import type { GreenContext } from '../lib/measurementLog'
import type { CityTreeFeature } from './cityTrees'
import { outerRings, type ParkFeature } from './parks'
import type { TreeData } from './trees'

const M_PER_DEG_LAT = 111_320

export type GreenContextData = {
  trees: TreeData | null
  cityTrees: CityTreeFeature[] | null
  parks: ParkFeature[] | null
}

const roundTo1 = (n: number) => Math.round(n * 10) / 10

/**
 * 地点まわりの緑。街路樹・区道・公園のどれかが読み込み中なら、一部だけの数値を返さず null を返す。
 * 区道の路線と公園は、円に一部でも重なれば全体を数える（今の範囲集計と同じ考え方）
 */
export function computeGreenContext(
  point: { lat: number; lon: number },
  radiusM: number,
  { trees, cityTrees, parks }: GreenContextData,
): GreenContext | null {
  if (!trees || !cityTrees || !parks) return null
  const center = [point.lon, point.lat]

  // 街路樹：矩形で絞ってから距離を測る（14.4万本を毎回haversineで測らない）
  const dLat = radiusM / M_PER_DEG_LAT
  const dLon = radiusM / (M_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180))
  let treeTotal = 0
  let treeTall = 0
  for (let i = 0; i < trees.count; i++) {
    const lon = trees.positions[i * 2]
    const lat = trees.positions[i * 2 + 1]
    if (Math.abs(lat - point.lat) > dLat || Math.abs(lon - point.lon) > dLon) continue
    if (distanceM(center, [lon, lat]) > radiusM) continue
    treeTotal++
    if (trees.isTall[i] === 1) treeTall++
  }

  // 区道：どれかの線が半径内を通れば1路線。本数が非公開の路線は路線数にだけ入れる
  let routes = 0
  let known = 0
  for (const { geometry, properties } of cityTrees) {
    const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
    if (!parts.some((path) => distanceToPathM(center, path) <= radiusM)) continue
    routes++
    if (properties.count !== null) known += properties.count
  }

  // 公園：外周までの距離が半径以内、または地点が外周の内側にあれば重なりとする（穴は見ない）
  let parkCount = 0
  let parkArea = 0
  let nearest: number | null = null
  let inPark = false
  for (const park of parks) {
    let parkDistance = Infinity
    for (const ring of outerRings(park)) {
      if (pointInRing(ring, point.lon, point.lat)) parkDistance = 0
      else parkDistance = Math.min(parkDistance, distanceToPathM(center, ring))
    }
    if (parkDistance === 0) inPark = true
    if (nearest === null || parkDistance < nearest) nearest = parkDistance
    if (parkDistance <= radiusM) {
      parkCount++
      parkArea += park.properties.areaM2
    }
  }

  return {
    trees: { total: treeTotal, tall: treeTall },
    cityTrees: { routes, count: known },
    parks: { count: parkCount, areaM2: parkArea },
    nearestParkM: nearest === null ? null : roundTo1(nearest),
    inPark,
  }
}
