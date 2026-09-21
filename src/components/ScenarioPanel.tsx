import { useState } from 'react'
import { buildShareUrl, fromScenario, loadScenario, saveScenario, toScenario, type ScenarioView } from '../lib/scenario'
import { useAppStore } from '../store/appStore'
import { Panel } from './ui'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

type Props = {
  /** 保存・共有の時点の地図の視点 */
  getView: () => ScenarioView
  /** 保存したシナリオを開いたとき、地図をその視点へ動かす */
  onRestoreView: (view: ScenarioView) => void
  storage: StorageLike | null
  /** 共有リンクのもとになるページのURL */
  pageUrl: string
  copyText: (text: string) => Promise<void>
}

const buttonClass =
  'rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'

/** 緑化した建物と視点を、この端末への保存とURLで残す・共有する */
export function ScenarioPanel({ getView, onRestoreView, storage, pageUrl, copyText }: Props) {
  const greened = useAppStore((s) => s.greened)
  const restoreGreened = useAppStore((s) => s.restoreGreened)
  const [message, setMessage] = useState('')
  // クリップボードが使えなかったときに、手動でコピーしてもらうリンク
  const [manualLink, setManualLink] = useState('')
  const count = Object.keys(greened).length

  const save = () => {
    setManualLink('')
    if (!storage || !saveScenario(storage, toScenario(greened, getView()))) {
      setMessage('保存できませんでした。この端末では保存が使えません')
      return
    }
    setMessage(`${count}棟を保存しました`)
  }

  const open = () => {
    setManualLink('')
    const scenario = storage ? loadScenario(storage) : null
    const restored = scenario && fromScenario(scenario)
    if (!restored) {
      setMessage('保存された内容がありません')
      return
    }
    restoreGreened(restored.greened)
    onRestoreView(restored.view)
    setMessage(`${Object.keys(restored.greened).length}棟を開きました`)
  }

  const share = async () => {
    setManualLink('')
    const result = buildShareUrl(greened, getView(), pageUrl)
    if (!result.ok) {
      setMessage(result.reason)
      return
    }
    try {
      await copyText(result.url)
      setMessage(`共有リンクをコピーしました（${count}棟）`)
    } catch {
      setMessage('コピーできませんでした。下のリンクを手動でコピーしてください')
      setManualLink(result.url)
    }
  }

  return (
    <Panel title="Scenario">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={buttonClass} disabled={count === 0} onClick={save}>
          この端末に保存
        </button>
        <button type="button" className={buttonClass} onClick={open}>
          保存した内容を開く
        </button>
        <button type="button" className={buttonClass} disabled={count === 0} onClick={share}>
          共有リンクをコピー
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-[11px] leading-relaxed text-slate-300">
          {message}
        </p>
      )}
      {manualLink && (
        <input
          readOnly
          aria-label="共有リンク"
          value={manualLink}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-200"
        />
      )}
    </Panel>
  )
}
