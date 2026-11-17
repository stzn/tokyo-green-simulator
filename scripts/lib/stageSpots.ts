// ポッドを置ける候補地点の抽出と、舞台（stage.json、データ契約 v1）の組み立て。
// 候補地点は OpenStreetMap の歩行者用の通路（歩道・歩行者専用道）の上に一定間隔で点を打ち、
// 建物・公園との位置関係で種類を決めてから、地点どうしが近すぎないよう間引く。規則は README に書いている
import { outerRings, type ParkFeature } from '../../src/data/parks'
import { distanceM, distanceToPathM, pointInRing } from '../../src/lib/geo'
import {
  horizonProfile,
  isInsideBuilding,
  nearestWallDistanceM,
  shadeFractionForHour,
  skyViewFactor,
  type BuildingIndex,
  type LocalPoint,
  localProjection,
  nearbyCrowns,
  type TreeIndex,
} from '../../src/lib/shade'
import type { SpotKind, Stage, StageGreen, StageSpot } from '../../src/lib/stage'
import type { OverpassElement } from './parks'

type Projection = ReturnType<typeof localProjection>
type Bbox = [west: number, south: number, east: number, north: number]

export type CandidateSpot = Pick<StageSpot, 'id' | 'name' | 'lat' | 'lon' | 'kind' | 'capacity_pods'>

export const DEFAULT_SPOT_RULES = {
  /** 通路の上に点を打つ間隔[m] */
  sampleStepM: 20,
  /** 建物の壁からこれより近い点は使わない[m] */
  minWallDistanceM: 2,
  /** 公園の外周からこの距離以内なら「公園沿い」。公園の内側でこれより奥は使わない[m] */
  parkEdgeM: 20,
  /** 最寄りの壁がこれ以上離れていれば、開けた場所として「広場」[m] */
  plazaOpenM: 15,
  /** 地点どうしの最小間隔[m] */
  minSpacingM: 60,
}
export type SpotRules = typeof DEFAULT_SPOT_RULES

/** 種類ごとの同時に置けるポッドの数（幅の目安。広場は広い、歩道は狭い） */
const CAPACITY: Record<Exclude<SpotKind, 'rooftop'>, number> = { plaza: 3, park_edge: 2, sidewalk: 1 }
/** 間引くときに残す優先順（公園沿い → 広場 → 歩道） */
const PRIORITY: Record<Exclude<SpotKind, 'rooftop'>, number> = { park_edge: 0, plaza: 1, sidewalk: 2 }

const PEDESTRIAN_HIGHWAYS = new Set(['footway', 'pedestrian', 'path'])
const isYes = (v: string | undefined) => v !== undefined && v !== 'no'

/**
 * 地上の、誰でも通れる歩行者用の通路か。横断歩道（車道の上）、地下・屋内・屋根付き・立体の通路、私有の通路は除く
 */
export function isGroundPedestrianWay(tags: Record<string, string> = {}): boolean {
  if (!PEDESTRIAN_HIGHWAYS.has(tags.highway)) return false
  if (tags.footway === 'crossing') return false
  if (isYes(tags.tunnel) || isYes(tags.bridge) || isYes(tags.indoor) || isYes(tags.covered)) return false
  if (Number(tags.layer ?? 0) !== 0 || Number.parseFloat(tags.level ?? '0') < 0) return false
  if (tags.access === 'private' || tags.access === 'no') return false
  return true
}

/** 折れ線の上に stepM ごとの点を打つ（始点を含み、終点も加える） */
function samplePath(path: LocalPoint[], stepM: number): LocalPoint[] {
  const points: LocalPoint[] = []
  let carry = 0
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i]
    const [bx, by] = path[i + 1]
    const len = Math.hypot(bx - ax, by - ay)
    let d = carry
    for (; d < len; d += stepM) points.push([ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len])
    carry = d - len
  }
  if (path.length > 0) points.push(path[path.length - 1])
  return points
}

type Classified = Omit<CandidateSpot, 'id'> & { priority: number; order: number }

