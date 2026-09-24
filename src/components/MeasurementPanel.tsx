import { useState } from 'react'
import { parseMeasurementLog, toCsvWithContext, type GreenContext, type ParseResult } from '../lib/measurementLog'
import type { ScenarioView } from '../lib/scenario'
import { useAppStore, type MeasurementRadiusM } from '../store/appStore'
import { Panel } from './ui'

const RADII: MeasurementRadiusM[] = [50, 100, 200]
const EXPORT_FILENAME = 'experiment_log_green_context.csv'
const MAX_SHOWN_ERRORS = 5

type Props = {
  /** 計測ごとの緑の文脈（measurementsと同じ並び）。地図データの読み込み中は null */
  contexts: (GreenContext | null)[]
  /** 一覧の地点を押したとき、地図をその地点へ動かす */
  onFocusPoint: (view: ScenarioView) => void
  /** CSVを端末へ保存する（サーバーには送らない） */
  downloadText: (filename: string, text: string) => void
}

const buttonClass =
  'rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'

// jsdomでも動くよう、Blob.text() ではなく FileReader で読む
const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })

/** 計測ログ（CSV）を端末の中だけで読み込み、地図に重ねて、緑の文脈つきで書き出す */
export function MeasurementPanel({ contexts, onFocusPoint, downloadText }: Props) {
  const measurements = useAppStore((s) => s.measurements)
  const radiusM = useAppStore((s) => s.measurementRadiusM)
  const setMeasurements = useAppStore((s) => s.setMeasurements)
  const clearMeasurements = useAppStore((s) => s.clearMeasurements)
  const setMeasurementRadius = useAppStore((s) => s.setMeasurementRadius)
  const select = useAppStore((s) => s.select)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<ParseResult['errors']>([])

  const load = async (file: File | undefined) => {
    if (!file) return
    setMessage('')
    let result: ParseResult
    try {
      result = parseMeasurementLog(await readText(file))
    } catch {
      setErrors([{ line: 1, message: 'ファイルを読み込めませんでした' }])
      return
    }
    setErrors(result.errors)
    // 1件も読めなかったときは、それまでの計測を残す
    if (result.records.length === 0) return
    setMeasurements(result.records)
    setMessage(`${result.records.length}件を読み込みました`)
  }

  const clear = () => {
    clearMeasurements()
    setMessage('')
    setErrors([])
  }

  const focusOn = (index: number) => {
    const { lon, lat } = measurements[index]
    select({ kind: 'measurement', index })
    onFocusPoint({ longitude: lon, latitude: lat, zoom: 17, pitch: 45, bearing: 0 })
  }

  const contextReady = measurements.length > 0 && measurements.every((_, i) => contexts[i])
  const waitingForData = measurements.length > 0 && !contextReady

  return (
    <Panel title="計測ログ">
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="計測ログ（CSV）を選ぶ"
        onChange={(e) => {
          void load(e.target.files?.[0])
          // 同じファイルを選び直しても読み込めるようにする
          e.target.value = ''
        }}
        className="block w-full text-xs text-slate-300 file:mr-2 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-2.5 file:py-1.5 file:text-xs file:text-slate-200 hover:file:bg-white/10"
      />
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        列は timestamp, location, lat, lon（必須）と environment, hrv_sdnn, heart_rate, notes（任意）。データはこの端末の中だけで扱い、送信・保存はしません（再読み込みで消えます）。
      </p>

      {message && (
        <p role="status" className="mt-2 text-xs text-emerald-300">
          {message}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="mt-2 rounded-lg bg-red-950/60 p-2 text-xs text-red-200">
          <ul className="space-y-0.5">
            {errors.slice(0, MAX_SHOWN_ERRORS).map((e) => (
              <li key={`${e.line}-${e.message}`}>
                {e.line}行目: {e.message}
              </li>
            ))}
          </ul>
          {errors.length > MAX_SHOWN_ERRORS && <p className="mt-1">ほか{errors.length - MAX_SHOWN_ERRORS}件</p>}
        </div>
      )}

      {measurements.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-0.5 overflow-y-auto">
          {measurements.map((m, i) => (
            <li key={`${m.timestamp}-${i}`}>
              <button
                type="button"
                onClick={() => focusOn(i)}
                className="w-full rounded-md px-2 py-1 text-left text-xs text-slate-200 hover:bg-white/5"
              >
                <span className="font-medium">{m.location || '（場所名なし）'}</span>
                <span className="ml-1.5 text-slate-500">{m.timestamp}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="mt-3">
        <legend className="mb-1 text-[11px] text-slate-400">緑を数える半径</legend>
        <div className="flex rounded-lg bg-white/5 p-1">
          {RADII.map((r) => (
            <label
              key={r}
              className={`flex-1 cursor-pointer rounded-md py-1 text-center text-xs transition ${
                radiusM === r ? 'bg-emerald-500/90 font-semibold text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <input type="radio" name="measurement-radius" className="sr-only" checked={radiusM === r} onChange={() => setMeasurementRadius(r)} />
              {r} m
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!contextReady}
          onClick={() => downloadText(EXPORT_FILENAME, toCsvWithContext(measurements, contexts, radiusM))}
          className={buttonClass}
        >
          緑の文脈つきCSVを書き出す
        </button>
        <button type="button" disabled={measurements.length === 0} onClick={clear} className={buttonClass}>
          消去
        </button>
      </div>
      {waitingForData && <p className="mt-2 text-[11px] text-slate-500">地図データの読み込みが終わると書き出せます。</p>}
    </Panel>
  )
}
