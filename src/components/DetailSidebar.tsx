import type { CityTreeRoute } from '../../scripts/lib/cityTrees'
import { getTreeRecord, type TreeData } from '../data/trees'
import { formatArea, formatInt, formatNum } from '../lib/format'
import { speciesColor } from '../layers/trees'
import { useAppStore, type ParkInfo } from '../store/appStore'
import { SimulationPanel } from './SimulationPanel'
import { CloseButton, EstimatedBadge, Panel, Row } from './ui'

function Header({
  kicker,
  title,
  onClose,
  swatch,
  wrapTitle,
}: {
  kicker: string
  title: string
  onClose: () => void
  swatch?: string
  /** 路線名のように長い名前は省略せず折り返す */
  wrapTitle?: boolean
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-300/80 uppercase">{kicker}</p>
        <h2 className={`mt-0.5 flex items-center gap-2 text-xl font-bold text-white ${wrapTitle ? 'break-words' : 'truncate'}`}>
          {swatch && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: swatch }} aria-hidden="true" />}
          {title}
        </h2>
      </div>
      <CloseButton onClick={onClose} />
    </div>
  )
}

function TreeDetail({ data, index, onClose }: { data: TreeData; index: number; onClose: () => void }) {
  const t = getTreeRecord(data, index)
  const [r, g, b] = speciesColor(t.species)
  return (
    <>
      <Header kicker={`Street tree · ${t.kind}`} title={t.species} onClose={onClose} swatch={`rgb(${r},${g},${b})`} />
      <dl>
        <Row label="樹高">{`${formatNum(t.heightM)} m`}</Row>
        <Row label="枝張">{t.spreadM === null ? '不明' : `${formatNum(t.spreadM)} m`}</Row>
        <Row label="幹周">{t.girthCm === null ? '不明' : `${formatInt(t.girthCm)} cm`}</Row>
        <Row label="樹齢">
          {t.girthCm === null ? (
            '不明'
          ) : t.estimatedAge === null ? (
            '推定式なし'
          ) : (
            <>
              約{t.estimatedAge.years}年
              <EstimatedBadge />
              {t.estimatedAge.formulaSpecies !== t.species && (
                <span className="block text-[10px] font-normal text-slate-400">{t.estimatedAge.formulaSpecies}の式を適用</span>
              )}
            </>
          )}
        </Row>
        <Row label="年間CO2吸収">
          {t.estimatedCo2KgPerYear === null ? (
            '対象外（中木）'
          ) : (
            <>
              {formatNum(t.estimatedCo2KgPerYear)} kg
              <EstimatedBadge />
            </>
          )}
        </Row>
        <Row label="行政区">{t.ward}</Row>
        <Row label="路線">{t.route}</Row>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        樹齢は国総研の樹種別回帰式（幹周から逆算）、CO2吸収量は国の温室効果ガスインベントリの高木1本あたりの値です。詳しくは「計算方法と出典」を参照してください。データ: 東京都建設局「都道の街路樹」
      </p>
    </>
  )
}

function CityTreeDetail({ route, onClose }: { route: CityTreeRoute; onClose: () => void }) {
  const [r, g, b] = speciesColor(route.species[0])
  return (
    <>
      <Header kicker="Street tree · 区市町村道" title={route.route} onClose={onClose} swatch={`rgb(${r},${g},${b})`} wrapTitle />
      <dl>
        {route.alias && <Row label="通称">{route.alias}</Row>}
        <Row label="行政区">{route.ward}</Row>
        <Row label="樹種">{route.species.join('、')}</Row>
        <Row label="本数">{route.count === null ? '不明' : `${formatInt(route.count)} 本`}</Row>
        <Row label="所管">{route.manager}</Row>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        区市町村道の街路樹は路線単位で公開されており、1本ごとの位置や樹高は公開されていません。そのため樹齢とCO2吸収量は算定していません。データ:
        東京都都市整備局「緑のオープンデータ（GISデータ）」
      </p>
    </>
  )
}

function ParkDetail({ park, onClose }: { park: ParkInfo; onClose: () => void }) {
  return (
    <>
      <Header kicker="Park" title={park.name} onClose={onClose} />
      <dl>
        <Row label="面積">{formatArea(park.areaM2)}</Row>
        <Row label="行政区">{park.ward}</Row>
        <Row label="管理者">
          {park.manager}
          {park.managerEstimated && <EstimatedBadge />}
        </Row>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        ポリゴン・名称・管理者は OpenStreetMap。管理者タグが無い場合は、名称に「都立」「区立」とあるときだけ推定し、それ以外は「不明」としています。
      </p>
    </>
  )
}

export function DetailSidebar({ treeData }: { treeData: TreeData | null }) {
  const selection = useAppStore((s) => s.selection)
  const clearSelection = useAppStore((s) => s.clearSelection)

  if (!selection) {
    return (
      <Panel>
        <p className="text-sm leading-relaxed text-slate-300">
          マップ上の<span className="text-green-300">街路樹</span>（都道は1本ずつ、区市町村道は路線）・<span className="text-emerald-400">公園</span>・
          <span className="text-sky-300">建物</span>をクリックすると、詳細が表示されます。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">建物を選ぶと、屋上・壁面緑化の効果をその場でシミュレーションできます。</p>
      </Panel>
    )
  }

  return (
    <Panel>
      {selection.kind === 'tree' && treeData && <TreeDetail data={treeData} index={selection.index} onClose={clearSelection} />}
      {selection.kind === 'cityTree' && <CityTreeDetail route={selection.route} onClose={clearSelection} />}
      {selection.kind === 'park' && <ParkDetail park={selection.park} onClose={clearSelection} />}
      {selection.kind === 'building' && (
        <>
          <Header kicker="Building · PLATEAU" title="緑化シミュレーション" onClose={clearSelection} />
          <SimulationPanel building={selection.building} />
        </>
      )}
    </Panel>
  )
}
