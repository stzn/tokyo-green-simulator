import { describe, expect, it } from 'vitest'
import type { ParkFeature } from '../../src/data/parks'
import { distanceM } from '../../src/lib/geo'
import { createBuildingIndex, createTreeIndex, localProjection, type LocalBuilding, type LocalPoint } from '../../src/lib/shade'
import { stageIntegrityErrors } from '../../src/lib/stage'
import { contractValidator } from '../../src/test/contracts'
import type { OverpassElement } from './parks'
import { assembleStage, extractCandidateSpots, type CandidateSpot } from './stageSpots'

// 原点（区域の中心）からの平面座標[m]でデータを組み立て、緯度経度に直して渡す
const ORIGIN = { lat: 35.684, lon: 139.765 }
const proj = localProjection(ORIGIN)
const BBOX: [number, number, number, number] = [...proj.toLonLat([-500, -500]), ...proj.toLonLat([500, 500])]

let wayId = 0
// nodes を省くと、通路ごとに重ならないノード番号を振る（ほかの通路とつながらない）
const way = (points: LocalPoint[], tags: Record<string, string>, nodes?: number[]): OverpassElement => {
  const id = ++wayId
  return {
    type: 'way',
    id,
    tags,
    nodes: nodes ?? points.map((_, i) => id * 1000 + i),
    geometry: points.map((p) => {
      const [lon, lat] = proj.toLonLat(p)
      return { lat, lon }
    }),
  }
}
const box = (x0: number, y0: number, x1: number, y1: number, heightM = 30): LocalBuilding => ({
  rings: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  heightM,
})
const park = (x0: number, y0: number, x1: number, y1: number, name: string): ParkFeature => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: box(x0, y0, x1, y1).rings.map((ring) => ring.map((p) => proj.toLonLat(p))) },
  properties: { id: name, name, ward: '千代田区', areaM2: (x1 - x0) * (y1 - y0), manager: '', managerEstimated: false },
})

const extract = (ways: OverpassElement[], buildings: LocalBuilding[] = [], parks: ParkFeature[] = []) =>
  extractCandidateSpots({ ways, parks, index: createBuildingIndex(buildings), proj, bbox: BBOX, idPrefix: 'OTM' })
const xyOf = (s: CandidateSpot) => proj.toXY([s.lon, s.lat])

