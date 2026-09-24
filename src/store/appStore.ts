// アプリ全体の状態（レイヤー表示・絞り込み・選択・緑化計画と緑化済み建物）
import { create } from 'zustand'
import type { CityTreeRoute } from '../../scripts/lib/cityTrees'
import { createStore } from 'zustand/vanilla'
import type { PolygonRings } from '../lib/geo'
import type { Measurement } from '../lib/measurementLog'
import { simulateGreening, type GreeningPlan, type GreeningResult } from '../lib/simulation/greening'

export type LayerKey = 'terrain' | 'buildings' | 'parks' | 'trees' | 'cityTrees' | 'measurements'
export type TreeMode = 'columns' | 'heatmap'

export type BuildingInfo = {
  id: string
  heightM: number
  roofAreaM2: number
  perimeterM: number
  /** 緑化演出の描画用フットプリント */
  polygon: PolygonRings
}

export type ParkInfo = {
  id: string
  name: string
  ward: string
  areaM2: number
  manager: string
  managerEstimated: boolean
}

export type MeasurementRadiusM = 50 | 100 | 200

export type Selection =
  | { kind: 'tree'; index: number }
  | { kind: 'cityTree'; route: CityTreeRoute }
  | { kind: 'park'; park: ParkInfo }
  | { kind: 'building'; building: BuildingInfo }
  | { kind: 'measurement'; index: number }

export type GreenedBuilding = {
  building: BuildingInfo
  plan: GreeningPlan
  result: GreeningResult
}

export type AppState = {
  layers: Record<LayerKey, boolean>
  treeMode: TreeMode
  speciesFilter: string[]
  wardFilter: string | null
  selection: Selection | null
  plan: GreeningPlan
  greened: Record<string, GreenedBuilding>
  /** 読み込んだ計測ログ。健康データを含むため、メモリにだけ置き、保存・共有リンクには入れない */
  measurements: Measurement[]
  measurementRadiusM: MeasurementRadiusM

  toggleLayer: (key: LayerKey) => void
  setTreeMode: (mode: TreeMode) => void
  toggleSpecies: (species: string) => void
  clearSpecies: () => void
  setWard: (ward: string | null) => void
  select: (selection: Selection) => void
  clearSelection: () => void
  setPlan: (patch: Partial<GreeningPlan>) => void
  /** 選択中の建物に現在の計画で緑化を適用する（同じ建物は上書き） */
  greenSelected: () => void
  removeGreening: (buildingId: string) => void
  /** 保存・共有されたシナリオの緑化済み建物に置き換える */
  restoreGreened: (greened: Record<string, GreenedBuilding>) => void
  /** 計測ログを置き換える。番号で指していた計測地点の選択は外す */
  setMeasurements: (measurements: Measurement[]) => void
  clearMeasurements: () => void
  setMeasurementRadius: (radiusM: MeasurementRadiusM) => void
}

const initializer = (set: (fn: (s: AppState) => Partial<AppState>) => void, get: () => AppState): AppState => ({
  layers: { terrain: true, buildings: true, parks: true, trees: true, cityTrees: true, measurements: true },
  treeMode: 'columns',
  speciesFilter: [],
  wardFilter: null,
  selection: null,
  plan: { roofRatio: 0.5, wallRatio: 0.1 },
  greened: {},
  measurements: [],
  measurementRadiusM: 100,

  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setTreeMode: (treeMode) => set(() => ({ treeMode })),
  toggleSpecies: (species) =>
    set((s) => ({
      speciesFilter: s.speciesFilter.includes(species) ? s.speciesFilter.filter((x) => x !== species) : [...s.speciesFilter, species],
    })),
  clearSpecies: () => set(() => ({ speciesFilter: [] })),
  setWard: (wardFilter) => set(() => ({ wardFilter })),
  select: (selection) => set(() => ({ selection })),
  clearSelection: () => set(() => ({ selection: null })),
  setPlan: (patch) => set((s) => ({ plan: { ...s.plan, ...patch } })),
  greenSelected: () => {
    const { selection, plan } = get()
    if (selection?.kind !== 'building') return
    const { building } = selection
    set((s) => ({ greened: { ...s.greened, [building.id]: { building, plan, result: simulateGreening(building, plan) } } }))
  },
  removeGreening: (buildingId) =>
    set((s) => {
      const { [buildingId]: _removed, ...rest } = s.greened
      return { greened: rest }
    }),
  restoreGreened: (greened) => set(() => ({ greened })),
  setMeasurements: (measurements) => set((s) => ({ measurements, selection: s.selection?.kind === 'measurement' ? null : s.selection })),
  clearMeasurements: () => set((s) => ({ measurements: [], selection: s.selection?.kind === 'measurement' ? null : s.selection })),
  setMeasurementRadius: (measurementRadiusM) => set(() => ({ measurementRadiusM })),
})

/** テストや複数インスタンス用のファクトリ */
export const createAppStore = () => createStore<AppState>()((set, get) => initializer(set, get))
export type AppStore = ReturnType<typeof createAppStore>

/** アプリで使うReactフック */
export const useAppStore = create<AppState>()((set, get) => initializer(set, get))

export type AreaTotals = {
  buildingCount: number
  greenAreaM2: number
  coolingSavedKWh: number
  co2TotalKg: number
  cedarEquivalent: number
}

/** 緑化済み建物のエリア合計 */
export function selectTotals(state: Pick<AppState, 'greened'>): AreaTotals {
  return Object.values(state.greened).reduce<AreaTotals>(
    (t, { result: r }) => ({
      buildingCount: t.buildingCount + 1,
      greenAreaM2: t.greenAreaM2 + r.roofGreenM2 + r.wallGreenM2,
      coolingSavedKWh: t.coolingSavedKWh + r.coolingSavedKWh,
      co2TotalKg: t.co2TotalKg + r.co2TotalKg,
      cedarEquivalent: t.cedarEquivalent + r.cedarEquivalent,
    }),
    { buildingCount: 0, greenAreaM2: 0, coolingSavedKWh: 0, co2TotalKg: 0, cedarEquivalent: 0 },
  )
}
