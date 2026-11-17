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
const way = (points: LocalPoint[], tags: Record<string, string>): OverpassElement => ({
  type: 'way',
  id: ++wayId,
  tags,
  geometry: points.map((p) => {
    const [lon, lat] = proj.toLonLat(p)
    return { lat, lon }
  }),
})
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

    it('Given 横断歩道・地下通路・屋内・立体の通路・私有の通路 / When 抽出する / Then どれも使わない', () => {
      const tagsList: Record<string, string>[] = [
        { highway: 'footway', footway: 'crossing' },
        { highway: 'footway', tunnel: 'yes' },
        { highway: 'footway', indoor: 'yes' },
        { highway: 'footway', layer: '-1' },
        { highway: 'footway', bridge: 'yes' },
        { highway: 'footway', covered: 'yes' },
        { highway: 'footway', access: 'private' },
        { highway: 'primary' },
      ]
      expect(extract(tagsList.map((tags) => way([[0, 0], [0, 50]], tags)))).toEqual([])
    })

    it('Given 公園の縁から20mより内側の通路 / When 抽出する / Then 公園の中にはポッドを置かないので使わない', () => {
      expect(extract([way([[0, -10], [0, 10]], { highway: 'footway' })], [], [park(-100, -100, 100, 100, '広い公園')])).toEqual([])
    })

    it('Given 区域の外の通路 / When 抽出する / Then 使わない', () => {
      expect(extract([way([[600, 0], [600, 50]], { highway: 'footway' })])).toEqual([])
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

describe('機能: 舞台（stage.json）の組み立て', () => {
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
    expect(stage).toMatchObject({ schema_version: '1', timezone: 'Asia/Tokyo', date: '2025-08-30' })
  })

  it('Given 南に高い建物がある広場 / When 組み立てる / Then 12時は日影、夜は1.0、天空率は1未満、需要は空', () => {
    const plaza = stage.spots.find((s) => s.id === 'OTM-002')!
    expect(plaza.hourly).toHaveLength(24)
    expect(plaza.hourly[12]).toEqual({ hour: 12, shade_fraction: 1 })
    expect(plaza.hourly[0]).toEqual({ hour: 0, shade_fraction: 1 })
    expect(plaza.sky_view_factor).toBeLessThan(1)
    expect(plaza.demand).toEqual([])
  })

  it('Given 建物の北120mの歩道 / When 組み立てる / Then 12時は日向', () => {
    const sidewalk = stage.spots.find((s) => s.id === 'OTM-001')!
    expect(sidewalk.hourly[12].shade_fraction).toBe(0)
  })
})

describe('機能: 舞台の遮蔽率に街路樹の樹冠を入れる', () => {
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
