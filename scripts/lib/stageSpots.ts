// ポッドを置ける候補地点の抽出と、地点データ（stage.json、データ契約の版 2）の組み立て。
// 候補地点は OpenStreetMap の歩行者用の通路（歩道・歩行者専用道・地下通路・屋内の通路）の上に一定間隔で点を打ち、
// 地上の点は建物・公園との位置関係で種類を決め、屋根付きの点はノードを共有する屋根付きの通路の網の番号を付けてから、
// 地点どうしが近すぎないよう間引く。規則は README に書いている
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
import type { Shelter, SpotKind, Stage, StageGreen, StageSpot } from '../../src/lib/stage'
import type { OverpassElement } from './parks'

type Projection = ReturnType<typeof localProjection>
type Bbox = [west: number, south: number, east: number, north: number]

export type CandidateSpot = Pick<StageSpot, 'id' | 'name' | 'lat' | 'lon' | 'kind' | 'capacity_pods' | 'shelter' | 'shelter_network'>

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

const PEDESTRIAN_HIGHWAYS = new Set(['footway', 'pedestrian', 'path', 'corridor', 'steps'])
const isYes = (v: string | undefined) => v !== undefined && v !== 'no'

/**
 * 誰でも通れる歩行者用の通路を、地上（open）と屋根付き（covered）に分ける。使わない通路は null。
 * 使わない: 横断歩道（車道の上）、橋、地上より上の立体の通路、私有の通路。
 * 屋根付き: 地下通路・屋内・屋根付き（tunnel / indoor / covered）、地下の層・階（負の layer / level）、屋内の廊下（corridor）
 */
export function classifyWay(tags: Record<string, string> = {}): Shelter | null {
  if (!PEDESTRIAN_HIGHWAYS.has(tags.highway)) return null
  if (tags.footway === 'crossing' || isYes(tags.bridge)) return null
  if (tags.access === 'private' || tags.access === 'no') return null
  const layer = Number(tags.layer ?? 0)
  const level = Number.parseFloat(tags.level ?? '0')
  if (tags.highway === 'corridor' || isYes(tags.tunnel) || isYes(tags.indoor) || isYes(tags.covered) || layer < 0 || level < 0) return 'covered'
  if (layer !== 0) return null
  return 'open'
}

/** 階段は網をつなぐだけで、ポッドは置かない */
const placesPods = (tags: Record<string, string>) => tags.highway !== 'steps'

/**
 * 屋根付きの通路の網：ノードを共有する屋根付きの通路どうしを 1 つの網にまとめ、通路 ID → 網の代表（最小の通路 ID）を返す。
 * 地上の通路とだけつながる 2 本は、地上を通ると濡れるので別の網にする
 */