describe('機能: ポッドを置ける候補地点の抽出', () => {
  describe('シナリオ: 地点の種類', () => {
    it('Given 建物の壁から5mの歩道 / When 抽出する / Then 歩道（容量1）で、名前は通りの名前から付く', () => {
      const spots = extract([way([[0, 0], [0, 20]], { highway: 'footway', name: '仲通り' })], [box(5, -50, 30, 50)])
      expect(spots.length).toBeGreaterThan(0)
      for (const s of spots) expect(s).toMatchObject({ kind: 'sidewalk', capacity_pods: 1, name: '仲通りの歩道' })
    })

    it('Given 建物から15m以上離れた歩道 / When 抽出する / Then 開けた場所なので広場（容量3）', () => {
      const spots = extract([way([[0, 0], [0, 20]], { highway: 'footway' })], [box(20, -50, 40, 50)])
      expect(spots.length).toBeGreaterThan(0)
      for (const s of spots) expect(s).toMatchObject({ kind: 'plaza', capacity_pods: 3, name: '名称なしの広場' })
    })

    it('Given 歩行者専用道（highway=pedestrian） / When 抽出する / Then 建物が近くても広場', () => {
      const spots = extract([way([[0, 0], [0, 20]], { highway: 'pedestrian', name: '行幸通り' })], [box(5, -50, 30, 50)])
      for (const s of spots) expect(s).toMatchObject({ kind: 'plaza', name: '行幸通りの広場' })
    })

    it('Given 公園の縁から10mの歩道 / When 抽出する / Then 公園沿い（容量2）で、名前は公園から付く', () => {
      const spots = extract([way([[0, 0], [0, 20]], { highway: 'footway' })], [box(5, -50, 30, 50)], [park(-100, -50, -10, 50, '和田倉噴水公園')])
      expect(spots.length).toBeGreaterThan(0)
      for (const s of spots) expect(s).toMatchObject({ kind: 'park_edge', capacity_pods: 2, name: '和田倉噴水公園沿い' })
    })
  })

  describe('シナリオ: 置けない場所を除く', () => {
    it('Given 建物を貫く通路 / When 抽出する / Then 建物の中と壁から2m未満の点は使わない', () => {
      const building = box(-10, 30, 10, 70)
      const spots = extract([way([[0, 0], [0, 100]], { highway: 'footway' })], [building])
      for (const s of spots) {
        const [, y] = xyOf(s)
        expect(y < 28 || y > 72).toBe(true)
      }
    })

    it('Given 横断歩道・橋・地上より上の立体の通路・私有の通路・車道 / When 抽出する / Then どれも使わない', () => {
      const tagsList: Record<string, string>[] = [
        { highway: 'footway', footway: 'crossing' },
        { highway: 'footway', bridge: 'yes' },
        { highway: 'footway', layer: '1' },
        { highway: 'footway', access: 'private' },
        { highway: 'footway', tunnel: 'yes', access: 'no' },
        { highway: 'primary' },
      ]
      expect(extract(tagsList.map((tags) => way([[0, 0], [0, 50]], tags)))).toEqual([])
    })

    it('Given 地上の歩道 / When 抽出する / Then 屋根なし（open）で、網の番号は持たない', () => {
      const spots = extract([way([[0, 0], [0, 20]], { highway: 'footway' })], [box(5, -50, 30, 50)])
      expect(spots.length).toBeGreaterThan(0)
      for (const s of spots) {
        expect(s.shelter).toBe('open')
        expect(s.shelter_network).toBeUndefined()
      }
    })

    it('Given 公園の縁から20mより内側の通路 / When 抽出する / Then 公園の中にはポッドを置かないので使わない', () => {
      expect(extract([way([[0, -10], [0, 10]], { highway: 'footway' })], [], [park(-100, -100, 100, 100, '広い公園')])).toEqual([])
    })

    it('Given 区域の外の通路 / When 抽出する / Then 使わない', () => {
      expect(extract([way([[600, 0], [600, 50]], { highway: 'footway' })])).toEqual([])
    })
  })

  describe('シナリオ: 屋根付きの通路', () => {
    it('Given 地下通路・屋内・地下の層・地下の階・屋根付き・屋内の廊下 / When 抽出する / Then 屋根付きの歩道（容量1）として使い、網の番号を付ける', () => {
      const tagsList: Record<string, string>[] = [
        { highway: 'footway', tunnel: 'yes' },
        { highway: 'footway', indoor: 'yes' },
        { highway: 'footway', layer: '-1' },
        { highway: 'footway', level: '-1' },
        { highway: 'footway', covered: 'yes' },
        { highway: 'corridor' },
      ]
      for (const tags of tagsList) {
        const spots = extract([way([[0, 0], [0, 20]], { ...tags, name: '地下歩道' })])
        expect(spots.length, JSON.stringify(tags)).toBeGreaterThan(0)
        for (const s of spots) expect(s).toMatchObject({ kind: 'sidewalk', capacity_pods: 1, shelter: 'covered', shelter_network: 'N1', name: '地下歩道の屋根付き通路' })
      }
    })

    it('Given 建物の中と公園の下を通る地下通路 / When 抽出する / Then 建物・公園の中でも使う', () => {
      const spots = extract(
        [way([[0, 0], [0, 100]], { highway: 'footway', level: '-1' })],
        [box(-10, -10, 10, 110)],
        [park(-200, -200, 200, 200, '広い公園')],
      )
      expect(spots.length).toBeGreaterThan(1)
    })

    it('Given 階段だけの通路 / When 抽出する / Then 地点にはしない', () => {
      expect(extract([way([[0, 0], [0, 50]], { highway: 'steps', tunnel: 'yes' })])).toEqual([])
    })

    it('Given ノードを共有する2本の地下通路と、離れた1本 / When 抽出する / Then 共有する2本は同じ網、離れた1本は別の網', () => {
      const spots = extract([
        way([[0, 300], [0, 200]], { highway: 'footway', tunnel: 'yes' }, [1, 2]),
        way([[0, 200], [0, 100]], { highway: 'footway', tunnel: 'yes' }, [2, 3]),
        way([[0, -200], [0, -300]], { highway: 'footway', tunnel: 'yes' }, [7, 8]),
      ])
      const north = spots.filter((s) => proj.toXY([s.lon, s.lat])[1] >= 100)
      const south = spots.filter((s) => proj.toXY([s.lon, s.lat])[1] < 0)
      expect(new Set(north.map((s) => s.shelter_network))).toEqual(new Set(['N1']))
      expect(new Set(south.map((s) => s.shelter_network))).toEqual(new Set(['N2']))
    })

    it('Given 屋根付きの階段でつながる2本の地下通路 / When 抽出する / Then 同じ網', () => {
      const spots = extract([
        way([[0, 300], [0, 200]], { highway: 'footway', level: '-1' }, [1, 2]),
        way([[0, 200], [0, 150]], { highway: 'steps', indoor: 'yes' }, [2, 3]),
        way([[0, 150], [0, 50]], { highway: 'footway', level: '-2' }, [3, 4]),
      ])
      expect(new Set(spots.map((s) => s.shelter_network))).toEqual(new Set(['N1']))
    })

    it('Given 地上の歩道とだけノードを共有する2本の地下通路 / When 抽出する / Then 別の網（地上を通ると濡れる）', () => {
      const spots = extract([
        way([[0, 300], [0, 200]], { highway: 'footway', tunnel: 'yes' }, [1, 2]),
        way([[0, 200], [0, 100]], { highway: 'footway' }, [2, 3]),
        way([[0, 100], [0, 0]], { highway: 'footway', tunnel: 'yes' }, [3, 4]),
      ])
      const nets = new Set(spots.filter((s) => s.shelter === 'covered').map((s) => s.shelter_network))
      expect(nets).toEqual(new Set(['N1', 'N2']))
    })

    it('Given 同じ場所の地上の歩道と地下通路 / When 抽出する / Then 階が違うので、間引かずに両方を残す', () => {
      const spots = extract([way([[0, 0], [0, 20]], { highway: 'footway' }), way([[0, 0], [0, 20]], { highway: 'footway', tunnel: 'yes' })])
      expect(spots.filter((s) => s.shelter === 'open').length).toBeGreaterThan(0)
      expect(spots.filter((s) => s.shelter === 'covered').length).toBeGreaterThan(0)
    })
  })

  describe('シナリオ: 間引きと番号', () => {
    const spots = extract([
      way([[0, -150], [0, 150]], { highway: 'footway' }),
      way([[-150, 0], [150, 0]], { highway: 'footway' }),
    ])

    it('Given 交差する長い歩道 / When 抽出する / Then 地点どうしは60m以上離れる', () => {
      expect(spots.length).toBeGreaterThan(5)
      for (const a of spots) {
        for (const b of spots) if (a !== b) expect(distanceM([a.lon, a.lat], [b.lon, b.lat])).toBeGreaterThanOrEqual(60)
      }
    })

    it('Given 抽出した地点 / When 番号を見る / Then 北から順に OTM-001 からの重複しない連番', () => {
      expect(spots.map((s) => s.id)).toEqual(spots.map((_, i) => `OTM-${String(i + 1).padStart(3, '0')}`))
      const lats = spots.map((s) => s.lat)
      expect(lats).toEqual([...lats].sort((a, b) => b - a))
    })
  })
})

