import { describe, expect, it } from 'vitest'
import { inferManager, overpassToParks, type OverpassElement } from './parks'

// 約100m四方の正方形（東京付近）
const square = (lon: number, lat: number, dLon = 0.0011, dLat = 0.0009) => [
  { lon, lat },
  { lon: lon + dLon, lat },
  { lon: lon + dLon, lat: lat + dLat },
  { lon, lat: lat + dLat },
  { lon, lat },
]

describe('機能: Overpassの公園データをGeoJSONに変換する', () => {
  describe('シナリオ: 閉じたwayを公園ポリゴンにする', () => {
    const elements: OverpassElement[] = [
      { type: 'way', id: 1, tags: { leisure: 'park', name: '日比谷公園' }, geometry: square(139.755, 35.673) },
    ]

    it('Given 閉じたway / When 変換する / Then Polygonの地物になり区名とOSM IDを持つ', () => {
      const fc = overpassToParks(elements, '千代田区')
      expect(fc.features).toHaveLength(1)
      const f = fc.features[0]
      expect(f.geometry.type).toBe('Polygon')
      expect(f.properties).toMatchObject({ id: 'way/1', name: '日比谷公園', ward: '千代田区' })
    })

    it('Given 約100m四方のway / When 変換する / Then 面積はおよそ1万m²', () => {
      const area = overpassToParks(elements, '千代田区').features[0].properties.areaM2
      expect(area).toBeGreaterThan(9000)
      expect(area).toBeLessThan(11000)
    })
  })

  describe('シナリオ: マルチポリゴンのrelationを変換する', () => {
    it('Given 2本のwayに分かれた外周 / When 変換する / Then つなげて1つのリングにする', () => {
      const [a, b, c, d] = square(139.7, 35.68)
      const elements: OverpassElement[] = [
        {
          type: 'relation',
          id: 9,
          tags: { leisure: 'park', name: '都立代々木公園', type: 'multipolygon' },
          members: [
            { type: 'way', role: 'outer', geometry: [a, b, c] },
            { type: 'way', role: 'outer', geometry: [a, d, c] }, // 向きが逆のway
          ],
        },
      ]
      const f = overpassToParks(elements, '渋谷区').features[0]
      expect(f.geometry.type).toBe('MultiPolygon')
      if (f.geometry.type !== 'MultiPolygon') return
      expect(f.geometry.coordinates).toHaveLength(1)
      const ring = f.geometry.coordinates[0][0]
      expect(ring).toHaveLength(5)
      expect(ring[0]).toEqual(ring[4])
    })

    it('Given innerの穴 / When 変換する / Then 外周の内側の穴として面積から差し引く', () => {
      const outer = square(139.7, 35.68, 0.0022, 0.0018)
      const inner = square(139.7005, 35.6805)
      const withHole = overpassToParks(
        [{ type: 'relation', id: 2, tags: { leisure: 'park' }, members: [{ type: 'way', role: 'outer', geometry: outer }, { type: 'way', role: 'inner', geometry: inner }] }],
        '渋谷区',
      ).features[0]
      expect(withHole.geometry.type).toBe('MultiPolygon')
      if (withHole.geometry.type !== 'MultiPolygon') return
      expect(withHole.geometry.coordinates[0]).toHaveLength(2)
      expect(withHole.properties.areaM2).toBeGreaterThan(29000)
      expect(withHole.properties.areaM2).toBeLessThan(31000)
    })
  })

  describe('シナリオ: 不正な地物を除外する', () => {
    it('Given 閉じていないway / When 変換する / Then 除外される', () => {
      const open = square(139.7, 35.68).slice(0, 3)
      expect(overpassToParks([{ type: 'way', id: 3, tags: { leisure: 'park' }, geometry: open }], '港区').features).toHaveLength(0)
    })

    it('Given 名前のない公園 / When 変換する / Then 名称は「名称不明の公園」になる', () => {
      const f = overpassToParks([{ type: 'way', id: 4, tags: { leisure: 'park' }, geometry: square(139.7, 35.68) }], '港区').features[0]
      expect(f.properties.name).toBe('名称不明の公園')
    })
  })
})

describe('機能: 公園の管理者を推定する', () => {
  it('Given operatorタグがある / When 推定する / Then operatorを採用し推定フラグは立たない', () => {
    expect(inferManager({ name: '新宿御苑', operator: '環境省' }, '新宿区')).toEqual({ manager: '環境省', managerEstimated: false })
  })

  it('Given 名称に「都立」を含む / When 推定する / Then 東京都（推定）', () => {
    expect(inferManager({ name: '都立日比谷公園' }, '千代田区')).toEqual({ manager: '東京都', managerEstimated: true })
  })

  it('Given operatorが無くownerタグがある / When 推定する / Then ownerを採用する', () => {
    expect(inferManager({ name: '水元公園', owner: '東京都' }, '葛飾区')).toEqual({ manager: '東京都', managerEstimated: false })
  })

  it('Given 名称に「区立」を含む / When 推定する / Then その区（推定）', () => {
    expect(inferManager({ name: '江東区立新木場一丁目公園' }, '江東区')).toEqual({ manager: '江東区', managerEstimated: true })
  })

  it('Given 手がかりが無い / When 推定する / Then 区立と決めつけず「不明」とする（都立公園を区立と誤表示しないため）', () => {
    expect(inferManager({ name: '水元公園' }, '葛飾区')).toEqual({ manager: '不明', managerEstimated: false })
  })
})
