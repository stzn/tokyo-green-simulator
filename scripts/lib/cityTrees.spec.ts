import { describe, expect, it } from 'vitest'
import { isTokyo23Ward, toCityTreeRoute, toWgs84 } from './cityTrees'

// 実データ（緑のオープンデータ 街路樹_line.dbf）の1行を模した属性
const attrs = {
  区市町村: '千代田区',
  樹種: 'アオギリ,ヤマモモ',
  本数: 31,
  路線名: '特別区道千港1号',
  道路通称名: '-',
  所管: '千代田区',
  備考: '-',
}

describe('機能: 路線単位の街路樹の属性を整える', () => {
  it('Given 複数樹種と本数のある路線 / When 変換する / Then 樹種を分割し、本数はそのまま持つ', () => {
    expect(toCityTreeRoute(attrs)).toEqual({
      ward: '千代田区',
      species: ['アオギリ', 'ヤマモモ'],
      count: 31,
      route: '特別区道千港1号',
      alias: '',
      manager: '千代田区',
    })
  })

  it('Given 本数が-9999（不明）の路線 / When 変換する / Then 本数はnullになる', () => {
    expect(toCityTreeRoute({ ...attrs, 本数: -9999 }).count).toBeNull()
  })

  it('Given 道路通称名のある路線 / When 変換する / Then 通称名を持つ', () => {
    expect(toCityTreeRoute({ ...attrs, 道路通称名: '外堀通り' }).alias).toBe('外堀通り')
  })

  it('Given 樹種が空やハイフンだけの路線 / When 変換する / Then 「樹種不明」にする', () => {
    expect(toCityTreeRoute({ ...attrs, 樹種: '-' }).species).toEqual(['樹種不明'])
    expect(toCityTreeRoute({ ...attrs, 樹種: '' }).species).toEqual(['樹種不明'])
  })

  it('Given 樹種の前後に空白がある / When 変換する / Then 空白を落とす', () => {
    expect(toCityTreeRoute({ ...attrs, 樹種: ' イチョウ , サクラ ' }).species).toEqual(['イチョウ', 'サクラ'])
  })
})

describe('機能: 23区の路線だけを取り出す', () => {
  it('Given 23区の区名 / Then 対象になる', () => {
    expect(isTokyo23Ward('江戸川区')).toBe(true)
    expect(isTokyo23Ward('千代田区')).toBe(true)
  })

  it('Given 多摩部の市町村 / Then 対象外になる（このアプリは23区が範囲）', () => {
    expect(isTokyo23Ward('八王子市')).toBe(false)
    expect(isTokyo23Ward('武蔵野市')).toBe(false)
  })
})

describe('機能: 平面直角座標系第9系を緯度経度に直す', () => {
  it('Given 第9系の原点 / When 変換する / Then 北緯36度・東経139度50分になる', () => {
    const [lon, lat] = toWgs84([0, 0])
    expect(lon).toBeCloseTo(139.833333, 4)
    expect(lat).toBeCloseTo(36, 4)
  })

  it('Given 実データの先頭点（千代田区の路線） / When 変換する / Then 23区の範囲に入る', () => {
    const [lon, lat] = toWgs84([-7030.4, -36666.0])
    expect(lon).toBeGreaterThan(139.7)
    expect(lon).toBeLessThan(139.8)
    expect(lat).toBeGreaterThan(35.6)
    expect(lat).toBeLessThan(35.72)
  })

  it('Given 変換した座標 / Then 小数6桁に丸める（既存の街路樹データと同じ粒度）', () => {
    const [lon, lat] = toWgs84([-7030.4, -36666.0])
    expect(lon).toBe(Math.round(lon * 1e6) / 1e6)
    expect(lat).toBe(Math.round(lat * 1e6) / 1e6)
  })
})
