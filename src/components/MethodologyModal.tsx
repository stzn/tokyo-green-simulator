import { useState } from 'react'
import {
  ALL_COEFFICIENTS,
  GIRTH_REGRESSION_ALIASES,
  GIRTH_REGRESSIONS,
  roofCoolingSavingKWhPerM2,
  streetTreeCo2KgPerYear,
  type Coefficient,
} from '../lib/simulation/coefficients'
import { formatNum } from '../lib/format'
import { CloseButton } from './ui'

function CoefficientTable({ rows }: { rows: Coefficient[] }) {
  return (
    <table className="w-full text-left text-xs">
      <tbody>
        {rows.map((c) => (
          <tr key={c.label} className="border-b border-white/5 align-top">
            <td className="py-2 pr-2 text-slate-200">
              {c.label}
              <p className="mt-0.5 text-[11px] text-slate-500">
                {c.source}{' '}
                <a href={c.url} target="_blank" rel="noreferrer" className="text-emerald-300 underline decoration-emerald-300/40 hover:text-emerald-200">
                  出典
                </a>
              </p>
            </td>
            <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap text-white tabular-nums">
              {c.value} <span className="font-normal text-slate-400">{c.unit}</span>
            </td>
            <td className="py-2 text-right">
              {c.verified ? (
                <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-emerald-300">確認済</span>
              ) : (
                <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-amber-300">未確認</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const aliasText = Object.entries(GIRTH_REGRESSION_ALIASES)
  .map(([from, to]) => `${from}→${to}`)
  .join('、')

export function MethodologyModal() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-200 backdrop-blur hover:border-emerald-300/60 hover:text-white"
      >
        計算方法と出典
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="methodology-title"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-5 text-slate-200 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between">
              <h2 id="methodology-title" className="text-lg font-bold text-white">
                計算方法と出典
              </h2>
              <CloseButton onClick={() => setOpen(false)} />
            </div>
            <p className="mb-4 rounded-lg bg-emerald-400/10 p-3 text-xs leading-relaxed text-emerald-100">
              公的資料で出典を確認できた効果だけを計算しています（2026年9月確認）。いずれも既存資料の代表値による概算で、個別建物の設計判断には現地条件を踏まえた詳細検討が必要です。地形（標高）は表示のためだけに使っており、ここでの試算には影響しません。街路樹のCO2吸収量は都道の単木データだけを対象にしており、路線単位で公開されている区市町村道の街路樹は含みません。
            </p>

            <h3 className="mt-4 mb-1 text-sm font-semibold text-emerald-300">建物緑化</h3>
            <ul className="mb-2 list-disc space-y-0.5 pl-5 text-xs text-slate-300">
              <li>屋上緑化面積 = 屋根面積（PLATEAU buildingRoofEdgeArea）× 屋上緑化率</li>
              <li>壁面緑化面積 = 外周長 × 高さ（measuredHeight）× 壁面緑化率</li>
              <li>表面温度：緑化した部分の低下量（屋上は目安と最大の実測、壁面は最大）。屋上全体の平均ではありません</li>
              <li>
                冷房等の電力削減 = 屋上緑化面積 × {formatNum(roofCoolingSavingKWhPerM2(), 2)} kWh/m²・年（5.218 kg-CO2 ÷ 当時の排出係数 0.555）
              </li>
              <li>CO2削減 = 電力削減 × 電力の排出係数</li>
            </ul>

            <h3 className="mt-5 mb-1 text-sm font-semibold text-emerald-300">街路樹</h3>
            <ul className="mb-2 list-disc space-y-0.5 pl-5 text-xs text-slate-300">
              <li>
                推定樹齢 =（胸高幹周 − b）÷ a（国総研の{Object.keys(GIRTH_REGRESSIONS).length}樹種の回帰式）。式のない樹種は「推定式なし」。{aliasText}
                の式を適用
              </li>
              <li>年間CO2吸収 = 高木1本あたり 0.0108 t-C × 44/12 ＝ {formatNum(streetTreeCo2KgPerYear())} kg。国の算定と同じく中木は対象外</li>
            </ul>

            <h3 className="mt-5 mb-1 text-sm font-semibold text-emerald-300">係数と出典</h3>
            <CoefficientTable rows={ALL_COEFFICIENTS} />

            <h3 className="mt-5 mb-1 text-sm font-semibold text-emerald-300">計算に含めていないもの</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-300">
              <li>屋上・壁面の植物によるCO2固定（国のインベントリでも高木以外は計上しない）</li>
              <li>雨水の一時貯留（植栽基盤ごとの公的な原単位が見つからないため）</li>
              <li>
                壁面緑化による冷房負荷の削減（査読付き論文はあるが、断熱のほぼ無い実験棟が対象で一般建築物への適用は過大評価になるため見送り。山崎ほか
                (2009)『熱的薄い壁体建物の屋上・壁面緑化による冷房負荷低減効果』日本建築学会技術報告集）
              </li>
              <li>植栽タイプ（セダム・芝・低中木）による差（タイプ別の公的な数値がないため。環境省ガイドラインはセダム系の効果を「限定的」としている）</li>
              <li>周辺気温の低下（建物単位では推計手法が確立していないため）</li>
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
