import { useAppStore, type LayerKey, type TreeMode } from '../store/appStore'
import { Panel } from './ui'

const LAYERS: { key: LayerKey; label: string; swatch: string }[] = [
  { key: 'terrain', label: '地形', swatch: 'bg-stone-500' },
  { key: 'buildings', label: '3D建物', swatch: 'bg-slate-400' },
  { key: 'parks', label: '公園', swatch: 'bg-emerald-700' },
  { key: 'trees', label: '街路樹（都道）', swatch: 'bg-green-400' },
  { key: 'cityTrees', label: '街路樹（区市町村道）', swatch: 'bg-lime-300' },
]

const TREE_MODES: { mode: TreeMode; label: string }[] = [
  { mode: 'columns', label: '3Dピラー' },
  { mode: 'heatmap', label: 'ヒートマップ' },
]

export function LayerPanel() {
  const layers = useAppStore((s) => s.layers)
  const treeMode = useAppStore((s) => s.treeMode)
  const toggleLayer = useAppStore((s) => s.toggleLayer)
  const setTreeMode = useAppStore((s) => s.setTreeMode)

  return (
    <Panel title="Layers">
      <ul className="space-y-1">
        {LAYERS.map(({ key, label, swatch }) => (
          <li key={key}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-200 hover:bg-white/5">
              <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} className="size-4 accent-emerald-400" />
              <span className={`size-2.5 rounded-sm ${swatch}`} aria-hidden="true" />
              {label}
            </label>
          </li>
        ))}
      </ul>
      <fieldset className="mt-3 flex rounded-lg bg-white/5 p-1" disabled={!layers.trees}>
        <legend className="sr-only">街路樹（都道）の表示方法</legend>
        {TREE_MODES.map(({ mode, label }) => (
          <label
            key={mode}
            className={`flex-1 cursor-pointer rounded-md py-1 text-center text-xs transition has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 ${
              treeMode === mode ? 'bg-emerald-500/90 font-semibold text-slate-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            <input type="radio" name="tree-mode" className="sr-only" checked={treeMode === mode} onChange={() => setTreeMode(mode)} />
            {label}
          </label>
        ))}
      </fieldset>
    </Panel>
  )
}