describe('機能: 地点データ（stage.json）の組み立て', () => {
  const candidates: CandidateSpot[] = [
    { id: 'OTM-001', name: '北の歩道', ...lonLatOf([0, 100]), kind: 'sidewalk', capacity_pods: 1 },
    { id: 'OTM-002', name: '南の広場', ...lonLatOf([0, 0]), kind: 'plaza', capacity_pods: 3 },
  ]
  function lonLatOf(p: LocalPoint) {
    const [lon, lat] = proj.toLonLat(p)
    return { lon, lat }
  }
  // 南の広場の真南20mに高さ100mの建物
  const stage = assembleStage({
    area: { id: 'otemachi', name: '大手町・丸の内', bbox: BBOX },
    date: '2025-08-30',
    generator: 'test',
    candidates,
    index: createBuildingIndex([box(-30, -30, 30, -20, 100)]),
    proj,
    greenOf: () => ({ radius_m: 100, trees_all: 0, trees_tall: 0, parks_count: 0, parks_area_m2: 0, nearest_park_m: null }),
  })

  it('Given 2地点 / When 組み立てる / Then 契約のスキーマに合格し、ID・時刻の重複もない', () => {
    const validate = contractValidator('stage.schema.json')
    expect(validate(stage), JSON.stringify(validate.errors)).toBe(true)
    expect(stageIntegrityErrors(stage)).toEqual([])
    expect(stage).toMatchObject({ schema_version: '2', timezone: 'Asia/Tokyo', date: '2025-08-30' })
  })

  it('Given 南に高い建物がある広場 / When 組み立てる / Then 12時は日影、夜は1.0、天空率は1未満、需要は空', () => {
    const plaza = stage.spots.find((s) => s.id === 'OTM-002')!
    expect(plaza.hourly).toHaveLength(24)
    expect(plaza.hourly[12]).toEqual({ hour: 12, shade_fraction: 1 })
    expect(plaza.hourly[0]).toEqual({ hour: 0, shade_fraction: 1 })
    expect(plaza.sky_view_factor).toBeLessThan(1)
    expect(plaza.demand).toEqual([])
  })

  it('Given 建物の北120mの歩道 / When 組み立てる / Then 12時は日向、屋根なし', () => {
    const sidewalk = stage.spots.find((s) => s.id === 'OTM-001')!
    expect(sidewalk.hourly[12].shade_fraction).toBe(0)
    expect(sidewalk.shelter).toBe('open')
    expect(sidewalk).not.toHaveProperty('shelter_network')
  })

  it('Given 日向にある屋根付きの地点 / When 組み立てる / Then 遮蔽率は終日1.0、天空率は0、網の番号を保つ', () => {
    const covered = assembleStage({
      area: { id: 'otemachi', name: '大手町・丸の内', bbox: BBOX },
      date: '2025-08-30',
      generator: 'test',
      candidates: [{ id: 'OTM-001', name: '地下歩道の屋根付き通路', ...lonLatOf([0, 100]), kind: 'sidewalk', capacity_pods: 1, shelter: 'covered', shelter_network: 'N1' }],
      index: createBuildingIndex([]),
      proj,
      greenOf: () => ({ radius_m: 100, trees_all: 0, trees_tall: 0, parks_count: 0, parks_area_m2: 0, nearest_park_m: null }),
    })
    const [spot] = covered.spots
    expect(spot.hourly.every((h) => h.shade_fraction === 1)).toBe(true)
    expect(spot).toMatchObject({ sky_view_factor: 0, shelter: 'covered', shelter_network: 'N1' })
    const validate = contractValidator('stage.schema.json')
    expect(validate(covered), JSON.stringify(validate.errors)).toBe(true)
    expect(stageIntegrityErrors(covered)).toEqual([])
  })
})