/** 1点の種類を決める。置けない点は null */
function classify(
  lonLat: [number, number],
  xy: LocalPoint,
  tags: Record<string, string>,
  parks: ParkFeature[],
  index: BuildingIndex,
  rules: SpotRules,
): Omit<Classified, 'order'> | null {
  if (isInsideBuilding(index, xy)) return null
  const wallM = nearestWallDistanceM(index, xy, rules.plazaOpenM)
  if (wallM < rules.minWallDistanceM) return null

  // 公園との位置関係：外周に近い公園を探す。内側の奥なら置かない
  let edgePark: ParkFeature | null = null
  for (const park of parks) {
    for (const ring of outerRings(park)) {
      const inside = pointInRing(ring, lonLat[0], lonLat[1])
      const toEdge = distanceToPathM(lonLat, ring)
      if (inside && toEdge > rules.parkEdgeM) return null
      if (toEdge <= rules.parkEdgeM) edgePark ??= park
    }
  }

  const base = { lon: round6(lonLat[0]), lat: round6(lonLat[1]) }
  if (edgePark) {
    return { ...base, kind: 'park_edge', capacity_pods: CAPACITY.park_edge, priority: PRIORITY.park_edge, name: `${edgePark.properties.name || '名称なしの公園'}沿い` }
  }
  const wayName = tags.name || '名称なし'
  if (tags.highway === 'pedestrian' || wallM >= rules.plazaOpenM) {
    return { ...base, kind: 'plaza', capacity_pods: CAPACITY.plaza, priority: PRIORITY.plaza, name: `${wayName}の広場` }
  }
  return { ...base, kind: 'sidewalk', capacity_pods: CAPACITY.sidewalk, priority: PRIORITY.sidewalk, name: `${wayName}の歩道` }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6
const round3 = (n: number) => Math.round(n * 1e3) / 1e3

/**
 * 区域（bbox）の中の、ポッドを置ける候補地点。
 * 間引きは優先順（公園沿い → 広場 → 歩道）、同じ種類の中は通路の ID 順・通路に沿った順で、
 * すでに残した地点から minSpacingM 以上離れた点だけを残す。番号は北から（同じ緯度なら西から）振る
 */
export function extractCandidateSpots(
  input: { ways: OverpassElement[]; parks: ParkFeature[]; index: BuildingIndex; proj: Projection; bbox: Bbox; idPrefix: string },
  rules: SpotRules = DEFAULT_SPOT_RULES,
): CandidateSpot[] {
  const { ways, parks, index, proj, bbox, idPrefix } = input
  const [west, south, east, north] = bbox
  const points: Classified[] = []
  const sorted = [...ways].filter((w) => w.type === 'way' && w.geometry && isGroundPedestrianWay(w.tags)).sort((a, b) => a.id - b.id)
  for (const w of sorted) {
    const path = w.geometry!.map(({ lon, lat }) => proj.toXY([lon, lat]))
    for (const xy of samplePath(path, rules.sampleStepM)) {
      const lonLat = proj.toLonLat(xy)
      if (lonLat[0] < west || lonLat[0] > east || lonLat[1] < south || lonLat[1] > north) continue
      const spot = classify(lonLat, xy, w.tags ?? {}, parks, index, rules)
      if (spot) points.push({ ...spot, order: points.length })
    }
  }

  const kept: Classified[] = []
  for (const p of points.sort((a, b) => a.priority - b.priority || a.order - b.order)) {
    if (kept.every((k) => distanceM([k.lon, k.lat], [p.lon, p.lat]) >= rules.minSpacingM)) kept.push(p)
  }
  return kept
    .sort((a, b) => b.lat - a.lat || a.lon - b.lon)
    .map(({ name, lat, lon, kind, capacity_pods }, i) => ({ id: `${idPrefix}-${String(i + 1).padStart(3, '0')}`, name, lat, lon, kind, capacity_pods }))
}

/**
 * 候補地点ごとに、0〜23時の日射遮蔽率（建物と、trees があれば街路樹の樹冠）と天空率（建物）を求め、緑の文脈を付けて舞台にする。
 * 需要（demand）は v1 では空（集計値の用意ができてから入れる）
 */
export function assembleStage(input: {
  area: Stage['area']
  date: string
  generator: string
  candidates: CandidateSpot[]
  index: BuildingIndex
  /** 街路樹の樹冠。無ければ建物だけで遮蔽率を求める */
  trees?: TreeIndex
  proj: Projection
  greenOf: (spot: CandidateSpot) => StageGreen
}): Stage {
  const { area, date, generator, candidates, index, trees, proj, greenOf } = input
  const spots: StageSpot[] = candidates.map((c) => {
    const xy = proj.toXY([c.lon, c.lat])
    const profile = horizonProfile(index, xy)
    const crowns = trees ? nearbyCrowns(trees, xy) : []
    return {
      ...c,
      sky_view_factor: round3(skyViewFactor(profile)),
      green: greenOf(c),
      hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, shade_fraction: round3(shadeFractionForHour(profile, date, hour, c.lat, c.lon, { crowns })) })),
      demand: [],
    }
  })
  return { schema_version: '1', area, date, timezone: 'Asia/Tokyo', generator, spots }
}
