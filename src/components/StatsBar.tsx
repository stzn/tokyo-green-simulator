import { useShallow } from 'zustand/react/shallow'
import { formatInt } from '../lib/format'
import { selectTotals, useAppStore } from '../store/appStore'

function Stat({ label, value, unit, testId }: { label: string; value: string; unit: string; testId: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="text-[10px] tracking-wider whitespace-nowrap text-slate-400">{label}</p>
      <p className="text-base font-bold whitespace-nowrap text-white tabular-nums sm:text-lg">
        <span data-testid={testId}>{value}</span> <span className="text-[11px] font-normal text-slate-400">{unit}</span>
      </p>
    </div>
  )
}

/** 緑化した建物のエリア合計 */
export function StatsBar() {
  const totals = useAppStore(useShallow(selectTotals))
  return (
    <div className="flex divide-x divide-white/10 rounded-2xl border border-emerald-400/20 bg-slate-950/80 px-4 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-md">
      <Stat label="緑化棟数" value={formatInt(totals.buildingCount)} unit="棟" testId="stats-buildings" />
      <Stat label="緑化面積" value={formatInt(totals.greenAreaM2)} unit="m²" testId="stats-area" />
      <Stat label="CO2削減" value={formatInt(totals.co2TotalKg)} unit="kg/年" testId="stats-co2" />
      <Stat label="電力削減" value={formatInt(totals.coolingSavedKWh)} unit="kWh/年" testId="stats-cooling" />
    </div>
  )
}
