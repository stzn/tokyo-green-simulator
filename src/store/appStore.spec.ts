import { beforeEach, describe, expect, it } from 'vitest'
import { simulateGreening } from '../lib/simulation/greening'
import { createAppStore, selectTotals, type AppStore, type BuildingInfo } from './appStore'

const square: BuildingInfo['polygon'] = [
  [
    [139.76, 35.68],
    [139.7611, 35.68],
    [139.7611, 35.6809],
    [139.76, 35.6809],
    [139.76, 35.68],
  ],
]
const buildingA: BuildingInfo = { id: '13101-bldg-1', heightM: 40, roofAreaM2: 1000, perimeterM: 130, polygon: square }
const buildingB: BuildingInfo = { id: '13101-bldg-2', heightM: 20, roofAreaM2: 500, perimeterM: 90, polygon: square }

let store: AppStore
beforeEach(() => {
  store = createAppStore()
})

describe('機能: レイヤーの表示切替', () => {
  it('Given 初期状態 / Then 地形・建物・公園・街路樹はすべて表示、街路樹は3Dピラー表示', () => {
    const s = store.getState()
    expect(s.layers).toEqual({ terrain: true, buildings: true, parks: true, trees: true })
    expect(s.treeMode).toBe('columns')
  })

  it('Given 公園が表示中 / When 公園レイヤーを切り替える / Then 非表示になり、もう一度で表示に戻る', () => {
    store.getState().toggleLayer('parks')
    expect(store.getState().layers.parks).toBe(false)
    store.getState().toggleLayer('parks')
    expect(store.getState().layers.parks).toBe(true)
  })

  it('Given 地形が表示中 / When 地形レイヤーを切り替える / Then 平面表示に戻り、もう一度で地形に戻る', () => {
    store.getState().toggleLayer('terrain')
    expect(store.getState().layers.terrain).toBe(false)
    store.getState().toggleLayer('terrain')
    expect(store.getState().layers.terrain).toBe(true)
  })

  it('Given 3Dピラー表示 / When ヒートマップを選ぶ / Then 街路樹の表示モードが変わる', () => {
    store.getState().setTreeMode('heatmap')
    expect(store.getState().treeMode).toBe('heatmap')
  })
})

describe('機能: 樹種・行政区での絞り込み', () => {
  it('Given 絞り込みなし / When サクラとイチョウを選ぶ / Then 2樹種が絞り込み対象になる', () => {
    store.getState().toggleSpecies('サクラ')
    store.getState().toggleSpecies('イチョウ')
    expect(store.getState().speciesFilter).toEqual(['サクラ', 'イチョウ'])
  })

  it('Given サクラを選択中 / When もう一度サクラを選ぶ / Then 選択が解除される', () => {
    store.getState().toggleSpecies('サクラ')
    store.getState().toggleSpecies('サクラ')
    expect(store.getState().speciesFilter).toEqual([])
  })

  it('Given 複数の樹種を選択中 / When すべて解除する / Then 絞り込みがなくなる', () => {
    store.getState().toggleSpecies('サクラ')
    store.getState().toggleSpecies('ケヤキ')
    store.getState().clearSpecies()
    expect(store.getState().speciesFilter).toEqual([])
  })

  it('Given 区の指定なし / When 千代田区を選び、次に「すべて」に戻す / Then 区の絞り込みが切り替わる', () => {
    store.getState().setWard('千代田区')
    expect(store.getState().wardFilter).toBe('千代田区')
    store.getState().setWard(null)
    expect(store.getState().wardFilter).toBeNull()
  })
})

describe('機能: 地物の選択', () => {
  it('Given 何も選択していない / When 樹木を選ぶ / Then 選択中の地物が樹木になる', () => {
    store.getState().select({ kind: 'tree', index: 42 })
    expect(store.getState().selection).toEqual({ kind: 'tree', index: 42 })
  })

  it('Given 樹木を選択中 / When 選択を解除する / Then 何も選択されていない状態に戻る', () => {
    store.getState().select({ kind: 'tree', index: 42 })
    store.getState().clearSelection()
    expect(store.getState().selection).toBeNull()
  })
})

describe('機能: 建物の緑化', () => {
  it('Given 初期状態 / Then 緑化計画は屋上50%・壁面10%で、緑化済み建物はない', () => {
    expect(store.getState().plan).toEqual({ roofRatio: 0.5, wallRatio: 0.1 })
    expect(selectTotals(store.getState()).buildingCount).toBe(0)
  })

  it('Given 建物Aを選択 / When 緑化する / Then 緑化済み一覧に追加され、計算結果が保存される', () => {
    store.getState().select({ kind: 'building', building: buildingA })
    store.getState().greenSelected()
    const entry = store.getState().greened[buildingA.id]
    expect(entry.building).toEqual(buildingA)
    expect(entry.result).toEqual(simulateGreening(buildingA, store.getState().plan))
  })

  it('Given 建物A・Bを緑化 / When エリア合計を求める / Then 棟数・緑化面積・冷房電力削減・CO2が合算される', () => {
    for (const b of [buildingA, buildingB]) {
      store.getState().select({ kind: 'building', building: b })
      store.getState().greenSelected()
    }
    const totals = selectTotals(store.getState())
    const plan = store.getState().plan
    const expected = simulateGreening(buildingA, plan).co2TotalKg + simulateGreening(buildingB, plan).co2TotalKg
    expect(totals.buildingCount).toBe(2)
    expect(totals.co2TotalKg).toBeCloseTo(expected)
    expect(totals.greenAreaM2).toBeGreaterThan(0)
    expect(totals.coolingSavedKWh).toBeCloseTo(simulateGreening(buildingA, plan).coolingSavedKWh + simulateGreening(buildingB, plan).coolingSavedKWh)
    expect(totals).not.toHaveProperty('rainRetentionM3')
  })

  it('Given 建物Aを緑化済み / When 計画を変えて再度緑化する / Then 上書きされ二重計上しない', () => {
    store.getState().select({ kind: 'building', building: buildingA })
    store.getState().greenSelected()
    store.getState().setPlan({ roofRatio: 1 })
    store.getState().greenSelected()
    const totals = selectTotals(store.getState())
    expect(totals.buildingCount).toBe(1)
    expect(totals.co2TotalKg).toBeCloseTo(simulateGreening(buildingA, { roofRatio: 1, wallRatio: 0.1 }).co2TotalKg)
  })

  it('Given 建物を選択していない / When 緑化する / Then 何も起きない', () => {
    store.getState().select({ kind: 'tree', index: 1 })
    store.getState().greenSelected()
    expect(selectTotals(store.getState()).buildingCount).toBe(0)
  })

  it('Given 建物Aを緑化済み / When 緑化を取り消す / Then 一覧から消える', () => {
    store.getState().select({ kind: 'building', building: buildingA })
    store.getState().greenSelected()
    store.getState().removeGreening(buildingA.id)
    expect(store.getState().greened[buildingA.id]).toBeUndefined()
  })

  it('Given 計画の一部だけ変更 / When setPlanする / Then 他の値は保たれる', () => {
    store.getState().setPlan({ wallRatio: 0.3 })
    expect(store.getState().plan).toEqual({ roofRatio: 0.5, wallRatio: 0.3 })
  })
})
