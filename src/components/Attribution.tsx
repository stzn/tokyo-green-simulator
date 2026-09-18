import { ATTRIBUTIONS } from '../config/sources'

/** データ出典（ライセンス上、常時表示する） */
export function Attribution() {
  return (
    <p className="pointer-events-auto rounded-lg bg-slate-950/70 px-2 py-1 text-[10px] leading-relaxed text-slate-400 backdrop-blur">
      出典:{' '}
      {ATTRIBUTIONS.map((a, i) => (
        <span key={a.label}>
          {i > 0 && ' ／ '}
          <a href={a.url} target="_blank" rel="noreferrer" className="underline decoration-slate-600 hover:text-slate-200" title={a.detail}>
            {a.label}
          </a>
          <span className="hidden lg:inline">（{a.detail}）</span>
        </span>
      ))}
    </p>
  )
}
