import { useState } from 'react'
import { formatInt } from '../lib/format'
import { speciesColor } from '../layers/trees'
import { useAppStore } from '../store/appStore'
import { Panel } from './ui'

type Props = {
  /** 本数の多い順の樹種一覧 */
  species: { species: string; count: number }[]
  wards: string[]
  visibleCount: number
}

/** 検索していないときに並べる樹種の数 */
const TOP_N = 12

export function FilterPanel({ species, wards, visibleCount }: Props) {
  const speciesFilter = useAppStore((s) => s.speciesFilter)
  const wardFilter = useAppStore((s) => s.wardFilter)
  const toggleSpecies = useAppStore((s) => s.toggleSpecies)
  const clearSpecies = useAppStore((s) => s.clearSpecies)
  const setWard = useAppStore((s) => s.setWard)
  const [query, setQuery] = useState('')

  const q = query.trim()
  const candidates = q ? species.filter((s) => s.species.includes(q)) : species.slice(0, TOP_N)
  // 選択中の樹種は検索結果に無くても常に表示する
  const shown = [...species.filter((s) => speciesFilter.includes(s.species) && !candidates.includes(s)), ...candidates]

  return (
    <Panel title="Filter">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs text-slate-400">表示中の街路樹</span>
        <span data-testid="visible-count" className="text-sm text-slate-300">
          <span className="text-lg font-semibold text-emerald-300 tabular-nums">{formatInt(visibleCount)}</span> 本
        </span>
      </div>

      <label className="mb-1 block text-xs text-slate-400" htmlFor="ward-select">
        行政区
      </label>
      <select
        id="ward-select"
        value={wardFilter ?? ''}
        onChange={(e) => setWard(e.target.value === '' ? null : e.target.value)}
        className="mb-3 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
      >
        <option value="">すべての区</option>
        {wards.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>

      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-slate-400">樹種</span>
        {speciesFilter.length > 0 && (
          <button type="button" onClick={clearSpecies} aria-label="樹種の絞り込みを解除" className="text-xs text-emerald-300 hover:underline">
            解除（{speciesFilter.length}）
          </button>
        )}
      </div>
      <input
        type="search"
        aria-label="樹種を検索"
        placeholder={`${species.length}種から検索`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
      />
      <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1">
        {shown.map(({ species: name, count }) => {
          const active = speciesFilter.includes(name)
          const [r, g, b] = speciesColor(name)
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSpecies(name)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                active ? 'border-emerald-300 bg-emerald-400/20 text-white' : 'border-white/10 text-slate-300 hover:border-white/30'
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: `rgb(${r},${g},${b})` }} aria-hidden="true" />
              {name}
              <span className="text-slate-500 tabular-nums">{formatInt(count)}</span>
            </button>
          )
        })}
        {shown.length === 0 && <p className="text-xs text-slate-500">該当する樹種がありません</p>}
      </div>
    </Panel>
  )
}