function shelterNetworks(ways: OverpassElement[]): Map<number, number> {
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const byNode = new Map<number, number>()
  for (const w of ways) {
    parent.set(w.id, w.id)
    for (const node of w.nodes ?? []) {
      const other = byNode.get(node)
      if (other === undefined) byNode.set(node, w.id)
      else {
        const [a, b] = [find(other), find(w.id)]
        if (a !== b) parent.set(Math.max(a, b), Math.min(a, b))
      }
    }
  }
  return new Map(ways.map((w) => [w.id, find(w.id)]))
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

type Classified = Omit<CandidateSpot, 'id' | 'shelter_network'> & { shelter: Shelter; network?: number; priority: number; order: number }

/** 屋根付きの通路の点。建物の中・壁の近く・公園の下でも置ける（地下・屋内なので地上の建物や公園と重ならない） */
function classifyCovered(lonLat: [number, number], tags: Record<string, string>, network: number): Omit<Classified, 'order'> {
  return {
    lon: round6(lonLat[0]),
    lat: round6(lonLat[1]),
    kind: 'sidewalk',
    capacity_pods: CAPACITY.sidewalk,
    priority: PRIORITY.sidewalk,
    name: `${tags.name || '名称なし'}の屋根付き通路`,
    shelter: 'covered',
    network,
  }
}

/** 地上の1点の種類を決める。置けない点は null */
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

  const base = { lon: round6(lonLat[0]), lat: round6(lonLat[1]), shelter: 'open' as const }
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
 * すでに残した同じ屋根の区分（地上・屋根付き）の地点から minSpacingM 以上離れた点だけを残す（地上と地下は別の場所なので互いに間引かない）。
 * 番号は北から（同じ緯度なら西から）振り、屋根付きの網の番号は地点の番号順に N1 から振る
 */
export function extractCandidateSpots(
  input: { ways: OverpassElement[]; parks: ParkFeature[]; index: BuildingIndex; proj: Projection; bbox: Bbox; idPrefix: string },
  rules: SpotRules = DEFAULT_SPOT_RULES,
): CandidateSpot[] {
  const { ways, parks, index, proj, bbox, idPrefix } = input
  const [west, south, east, north] = bbox
  const points: Classified[] = []
  const usable = [...ways]
    .filter((w) => w.type === 'way' && w.geometry)
    .map((w) => ({ w, shelter: classifyWay(w.tags) }))
    .filter((x): x is { w: OverpassElement; shelter: Shelter } => x.shelter !== null)
    .sort((a, b) => a.w.id - b.w.id)
  const networks = shelterNetworks(usable.filter((x) => x.shelter === 'covered').map((x) => x.w))
  for (const { w, shelter } of usable) {
    const tags = w.tags ?? {}
    if (!placesPods(tags)) continue
    const path = w.geometry!.map(({ lon, lat }) => proj.toXY([lon, lat]))
    for (const xy of samplePath(path, rules.sampleStepM)) {
      const lonLat = proj.toLonLat(xy)
      if (lonLat[0] < west || lonLat[0] > east || lonLat[1] < south || lonLat[1] > north) continue
      const spot = shelter === 'covered' ? classifyCovered(lonLat, tags, networks.get(w.id)!) : classify(lonLat, xy, tags, parks, index, rules)
      if (spot) points.push({ ...spot, order: points.length })
    }
  }

  const kept: Classified[] = []
  for (const p of points.sort((a, b) => a.priority - b.priority || a.order - b.order)) {
    if (kept.every((k) => k.shelter !== p.shelter || distanceM([k.lon, k.lat], [p.lon, p.lat]) >= rules.minSpacingM)) kept.push(p)
  }
  const networkNames = new Map<number, string>()
  return kept
    .sort((a, b) => b.lat - a.lat || a.lon - b.lon)
    .map(({ name, lat, lon, kind, capacity_pods, shelter, network }, i) => {
      const spot: CandidateSpot = { id: `${idPrefix}-${String(i + 1).padStart(3, '0')}`, name, lat, lon, kind, capacity_pods, shelter }
      if (network === undefined) return spot
      if (!networkNames.has(network)) networkNames.set(network, `N${networkNames.size + 1}`)
      return { ...spot, shelter_network: networkNames.get(network) }
    })
}

/**
 * 候補地点ごとに、0〜23時の日射遮蔽率（建物と、trees があれば街路樹の樹冠）と天空率（建物）を求め、緑の文脈を付けて地点データ（版 2）にする。
 * 屋根付きの地点は屋根で空が見えないので、遮蔽率は終日 1.0、天空率は 0 とする。
 * 需要（demand）は空（シミュレーターが JITAI の集計から書き戻す）
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
    const shelter = c.shelter ?? 'open'
    const base = { ...c, shelter, green: greenOf(c), demand: [] }
    if (shelter === 'covered') {
      return { ...base, sky_view_factor: 0, hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, shade_fraction: 1 })) }
    }
    const xy = proj.toXY([c.lon, c.lat])
    const profile = horizonProfile(index, xy)
    const crowns = trees ? nearbyCrowns(trees, xy) : []
    return {
      ...base,
      sky_view_factor: round3(skyViewFactor(profile)),
      hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, shade_fraction: round3(shadeFractionForHour(profile, date, hour, c.lat, c.lon, { crowns })) })),
    }
  })
  return { schema_version: '2', area, date, timezone: 'Asia/Tokyo', generator, spots }
}
