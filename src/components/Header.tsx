import { MethodologyModal } from './MethodologyModal'

export function Header() {
  return (
    <header className="pointer-events-auto flex items-start justify-between gap-3">
      <div className="rounded-2xl border border-white/10 bg-slate-950/75 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md">
        <p className="hidden text-[10px] font-semibold tracking-[0.3em] text-emerald-300/90 uppercase sm:block">Urban Nature, in High Resolution</p>
        <h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-white sm:text-xl">
          Urban Green Twin <span className="text-emerald-400">Tokyo</span>
        </h1>
        <p className="mt-1 hidden max-w-md text-xs leading-relaxed text-slate-400 sm:block">
          都市の自然の解像度を上げ、価値を可視化する。PLATEAUの3D建物と14万本の街路樹を重ね、緑化の効果をその場で試算します。
        </p>
      </div>
      <MethodologyModal />
    </header>
  )
}
