import { describe, expect, it } from 'vitest'
import type { TreesColumnar } from '../../scripts/lib/parseTrees'
import { buildTreeMask, countBySpecies, getTreeRecord, toTreeData } from './trees'

const columnar: TreesColumnar = {
  count: 4,
  positions: [139.75, 35.68, 139.76, 35.69, 139.7, 35.7, 139.71, 35.71],
  height: [12, 8, 6, 2],
  spread: [5, 4, -1, -1],
  girth: [150, 90, 60, -1],
  isTall: [1, 1, 1, 0],
  speciesIdx: [0, 1, 0, 2],
  wardIdx: [0, 0, 1, 1],
  routeIdx: [0, 0, 1, 1],
  dict: { species: ['イチョウ', 'サクラ', 'トキワマンサク'], wards: ['千代田区', '新宿区'], routes: ['内堀通り', '青梅街道'] },
}

describe('機能: 街路樹データをブラウザ用の型付き配列にする', () => {
  it('Given 列指向JSON / When 変換する / Then 位置はFloat64Array、属性は型付き配列になる', () => {
    const data = toTreeData(columnar)
    expect(data.count).toBe(4)
    expect(data.positions).toBeInstanceOf(Float64Array)
    expect(Array.from(data.positions.slice(0, 2))).toEqual([139.75, 35.68])
    expect(data.height).toBeInstanceOf(Float32Array)
    expect(Array.from(data.speciesIdx)).toEqual([0, 1, 0, 2])
  })

  it('Given 樹種ごとの本数 / When 集計する / Then 本数の多い順に並ぶ', () => {
    expect(countBySpecies(toTreeData(columnar))).toEqual([
      { species: 'イチョウ', count: 2 },
      { species: 'サクラ', count: 1 },
      { species: 'トキワマンサク', count: 1 },
    ])
  })
})

describe('機能: 樹種・行政区で絞り込むマスクを作る', () => {
  const data = toTreeData(columnar)

  it('Given 絞り込みなし / When マスクを作る / Then すべて1', () => {
    expect(Array.from(buildTreeMask(data, [], null))).toEqual([1, 1, 1, 1])
  })

  it('Given イチョウのみ / When マスクを作る / Then イチョウだけ1', () => {
    expect(Array.from(buildTreeMask(data, ['イチョウ'], null))).toEqual([1, 0, 1, 0])
  })

  it('Given イチョウ＋新宿区 / When マスクを作る / Then 両方に当てはまるものだけ1', () => {
    expect(Array.from(buildTreeMask(data, ['イチョウ'], '新宿区'))).toEqual([0, 0, 1, 0])
  })

  it('Given 辞書にない樹種 / When マスクを作る / Then すべて0', () => {
    expect(Array.from(buildTreeMask(data, ['バオバブ'], null))).toEqual([0, 0, 0, 0])
  })
})

describe('機能: 1本分の詳細情報を取り出す', () => {
  const data = toTreeData(columnar)

  it('Given 幹周のある高木のイチョウ / When 取り出す / Then 属性と、回帰式による推定樹齢・インベントリ準拠のCO2が得られる', () => {
    const r = getTreeRecord(data, 0)
    expect(r).toMatchObject({ species: 'イチョウ', kind: '高木', heightM: 12, spreadM: 5, girthCm: 150, ward: '千代田区', route: '内堀通り' })
    expect(r.estimatedAge).toEqual({ years: 54, formulaSpecies: 'イチョウ' })
    expect(r.estimatedCo2KgPerYear).toBeCloseTo(39.6, 1)
  })

  it('Given 幹周・枝張が欠損した中木 / When 取り出す / Then 欠損はnull、推定値もnull', () => {
    const r = getTreeRecord(data, 3)
    expect(r).toMatchObject({ kind: '中木', spreadM: null, girthCm: null, estimatedAge: null, estimatedCo2KgPerYear: null })
  })
})
