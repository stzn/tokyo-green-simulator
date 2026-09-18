// 小さな共通UI部品
import type { ReactNode } from 'react'

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-slate-950/75 p-4 shadow-2xl shadow-black/40 backdrop-blur-md ${className}`}>
      {title && <h2 className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-emerald-300/80 uppercase">{title}</h2>}
      {children}
    </section>
  )
}

/** 推定値であることを示すバッジ */
export function EstimatedBadge() {
  return <span className="ml-1.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">推定</span>
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 text-sm last:border-0">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-100 tabular-nums">{children}</dd>
    </div>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="閉じる"
      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
      </svg>
    </button>
  )
}
