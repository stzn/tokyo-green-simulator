import { describe, expect, it } from 'vitest'
import type { TreesColumnar } from '../../scripts/lib/parseTrees'
import { computeGreenContext } from './greenContext'
import type { CityTreeFeature } from './cityTrees'
import type { ParkFeature } from './parks'
import { toTreeData } from './trees'

// 計測地点は北緯35.68度・東経139.7度。緯度0.001度≒111m、経度0.001度≒90m
const point = { lat: 35.68, lon: 139.7 }

const treeData = toTreeData({
  count: 4,
  positions: [
    139.7, 35.6805, // 北へ約56m・高木
    139.7008, 35.68, // 東へ約72m・中木
    139.7, 35.682, // 北へ約222m・高木
    139.72, 35.7, // 遠い
  ],
  height: [12, 3, 10, 9],
  spread: [-1, -1, -1, -1],
  girth: [-1, -1, -1, -1],
  isTall: [1, 0, 1, 1],
  speciesIdx: [0, 0, 0, 0],
  wardIdx: [0, 0, 0, 0],
  routeIdx: [0, 0, 0, 0],
  dict: { species: ['イチョウ'], wards: ['千代田区'], routes: ['内堀通り'] },
} satisfies TreesColumnar)

const route = (coordinates: number[][], count: number | null, name: string): CityTreeFeature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: { ward: '千代田区', species: ['イチョウ'], count, route: name, alias: '', manager: '千代田区' },
})

const cityTrees: CityTreeFeature[] = [
  route([[139.699, 35.6807], [139.701, 35.6807]], 10, '北へ約78mを東西に通る路線'),
  route([[139.699, 35.6807], [139.701, 35.6807]], null, '本数不明の路線'),
  route([[139.699, 35.69], [139.701, 35.69]], 99, '遠い路線'),
]

const square = (west: number, south: number, size: number) => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
]

const park = (id: string, geometry: ParkFeature['geometry'], areaM2: number): ParkFeature => ({
  type: 'Feature',
  geometry,
  properties: { id, name: id, ward: '千代田区', areaM2, manager: '不明', managerEstimated: false },
})

// 計測地点を内側に含む公園
const parkAround = park('地点を含む公園', { type: 'Polygon', coordinates: [square(139.699, 35.679, 0.002)] }, 5000)
// 南辺が地点の北約167m
const parkNorth = park('北の公園', { type: 'Polygon', coordinates: [square(139.7, 35.6815, 0.0005)] }, 800)

const all = { trees: treeData, cityTrees, parks: [parkAround, parkNorth] }

describe('機能: 計測地点まわりの緑の文脈を計算する', () => {
  describe('シナリオ: 街路樹（都道・単木）', () => {
    it('Given 半径100m / When 計算する / Then 半径内の木だけを数え、高木の本数も返す', () => {
      expect(computeGreenContext(point, 100, all)?.trees).toEqual({ total: 2, tall: 1 })
    })

    it('Given 半径を50mに狭める / When 計算する / Then 56m先の木は数えない', () => {
      expect(computeGreenContext(point, 50, all)?.trees).toEqual({ total: 0, tall: 0 })
    })

    it('Given 半径を200mに広げる / When 計算する / Then 222m先の木はまだ数えない', () => {
      expect(computeGreenContext(point, 200, all)?.trees).toEqual({ total: 2, tall: 1 })
    })
  })

  describe('シナリオ: 区市町村道の街路樹', () => {
    it('Given 半径100m / When 計算する / Then 半径内を通る路線の数と、本数が公開されている路線の本数の合計を返す', () => {
      expect(computeGreenContext(point, 100, all)?.cityTrees).toEqual({ routes: 2, count: 10 })
    })

    it('Given 半径50m / When 計算する / Then 約78m先を通る路線は含めない', () => {
      expect(computeGreenContext(point, 50, all)?.cityTrees).toEqual({ routes: 0, count: 0 })
    })

    it('Given MultiLineStringの路線 / When 計算する / Then どれかの線が半径内なら数える', () => {
      const multi: CityTreeFeature = {
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: [[[139.71, 35.7], [139.711, 35.7]], [[139.699, 35.6807], [139.701, 35.6807]]] },
        properties: { ward: '千代田区', species: [], count: 5, route: 'M', alias: '', manager: '千代田区' },
      }
      expect(computeGreenContext(point, 100, { ...all, cityTrees: [multi] })?.cityTrees).toEqual({ routes: 1, count: 5 })
    })
  })

  describe('シナリオ: 公園', () => {
    it('Given 地点が公園の中 / When 計算する / Then 公園の中にいて、最寄りの公園までの距離は0', () => {
      const context = computeGreenContext(point, 100, all)
      expect(context?.inPark).toBe(true)
      expect(context?.nearestParkM).toBe(0)
    })

    it('Given 半径100m / When 計算する / Then 円に重なる公園（地点を含む公園）だけを数え、面積は公園全体', () => {
      expect(computeGreenContext(point, 100, all)?.parks).toEqual({ count: 1, areaM2: 5000 })
    })

    it('Given 半径200m / When 計算する / Then 約167m先の公園も数え、面積を合計する', () => {
      expect(computeGreenContext(point, 200, all)?.parks).toEqual({ count: 2, areaM2: 5800 })
    })

    it('Given 地点が公園の外 / When 計算する / Then 公園の外周までの距離を返す', () => {
      const context = computeGreenContext(point, 100, { ...all, parks: [parkNorth] })
      expect(context?.inPark).toBe(false)
      expect(Math.abs((context?.nearestParkM ?? 0) - 166.8)).toBeLessThan(2)
      expect(context?.parks).toEqual({ count: 0, areaM2: 0 })
    })

    it('Given 複数の公園 / When 最寄りを求める / Then 最も近い公園までの距離を返す', () => {
      const farPark = park('遠い公園', { type: 'Polygon', coordinates: [square(139.72, 35.7, 0.001)] }, 100)
      const context = computeGreenContext(point, 100, { ...all, parks: [farPark, parkNorth] })
      expect(Math.abs((context?.nearestParkM ?? 0) - 166.8)).toBeLessThan(2)
    })

    it('Given MultiPolygonの公園 / When 計算する / Then どれかのパートが半径内なら1つとして数える', () => {
      const multi = park(
        'M',
        { type: 'MultiPolygon', coordinates: [[square(139.72, 35.7, 0.001)], [square(139.7, 35.6815, 0.0005)]] },
        1000,
      )
      expect(computeGreenContext(point, 200, { ...all, parks: [multi] })?.parks).toEqual({ count: 1, areaM2: 1000 })
    })

    it('Given 公園データが空 / When 計算する / Then 最寄りの距離はnull', () => {
      const context = computeGreenContext(point, 100, { ...all, parks: [] })
      expect(context?.nearestParkM).toBeNull()
      expect(context?.inPark).toBe(false)
    })
  })

  describe('シナリオ: データが読み込み中', () => {
    it('Given 街路樹がまだ読み込めていない / When 計算する / Then 一部だけの数値を返さずnull', () => {
      expect(computeGreenContext(point, 100, { ...all, trees: null })).toBeNull()
    })

    it('Given 区道か公園がまだ読み込めていない / When 計算する / Then null', () => {
      expect(computeGreenContext(point, 100, { ...all, cityTrees: null })).toBeNull()
      expect(computeGreenContext(point, 100, { ...all, parks: null })).toBeNull()
    })
  })
})
