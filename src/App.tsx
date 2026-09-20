import type { PickingInfo } from '@deck.gl/core'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Attribution } from './components/Attribution'
import { DetailSidebar } from './components/DetailSidebar'
import { FilterPanel } from './components/FilterPanel'
import { Header } from './components/Header'
import { LayerPanel } from './components/LayerPanel'
import { LocatorMiniMap } from './components/LocatorMiniMap'
import { MapView } from './components/MapView'
import { StatsBar } from './components/StatsBar'
import { buildTreeMask, countBySpecies, loadTrees, type TreeData } from './data/trees'
import { loadWards, type WardFeature } from './data/wards'
import { buildingFromFeature, createBuildingsLayer, type BuildingFeature } from './layers/buildings'
import { createGreeningLayers } from './layers/greening'
import { createParksLayer, parkFromFeature } from './layers/parks'
import { createTerrainLayer } from './layers/terrain'
import { createTreeLayers } from './layers/trees'
import type { Extent } from './lib/projection'
import { useAppStore } from './store/appStore'

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: TreeData }

function useTreeData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    loadTrees(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => controller.abort()
  }, [])
  return state
}

// 区境界データ（現在地ミニマップ用）。失敗してもミニマップを出さないだけでアプリは止めない
function useWards(): WardFeature[] | null {
  const [wards, setWards] = useState<WardFeature[] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    loadWards(controller.signal)
      .then(setWards)
      .catch(() => {})
    return () => controller.abort()
  }, [])
  return wards
}

export default function App() {
  const load = useTreeData()
  const treeData = load.status === 'ready' ? load.data : null
  const wards = useWards()
  const [viewBounds, setViewBounds] = useState<Extent | null>(null)

  const { layers, treeMode, speciesFilter, wardFilter, selection, greened } = useAppStore(
    useShallow((s) => ({
      layers: s.layers,
      treeMode: s.treeMode,
      speciesFilter: s.speciesFilter,
      wardFilter: s.wardFilter,
      selection: s.selection,
      greened: s.greened,
    })),
  )
  const select = useAppStore((s) => s.select)
  // スマホでは地図を広く見せるため、操作パネルを折りたたむ（md以上では常に表示）
  const [controlsOpen, setControlsOpen] = useState(false)

  const mask = useMemo(() => (treeData ? buildTreeMask(treeData, speciesFilter, wardFilter) : null), [treeData, speciesFilter, wardFilter])
  const visibleCount = useMemo(() => (mask ? mask.reduce((n, v) => n + v, 0) : 0), [mask])
  const speciesCounts = useMemo(() => (treeData ? countBySpecies(treeData) : []), [treeData])

  const greenedList = useMemo(() => Object.values(greened), [greened])
  const selectedBuildingId = selection?.kind === 'building' ? selection.building.id : null
  const selectedParkId = selection?.kind === 'park' ? selection.park.id : null

  // 地形はヒートマップ表示のときは使わない。ヒートマップは画面上の集計で地形に追従できないうえ、
  // 地形の仕組み（TerrainExtension）が有効だとヒートマップ自体が描画されないため
  const onTerrain = layers.terrain && treeMode !== 'heatmap'

  const deckLayers = useMemo(
    () => [
      // 地形は他レイヤーの土台になるので最初に置く。
      // 非表示のときはレイヤーごと外す（visibleをfalseにするだけでは、他のレイヤーが地形に乗ったままになる）。
      // ヒートマップは画面上の集計で地形に追従できず、地形の下に隠れてしまうため、そのときも外す
      ...(onTerrain ? [createTerrainLayer()] : []),
      createParksLayer({ visible: layers.parks, selectedId: selectedParkId, terrain: onTerrain }),
      createBuildingsLayer({ visible: layers.buildings, selectedId: selectedBuildingId, greenedIds: new Set(Object.keys(greened)), terrain: onTerrain }),
      ...(treeData && mask ? createTreeLayers({ data: treeData, mask, mode: treeMode, visible: layers.trees, terrain: onTerrain }) : []),
      ...createGreeningLayers(greenedList, onTerrain),
    ],
    [onTerrain, layers, selectedParkId, selectedBuildingId, greened, greenedList, treeData, mask, treeMode],
  )

  const handlePick = (info: PickingInfo) => {
    if (!info.layer || !info.picked) return
    // MVTLayerはサブレイヤーのidが "buildings-..." になるため前方一致で判定する
    const layerId = info.layer.id
    if (layerId.startsWith('trees-columns') && info.index >= 0) select({ kind: 'tree', index: info.index })
    else if (layerId.startsWith('parks') && info.object) select({ kind: 'park', park: parkFromFeature(info.object) })
    else if (layerId.startsWith('buildings') && info.object) {
      const building = buildingFromFeature(info.object as BuildingFeature)
      if (building) select({ kind: 'building', building })
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950 font-sans text-slate-100">
      <MapView layers={deckLayers} interleaved={treeMode !== 'heatmap'} onPick={handlePick} onViewportChange={setViewBounds} />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 p-3 sm:p-4">
        <Header />

        <div className="flex min-h-0 flex-1 flex-col items-start justify-between gap-3 md:flex-row">
          <div className="pointer-events-auto flex max-h-full w-full shrink-0 flex-col gap-3 md:w-72">
            <button
              type="button"
              aria-expanded={controlsOpen}
              aria-controls="controls-panel"
              onClick={() => setControlsOpen((v) => !v)}
              className="self-start rounded-full border border-white/15 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-200 backdrop-blur md:hidden"
            >
              レイヤー・絞り込み
            </button>
            {wards && <LocatorMiniMap wards={wards} bounds={viewBounds} />}
            <aside id="controls-panel" className={`min-h-0 flex-col gap-3 overflow-y-auto ${controlsOpen ? 'flex' : 'hidden'} md:flex`}>
              <LayerPanel />
              {load.status === 'loading' && (
                <p role="status" className="rounded-xl bg-slate-950/75 p-3 text-sm text-slate-300 backdrop-blur">
                  街路樹データを読み込み中…
                </p>
              )}
              {load.status === 'error' && (
                <p role="alert" className="rounded-xl bg-red-950/80 p-3 text-sm text-red-200">
                  街路樹データの読み込みに失敗しました。{load.message}
                </p>
              )}
              {treeData && <FilterPanel species={speciesCounts} wards={treeData.dict.wards} visibleCount={visibleCount} />}
            </aside>
          </div>

          <aside
            className={`pointer-events-auto max-h-[45vh] w-full shrink-0 overflow-y-auto md:block md:max-h-full md:w-80 ${
              selection ? 'mt-auto md:mt-0' : 'hidden'
            }`}
          >
            <DetailSidebar treeData={treeData} />
          </aside>
        </div>

        <div className="pointer-events-auto flex flex-col items-start gap-2 lg:flex-row lg:items-end lg:justify-between">
          <StatsBar />
          <Attribution />
        </div>
      </div>
    </div>
  )
}
