import { describe, expect, it } from 'vitest'
import { filterCityTrees, toCityTreePaths, totalCityTreeCount, type CityTreeFeature } from './cityTrees'

const feature = (ward: string, species: string[], count: number | null, route: string): CityTreeFeature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[139.75, 35.68], [139.76, 35.69]] },
  properties: { ward, species, count, route, alias: '', manager: ward },
})

const features = [
  feature('千代田区', ['イチョウ', 'サクラ'], 31, '特別区道千港1号'),
  feature('世田谷区', ['ハナミズキ'], 12, '区道A'),
  feature('世田谷区', ['イチョウ'], null, '区道B'),
]

describe('機能: 区道の街路樹を絞り込む', () => {
  it('Given 絞り込みなし / When 絞り込む / Then すべて残る', () => {
    expect(filterCityTrees(features, [], null)).toHaveLength(3)
  })

  it('Given 区で絞り込む / When 絞り込む / Then その区の路線だけになる', () => {
    expect(filterCityTrees(features, [], '世田谷区').map((f) => f.properties.route)).toEqual(['区道A', '区道B'])
  })

  it('Given 樹種で絞り込む / When 絞り込む / Then その樹種を含む路線が残る（路線には複数樹種が混ざる）', () => {
    expect(filterCityTrees(features, ['イチョウ'], null).map((f) => f.properties.route)).toEqual(['特別区道千港1号', '区道B'])
  })

  it('Given 樹種と区の両方で絞り込む / When 絞り込む / Then 両方に合う路線だけになる', () => {
    expect(filterCityTrees(features, ['イチョウ'], '世田谷区').map((f) => f.properties.route)).toEqual(['区道B'])
  })

  it('Given 複数の樹種を選ぶ / When 絞り込む / Then いずれかを含む路線が残る', () => {
    expect(filterCityTrees(features, ['サクラ', 'ハナミズキ'], null)).toHaveLength(2)
  })
})

describe('機能: 区道の街路樹の本数を数える', () => {
  it('Given 本数不明の路線を含む / When 合計する / Then 分かっている本数だけを足し、不明な路線数も返す', () => {
    expect(totalCityTreeCount(features)).toEqual({ count: 43, unknownRoutes: 1 })
  })

  it('Given 路線が無い / When 合計する / Then 0本・不明0路線', () => {
    expect(totalCityTreeCount([])).toEqual({ count: 0, unknownRoutes: 0 })
  })
})

describe('機能: 路線を線（パス）に展開する', () => {
  it('Given LineStringの路線 / When 展開する / Then 1本のパスになり、路線の情報を持つ', () => {
    const paths = toCityTreePaths([feature('千代田区', ['イチョウ'], 10, '区道A')])
    expect(paths).toHaveLength(1)
    expect(paths[0].path).toEqual([[139.75, 35.68], [139.76, 35.69]])
    expect(paths[0].route.route).toBe('区道A')
  })

  it('Given MultiLineStringの路線（途中で切れている道路） / When 展開する / Then パートごとのパスに分かれ、どれも同じ路線を指す', () => {
    const multi: CityTreeFeature = {
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: [[[139.7, 35.6], [139.71, 35.61]], [[139.72, 35.62], [139.73, 35.63]]] },
      properties: { ward: '港区', species: ['サクラ'], count: 5, route: '区道B', alias: '', manager: '港区' },
    }
    const paths = toCityTreePaths([multi])
    expect(paths).toHaveLength(2)
    expect(paths.every((p) => p.route.route === '区道B')).toBe(true)
  })

  it('Given 頂点が1つしかないパート / When 展開する / Then 線にならないので除く', () => {
    const broken: CityTreeFeature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[139.7, 35.6]] },
      properties: { ward: '港区', species: ['サクラ'], count: 5, route: '区道C', alias: '', manager: '港区' },
    }
    expect(toCityTreePaths([broken])).toHaveLength(0)
  })
})
