import { simulateGreening } from '../lib/simulation/greening'
import { formatArea, formatInt, formatNum } from '../lib/format'
import { useAppStore, type BuildingInfo } from '../store/appStore'
import { Row } from './ui'

function RatioSlider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (ratio: number) => void }) {
  const id = `slider-${label}`
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <label htmlFor={id} className="text-slate-300">
          {label}
        </label>
        <span className="font-semibold text-emerald-300 tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-emerald-400"
      />
    </div>
  )
}

function Metric({
  label,
  value,
  unit,
  sub,
  testId,
  accent = false,
}: {
  label: string
  value: string
  unit: string
  sub?: string
  testId?: string
  accent?: boolean
}) {
  return (
    <div data-testid={testId} className={`rounded-xl p-3 ${accent ? 'bg-emerald-400/15 ring-1 ring-emerald-400/40' : 'bg-white/5'}`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-white tabular-nums">
        {value} <span className="text-xs font-normal text-slate-400">{unit}</span>
      </p>
      {sub && <p className="text-[10px] text-slate-400 tabular-nums">{sub}</p>}
    </div>
  )
}

export function SimulationPanel({ building }: { building: BuildingInfo }) {
  const plan = useAppStore((s) => s.plan)
  const setPlan = useAppStore((s) => s.setPlan)
  const greenSelected = useAppStore((s) => s.greenSelected)
  const removeGreening = useAppStore((s) => s.removeGreening)
  const isGreened = useAppStore((s) => building.id in s.greened)

  const r = simulateGreening(building, plan)

  return (
    <div className="space-y-4">
      <dl>
        <Row label="建物ID">
          <span className="font-mono text-xs">{building.id}</span>
        </Row>
        <Row label="高さ">{`${formatNum(building.heightM)} m`}</Row>
        <Row label="屋根面積">{formatArea(building.roofAreaM2)}</Row>
        <Row label="外壁面積（外周×高さ）">{formatArea(building.perimeterM * building.heightM)}</Row>
      </dl>

      <div className="space-y-3 rounded-xl border border-white/10 p-3">
        <RatioSlider label="屋上緑化率" value={plan.roofRatio} max={100} onChange={(roofRatio) => setPlan({ roofRatio })} />
        <RatioSlider label="壁面緑化率" value={plan.wallRatio} max={60} onChange={(wallRatio) => setPlan({ wallRatio })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric
          label="屋上表面温度（緑化部・夏季）"
          value={r.roofSurfaceTempDropC > 0 ? `−${formatNum(r.roofSurfaceTempDropC)}` : '—'}
          unit="℃ 目安"
          sub={r.roofSurfaceTempDropMaxC > 0 ? `最大 −${formatNum(r.roofSurfaceTempDropMaxC)} ℃（実測）` : undefined}
          testId="result-roof-temp"
          accent
        />
        <Metric
          label="壁面表面温度（緑化部）"
          value={r.wallSurfaceTempDropMaxC > 0 ? `最大 −${formatNum(r.wallSurfaceTempDropMaxC)}` : '—'}
          unit="℃"
          testId="result-wall-temp"
        />
        <Metric label="冷房等の電力削減" value={formatInt(r.coolingSavedKWh)} unit="kWh/年" testId="result-cooling" accent />
        <Metric
          label="CO2削減"
          value={formatInt(r.co2TotalKg)}
          unit="kg/年"
          sub={`スギ ${formatInt(r.cedarEquivalent)} 本分`}
          testId="result-co2"
        />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        緑化面積 屋上 {formatInt(r.roofGreenM2)} m²・壁面 {formatInt(r.wallGreenM2)} m²。CO2は屋上緑化による冷房等の電力削減分のみです。
        <br />
        <strong className="text-emerald-300">出典のある効果のみ</strong>を計算しています（計算方法と出典を参照）。
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={greenSelected}
          className="flex-1 rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110 active:scale-[0.98]"
        >
          {isGreened ? '緑化内容を更新' : '緑化する'}
        </button>
        {isGreened && (
          <button
            type="button"
            onClick={() => removeGreening(building.id)}
            className="rounded-xl border border-white/15 px-3 text-sm text-slate-300 hover:bg-white/10"
          >
            取り消す
          </button>
        )}
      </div>
    </div>
  )
}
