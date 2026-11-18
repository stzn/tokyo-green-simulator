import { useMemo, useState } from 'react'
import {
  DEMAND_CLASSES,
  demandAt,
  dispatchHours,
  hasDemand,
  parseDispatch,
  parseJson,
  parseStage,
  PET_CATEGORIES,
  POD_ACTIONS,
  snapshotAt,
  type Dispatch,
  type LoadResult,
  type Stage,
} from '../lib/dispatch'
import { DEMO_LABEL, DEMO_POLICIES, fetchDemo, policyOf, type DemoPolicy } from '../lib/demo'
import { JITAI_RATE_CLASSES, parseJitaiSummary, zoneCellsAt } from '../lib/jitai'
import type { ScenarioView } from '../lib/scenario'
import { useAppStore } from '../store/appStore'
import { Panel } from './ui'

type Props = {
  /** 地点データを読み込んだとき、地図をその区域へ動かす */
  onFocusPoint: (view: ScenarioView) => void
}

const buttonClass =
  'rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
const fileClass =
  'block w-full text-xs text-slate-300 file:mr-2 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-2.5 file:py-1.5 file:text-xs file:text-slate-200 hover:file:bg-white/10'

const ACTION_LABELS = new Map(POD_ACTIONS.map((a) => [a.action, a.label]))
const rgba = ([r, g, b]: number[]) => `rgb(${r} ${g} ${b})`
const round5 = (v: number) => Math.round(v * 1e5) / 1e5

// jsdomでも動くよう、Blob.text() ではなく FileReader で読む（MeasurementPanel と同じ）
const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })

const readJsonFile = async (file: File): Promise<LoadResult<unknown>> => {
  try {
    return parseJson(await readText(file))
  } catch {
    return { ok: false, errors: ['ファイルを読み込めませんでした'] }
  }
}

/** 区域の中心へ地図を動かす視点。地点の円とポッドが建物の陰に隠れないよう真上から見る */
const viewOf = (stage: Stage): ScenarioView => {
  const [west, south, east, north] = stage.area.bbox
  return { longitude: round5((west + east) / 2), latitude: round5((south + north) / 2), zoom: 16, pitch: 0, bearing: 0 }
}

const describeDispatch = (stage: Stage, dispatch: Dispatch) =>
  `${stage.area.name}（${stage.date}・${dispatch.weather_scenario}）の配車 ${dispatch.pods.length} 台を読み込みました`

