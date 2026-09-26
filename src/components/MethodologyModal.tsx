import { useState } from 'react'
import {
  ALL_COEFFICIENTS,
  EXCLUDED_EFFECTS,
  GIRTH_REGRESSION_ALIASES,
  GIRTH_REGRESSIONS,
  ROOF_COOLING_RANGE_BY_INSULATION,
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

            <h3 className="mt-5 mb-1 text-sm font-semibold text-emerald-300">試算の幅</h3>
            <p className="text-xs leading-relaxed text-slate-300">
              屋上緑化の電力削減は、建物1棟ごとの断熱性能を区別せず、資料の代表値（
              {formatNum(roofCoolingSavingKWhPerM2())} kWh/m²・年）で計算しています。実際は断熱性能で大きく変わり、東京の業務建物では通年の空調負荷削減率が
              断熱なし {ROOF_COOLING_RANGE_BY_INSULATION.tokyo.none}％、断熱25mm {ROOF_COOLING_RANGE_BY_INSULATION.tokyo.mm25}％、断熱50mm{' '}
              {ROOF_COOLING_RANGE_BY_INSULATION.tokyo.mm50.toFixed(1)}％と報告されています（
              <a href={ROOF_COOLING_RANGE_BY_INSULATION.url} target="_blank" rel="noreferrer" className="text-emerald-300 underline">
                環境省ガイドライン 図3.32
              </a>
              ）。断熱の薄い古い建物ほど効果が大きく出ます。
            </p>

            <h3 className="mt-5 mb-1 text-sm font-semibold text-emerald-300">計測地点まわりの緑</h3>
            <ul className="mb-2 list-disc space-y-0.5 pl-5 text-xs text-slate-300">
              <li>読み込んだ計測ログの各地点を中心に、選んだ半径（50・100・200 m）の円の中を数えます。緑化の試算とは別の集計です</li>
              <li>樹種・行政区の絞り込みに関係なく全件で数えます。画面の状態で数値が変わらないようにするためです</li>
              <li>街路樹（都道）は円の中にある単木の本数（うち高木）。区市町村道は円の中を通る路線の数と、本数が公開されている路線の本数の合計です</li>
              <li>
                公園は円に一部でも重なるものを数え、面積は公園全体の面積を足します。円と重なる部分の面積は求めていません。最寄りの公園までの距離は外周までの距離で、公園の中なら
                0 m です
              </li>
              <li>区市町村道の路線と公園は全体を数えるため、円の端では実際より多めになります</li>
            </ul>

            <h3 className="mt-5 mb-1 text-sm font-semibold text-emerald-300">計算に含めていないもの</h3>
            <p className="mb-1 text-xs text-slate-400">それぞれ原典に当たって確認し、含めない理由を書いています（2026年9月調査）。</p>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {EXCLUDED_EFFECTS.map((e) => (
                <li key={e.label}>
                  <span className="font-semibold text-slate-200">{e.label}</span>
                  <br />
                  {e.reason}
                  <br />
                  <span className="text-slate-500">確認した資料: {e.checked}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
