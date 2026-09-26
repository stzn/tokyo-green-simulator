import type { CityTreeRoute } from '../../scripts/lib/cityTrees'
import { getTreeRecord, type TreeData } from '../data/trees'
import { formatArea, formatInt, formatNum } from '../lib/format'
import type { GreenContext } from '../lib/measurementLog'
import { environmentColor } from '../layers/measurements'
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

function MeasurementDetail({ index, context, onClose }: { index: number; context: GreenContext | null; onClose: () => void }) {
  const measurement = useAppStore((s) => s.measurements[index])
  const radiusM = useAppStore((s) => s.measurementRadiusM)
  if (!measurement) return null
  const [r, g, b] = environmentColor(measurement.environment)
  return (
    <>
      <Header kicker="Measurement" title={measurement.location || '（場所名なし）'} onClose={onClose} swatch={`rgb(${r},${g},${b})`} wrapTitle />
      <dl>
        <Row label="日時">{measurement.timestamp}</Row>
        <Row label="環境">{measurement.environment || '未指定'}</Row>
        <Row label="HRV（SDNN）">{measurement.hrvSdnn === null ? '未記録' : `${formatNum(measurement.hrvSdnn)} ms`}</Row>
        <Row label="心拍数">{measurement.heartRate === null ? '未記録' : `${formatNum(measurement.heartRate)} bpm`}</Row>
        {measurement.notes && <Row label="メモ">{measurement.notes}</Row>}
      </dl>
      <h3 className="mt-4 mb-1 text-[11px] font-semibold tracking-[0.2em] text-emerald-300/80 uppercase">半径{radiusM} m の緑</h3>
      {context ? (
        <dl>
          <Row label="街路樹（都道）">
            <span data-testid="ctx-trees">{formatInt(context.trees.total)} 本</span>
          </Row>
          <Row label="うち高木">
            <span data-testid="ctx-trees-tall">{formatInt(context.trees.tall)} 本</span>
          </Row>
          <Row label="街路樹（区市町村道）">
            <span data-testid="ctx-city-trees">
              {formatInt(context.cityTrees.routes)} 路線・{formatInt(context.cityTrees.count)} 本
            </span>
          </Row>
          <Row label="公園">
            <span data-testid="ctx-parks">
              {formatInt(context.parks.count)} か所{context.parks.count > 0 && `・${formatArea(context.parks.areaM2)}`}
            </span>
          </Row>
          <Row label="最寄りの公園">
            <span data-testid="ctx-nearest-park">
              {context.inPark ? '公園の中' : context.nearestParkM === null ? 'なし' : `${formatInt(context.nearestParkM)} m`}
            </span>
          </Row>
        </dl>
      ) : (
        <p className="text-xs text-slate-400">地図データを読み込み中です…</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        樹種・行政区の絞り込みにかかわらず全件で数えています。区道の路線と公園は、円に一部でも重なれば全体（本数・面積）を数えます。健康データはこの端末の中だけで扱っています。
      </p>
    </>
  )
}

export function DetailSidebar({ treeData, measurementContexts = [] }: { treeData: TreeData | null; measurementContexts?: (GreenContext | null)[] }) {
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
      {selection.kind === 'measurement' && (
        <MeasurementDetail index={selection.index} context={measurementContexts[selection.index] ?? null} onClose={clearSelection} />
      )}
      {selection.kind === 'building' && (
        <>
          <Header kicker="Building · PLATEAU" title="緑化シミュレーション" onClose={clearSelection} />
          <SimulationPanel building={selection.building} />
        </>
      )}
    </Panel>
  )
}