/** シミュレーターが書き出した配車（dispatch.json）を地点データ（stage.json）と突き合わせて読み込み、時刻を選んで地図に重ねる */
export function DispatchPanel({ onFocusPoint }: Props) {
  const stage = useAppStore((s) => s.stage)
  const dispatch = useAppStore((s) => s.dispatch)
  const hour = useAppStore((s) => s.dispatchHour)
  const setStage = useAppStore((s) => s.setStage)
  const setDispatch = useAppStore((s) => s.setDispatch)
  const setDispatchHour = useAppStore((s) => s.setDispatchHour)
  const jitaiSummary = useAppStore((s) => s.jitaiSummary)
  const setJitaiSummary = useAppStore((s) => s.setJitaiSummary)
  const clearDispatch = useAppStore((s) => s.clearDispatch)
  const spotColor = useAppStore((s) => s.spotColor)
  const setSpotColor = useAppStore((s) => s.setSpotColor)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const fail = (errs: string[]) => {
    setMessage('')
    setErrors(errs)
  }

  /** 地点データ・配車・JITAI の集計をまとめて確かめ、すべて合格したときだけ置き換える */
  const applyAll = (stageInput: unknown, dispatchInput: unknown, jitaiInput: unknown, demo = false) => {
    const s = parseStage(stageInput)
    if (!s.ok) return fail(s.errors.map((e) => `地点データ: ${e}`))
    const d = parseDispatch(dispatchInput, s.value)
    if (!d.ok) return fail(d.errors.map((e) => `配車: ${e}`))
    const j = parseJitaiSummary(jitaiInput, s.value)
    if (!j.ok) return fail(j.errors.map((e) => `JITAI の集計: ${e}`))
    setStage(s.value)
    setDispatch(d.value)
    setJitaiSummary(j.value)
    setErrors([])
    setMessage(
      demo
        ? `デモ（${DEMO_LABEL}・方式 ${policyOf(d.value.generator)}）: 判定 ${j.value.totals.decisions} 件・介入 ${j.value.totals.interventions} 件`
        : describeDispatch(s.value, d.value),
    )
    onFocusPoint(viewOf(s.value))
  }

  const loadDemo = async (policy: DemoPolicy) => {
    // 読み込みに失敗したときは、表示中のデータを残す
    const r = await fetchDemo(policy)
    if (!r.ok) return fail(r.errors)
    applyAll(r.value.stage, r.value.dispatch, r.value.jitai, true)
  }

  const loadSample = async () => {
    // サンプルは使うときだけ読み込む（通常の起動では配らない）
    const [stageJson, dispatchJson, jitaiJson] = await Promise.all([
      import('../../contracts/fixtures/stage.sample.json'),
      import('../../contracts/fixtures/dispatch.sample.json'),
      import('../../contracts/fixtures/jitai-summary.sample.json'),
    ])
    applyAll(stageJson.default, dispatchJson.default, jitaiJson.default)
  }

  const loadStageFile = async (file: File | undefined) => {
    if (!file) return
    const json = await readJsonFile(file)
    if (!json.ok) return fail(json.errors)
    const s = parseStage(json.value)
    if (!s.ok) return fail(s.errors)
    setStage(s.value)
    setErrors([])
    setMessage(`地点データ「${s.value.area.name}」（${s.value.spots.length} 地点）を読み込みました。続けて配車を選んでください`)
    onFocusPoint(viewOf(s.value))
  }

  const loadDispatchFile = async (file: File | undefined) => {
    if (!file) return
    if (!stage) return fail(['先に地点データ（stage.json）を読み込んでください（地点の座標と容量を地点データから引きます）'])
    const json = await readJsonFile(file)
    if (!json.ok) return fail(json.errors)
    // 合格しなかったときは、表示中の配車を残す
    const d = parseDispatch(json.value, stage)
    if (!d.ok) return fail(d.errors)
    setDispatch(d.value)
    setErrors([])
    setMessage(describeDispatch(stage, d.value))
  }

  const loadJitaiFile = async (file: File | undefined) => {
    if (!file) return
    if (!stage) return fail(['先に地点データ（stage.json）を読み込んでください（区画の位置を地点データの区域から決めます）'])
    const json = await readJsonFile(file)
    if (!json.ok) return fail(json.errors)
    const j = parseJitaiSummary(json.value, stage)
    if (!j.ok) return fail(j.errors)
    setJitaiSummary(j.value)
    setErrors([])
    setMessage(
      `JITAI の集計（${j.value.weather_scenario}・ワーカー ${j.value.workers} 人）を読み込みました: 判定 ${j.value.totals.decisions} 件・介入 ${j.value.totals.interventions} 件`,
    )
  }

  const clear = () => {
    clearDispatch()
    setMessage('')
    setErrors([])
  }

  const snapshot = useMemo(() => (stage && dispatch ? snapshotAt(stage, dispatch, hour) : null), [stage, dispatch, hour])
  // 配車か JITAI の集計にデータのある時刻（昇順）
  const hours = useMemo(
    () => [...new Set([...(dispatch ? dispatchHours(dispatch) : []), ...(jitaiSummary?.zones.map((z) => z.hour) ?? [])])].sort((a, b) => a - b),
    [dispatch, jitaiSummary],
  )
  const pets = snapshot?.comfort.map((c) => c.petC) ?? []
  const zones = useMemo(() => (stage && jitaiSummary ? zoneCellsAt(jitaiSummary, stage, hour) : []), [stage, jitaiSummary, hour])
  const stageHasDemand = useMemo(() => (stage ? hasDemand(stage) : false), [stage])
  // 選んだ時刻に重みのある地点（多い順）
  const demandNow = useMemo(
    () => (stage && spotColor === 'demand' ? demandAt(stage, hour).filter((d) => d.weight > 0).sort((a, b) => b.weight - a.weight) : []),
    [stage, spotColor, hour],
  )
  const demandTotal = demandNow.reduce((sum, d) => sum + d.weight, 0)

  return (
    <Panel title="配車（シミュレーターの結果）">
      <div className="space-y-2">
        <label className="block text-[11px] text-slate-400">
          地点データ（stage.json）
          <input
            type="file"
            accept=".json,application/json"
            aria-label="地点データ（stage.json）を選ぶ"
            onChange={(e) => {
              void loadStageFile(e.target.files?.[0])
              // 同じファイルを選び直しても読み込めるようにする
              e.target.value = ''
            }}
            className={`mt-1 ${fileClass}`}
          />
        </label>
        <label className="block text-[11px] text-slate-400">
          配車（dispatch.json）
          <input
            type="file"
            accept=".json,application/json"
            aria-label="配車（dispatch.json）を選ぶ"
            onChange={(e) => {
              void loadDispatchFile(e.target.files?.[0])
              e.target.value = ''
            }}
            className={`mt-1 ${fileClass}`}
          />
        </label>
        <label className="block text-[11px] text-slate-400">
          JITAI の集計（jitai-summary.json）
          <input
            type="file"
            accept=".json,application/json"
            aria-label="JITAI の集計（jitai-summary.json）を選ぶ"
            onChange={(e) => {
              void loadJitaiFile(e.target.files?.[0])
              e.target.value = ''
            }}
            className={`mt-1 ${fileClass}`}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void loadSample()} className={buttonClass}>
          サンプルを読み込む
        </button>
        <button type="button" disabled={!stage && !dispatch} onClick={clear} className={buttonClass}>
          消去
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={`デモ（${DEMO_LABEL}）`}>
        <span className="text-[11px] text-slate-400">デモ（{DEMO_LABEL}）</span>
        {DEMO_POLICIES.map((policy) => (
          <button key={policy} type="button" onClick={() => void loadDemo(policy)} className={buttonClass}>
            デモ: {policy}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        データ契約 v1（contracts/）で確かめてから重ねます。ファイルはこの端末の中だけで扱います。
      </p>

      {message && (
        <p role="status" className="mt-2 text-xs text-emerald-300">
          {message}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="mt-2 rounded-lg bg-red-950/60 p-2 text-xs text-red-200">
          <ul className="space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {stage && (dispatch || jitaiSummary) && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="dispatch-hour" className="text-[11px] text-slate-400">
              時刻
            </label>
            <span className="text-sm font-semibold text-slate-100 tabular-nums">{`${String(hour).padStart(2, '0')}:00`}</span>
          </div>
          <input
            id="dispatch-hour"
            type="range"
            min={0}
            max={23}
            step={1}
            value={hour}
            aria-label="時刻"
            onChange={(e) => setDispatchHour(Number(e.target.value))}
            className="w-full accent-emerald-400"
          />
          <p className="text-[11px] text-slate-500">
            データのある時刻: {hours.length > 0 ? `${hours[0]}〜${hours[hours.length - 1]} 時` : 'なし'}
          </p>

          <fieldset className="mt-2">
            <legend className="text-[11px] text-slate-400">地点の色</legend>
            <div className="mt-1 flex gap-3 text-xs text-slate-200">
              <label className="flex items-center gap-1">
                <input type="radio" name="spot-color" checked={spotColor === 'pet'} onChange={() => setSpotColor('pet')} />
                PET（暑さ）
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="spot-color"
                  checked={spotColor === 'demand'}
                  disabled={!stageHasDemand}
                  onChange={() => setSpotColor('demand')}
                />
                需要
              </label>
            </div>
            {!stageHasDemand && (
              <p className="mt-1 text-[11px] text-slate-500">
                この地点データには需要がありません（シミュレーターは 8〜19 時に全地点で一様とみなします）
              </p>
            )}
          </fieldset>
          {spotColor === 'demand' && (
            <p className="mt-2 text-xs text-slate-300">
              {demandNow.length > 0
                ? `需要: 合計 ${demandTotal.toFixed(1)}（${demandNow.length} 地点）、多い順に ${demandNow
                    .slice(0, 3)
                    .map((d) => d.spotName)
                    .join('・')}`
                : 'この時刻の需要はありません'}
            </p>
          )}

          {snapshot && (
            <>
              <p className="mt-2 text-xs text-slate-300">
                {pets.length > 0 ? `地点の PET: ${Math.min(...pets).toFixed(1)}〜${Math.max(...pets).toFixed(1)} ℃（${pets.length} 地点）` : 'この時刻の PET はありません'}
              </p>
              {snapshot.pods.length > 0 ? (
                <ul aria-label="この時刻のポッド" className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                  {snapshot.pods.map((p) => (
                    <li key={p.podId} className="text-xs text-slate-200">
                      <span className="font-medium">{p.podId}</span>
                      <span className="ml-1.5 text-slate-400">{p.spotName}</span>
                      <span className="ml-1.5">{ACTION_LABELS.get(p.action)}</span>
                      <span className="ml-1.5 text-slate-500 tabular-nums">健康度 {p.plantHealth.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">この時刻のポッドはありません</p>
              )}
            </>
          )}

          {jitaiSummary && (
            <div className="mt-3">
              <p className="text-xs text-slate-300">
                JITAI（{jitaiSummary.weather_scenario}・{jitaiSummary.workers} 人、{jitaiSummary.min_workers} 人未満の区画・時刻は出さない）
              </p>
              {zones.length > 0 ? (
                <ul aria-label="この時刻の JITAI（区画ごと）" className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                  {zones.map((z) => (
                    <li key={z.zone.join(',')} className="text-xs text-slate-200 tabular-nums">
                      <span className="text-slate-400">区画 [{z.zone.join(', ')}]</span>
                      <span className="ml-1.5">判定 {z.decisions}</span>
                      <span className="ml-1.5">介入 {z.interventions}（{Math.round(z.rate * 100)}%）</span>
                      <span className="ml-1.5 text-slate-500">
                        見送り 予定 {z.skipped_calendar}・ポッド {z.skipped_pods}・PET {z.skipped_pet}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">この時刻の区画はありません</p>
              )}
            </div>
          )}

          <ul aria-label="凡例" className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
            {POD_ACTIONS.map((a) => (
              <li key={a.action} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border border-white" style={{ backgroundColor: rgba(a.color) }} aria-hidden="true" />
                ポッド: {a.label}
              </li>
            ))}
            {spotColor === 'demand'
              ? DEMAND_CLASSES.map((c) => (
                  <li key={c.key} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ backgroundColor: rgba(c.color) }} aria-hidden="true" />
                    需要 {c.label}（{c.key === 'none' ? '重みなし' : `1 日の最大の ${c.range}`}）
                  </li>
                ))
              : PET_CATEGORIES.map((c) => (
                  <li key={c.key} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ backgroundColor: rgba(c.color) }} aria-hidden="true" />
                    {c.label}（{c.range}）
                  </li>
                ))}
            {jitaiSummary &&
              JITAI_RATE_CLASSES.map((c) => (
                <li key={c.label} className="flex items-center gap-1.5">
                  <span className="size-2.5 border border-white/40" style={{ backgroundColor: rgba(c.color) }} aria-hidden="true" />
                  介入率 {c.label}
                </li>
              ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
