import { describe, expect, it } from 'vitest'
import { summarizeParksInExtent, type ParkFeature } from './parks'

const square = (west: number, south: number, size: number) => [
  [west, south],
  [west + size, south],
  [west + size, south + size],
  [west, south + size],
  [west, south],
]

const park = (id: string, geometry: ParkFeature['geometry'], areaM2: number, ward = '千代田区'): ParkFeature => ({
  type: 'Feature',
  geometry,
  properties: { id, name: id, ward, areaM2, manager: '不明', managerEstimated: false },
})

const extent = { west: 139.7, south: 35.6, east: 139.8, north: 35.7 }

describe('機能: 表示範囲内の公園を集計する', () => {
  it('Given 範囲内の公園が2つ / When 集計する / Then 数と面積の合計を返す', () => {
    const parks = [
      park('a', { type: 'Polygon', coordinates: [square(139.72, 35.62, 0.01)] }, 10_000),
      park('b', { type: 'Polygon', coordinates: [square(139.75, 35.65, 0.01)] }, 5_000),
    ]
    expect(summarizeParksInExtent(parks, extent)).toEqual({ count: 2, areaM2: 15_000 })
  })

  it('Given 範囲の外の公園 / When 集計する / Then 数えない', () => {
    const parks = [park('far', { type: 'Polygon', coordinates: [square(139.1, 35.1, 0.01)] }, 99_999)]
    expect(summarizeParksInExtent(parks, extent)).toEqual({ count: 0, areaM2: 0 })
  })

  it('Given 範囲をまたぐ公園 / When 集計する / Then 1つとして数える', () => {
    const parks = [park('edge', { type: 'Polygon', coordinates: [square(139.79, 35.65, 0.05)] }, 20_000)]
    expect(summarizeParksInExtent(parks, extent).count).toBe(1)
  })

  it('Given 範囲が公園の内側に収まっている / When 集計する / Then 数える（大きな公園の中を見ている場合）', () => {
    const parks = [park('big', { type: 'Polygon', coordinates: [square(139.0, 35.0, 1.5)] }, 1_000_000)]
    expect(summarizeParksInExtent(parks, extent).count).toBe(1)
  })

  it('Given MultiPolygonの公園 / When 集計する / Then どれかのパートが範囲に入れば1つとして数える', () => {
    const parks = [
      park('multi', { type: 'MultiPolygon', coordinates: [[square(139.1, 35.1, 0.01)], [square(139.72, 35.62, 0.01)]] }, 8_000),
    ]
    expect(summarizeParksInExtent(parks, extent)).toEqual({ count: 1, areaM2: 8_000 })
  })

  it('Given 公園が無い / When 集計する / Then 0', () => {
    expect(summarizeParksInExtent([], extent)).toEqual({ count: 0, areaM2: 0 })
  })
})