describe('機能: 地点データの遮蔽率に街路樹の樹冠を入れる', () => {
  const candidates: CandidateSpot[] = [{ id: 'OTM-001', name: '並木の歩道', ...lonLatOf([0, 0]), kind: 'sidewalk', capacity_pods: 1 }]
  function lonLatOf(p: LocalPoint) {
    const [lon, lat] = proj.toLonLat(p)
    return { lon, lat }
  }
  const assemble = (trees?: ReturnType<typeof createTreeIndex>) =>
    assembleStage({
      area: { id: 'otemachi', name: '大手町・丸の内', bbox: BBOX },
      date: '2025-08-30',
      generator: 'test',
      candidates,
      index: createBuildingIndex([]),
      trees,
      proj,
      greenOf: () => ({ radius_m: 100, trees_all: 1, trees_tall: 1, parks_count: 0, parks_area_m2: 0, nearest_park_m: null }),
    })

  it('Given 地点を覆う樹冠（樹高10m・半径20m） / When 組み立てる / Then 12時の遮蔽率は0.8', () => {
    const stage = assemble(createTreeIndex([{ x: 0, y: 0, heightM: 10, crownRadiusM: 20 }]))
    expect(stage.spots[0].hourly[12].shade_fraction).toBe(0.8)
  })

  it('Given 街路樹を渡さない / When 組み立てる / Then 建物だけ（12時は0）', () => {
    expect(assemble().spots[0].hourly[12].shade_fraction).toBe(0)
  })
})
