import { describe, expect, it } from 'vitest'
import type { OverpassElement } from './parks'
import { overpassToWard } from './wards'

// 約400m四方の正方形（東京付近）。下辺の途中に直線から0.0003度（約33m）ずれた点を1つ追加してある
const square = (lon: number, lat: number, dLon = 0.0044, dLat = 0.0036) => [
  { lon, lat },
  { lon: lon + dLon / 2, lat: lat + 0.0003 },
  { lon: lon + dLon, lat },
  { lon: lon + dLon, lat: lat + dLat },
  { lon, lat: lat + dLat },
  { lon, lat },
]

describe('機能: Overpassの行政界データを区の境界Featureに変換する', () => {
  describe('シナリオ: relationから境界を作る', () => {
    const elements: OverpassElement[] = [
      {
        type: 'relation',
        id: 42,
        tags: { name: '千代田区', boundary: 'administrative', admin_level: '7' },
        members: [{ type: 'way', role: 'outer', geometry: square(139.75, 35.68) }],
      },
    ]

    it('Given 閉じたouterのwayを1本持つrelation / When 変換する / Then MultiPolygonの地物になり区名を持つ', () => {
      const feature = overpassToWard(elements, '千代田区', 0.0001)
      expect(feature).not.toBeNull()
      expect(feature!.geometry.type).toBe('MultiPolygon')
      expect(feature!.properties).toEqual({ name: '千代田区' })
    })

    it('Given ずれ（0.0003度）より小さい許容誤差 / When 変換する / Then ずれた点も保たれる', () => {
      const feature = overpassToWard(elements, '千代田区', 0.0001)
      const ring = feature!.geometry.type === 'MultiPolygon' ? feature!.geometry.coordinates[0][0] : []
      expect(ring.length).toBe(6)
    })

    it('Given ずれ（0.0003度）より大きい許容誤差 / When 変換する / Then ずれた点は間引かれ角だけ残る', () => {
      const feature = overpassToWard(elements, '千代田区', 0.001)
      const ring = feature!.geometry.type === 'MultiPolygon' ? feature!.geometry.coordinates[0][0] : []
      expect(ring.length).toBe(5)
    })
  })

  describe('シナリオ: 変換できない入力', () => {
    it('Given relationが無い（wayだけ） / When 変換する / Then null', () => {
      const elements: OverpassElement[] = [{ type: 'way', id: 1, geometry: square(139.75, 35.68) }]
      expect(overpassToWard(elements, '千代田区', 0.0001)).toBeNull()
    })

    it('Given outerが閉じていないrelation / When 変換する / Then null', () => {
      const elements: OverpassElement[] = [
        { type: 'relation', id: 2, members: [{ type: 'way', role: 'outer', geometry: square(139.75, 35.68).slice(0, 3) }] },
      ]
      expect(overpassToWard(elements, '千代田区', 0.0001)).toBeNull()
    })

    it('Given 要素が空 / When 変換する / Then null', () => {
      expect(overpassToWard([], '千代田区', 0.0001)).toBeNull()
    })
  })
})
