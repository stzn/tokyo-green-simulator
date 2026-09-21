import { formatArea, formatInt } from '../lib/format'
import { Panel, Row } from './ui'

export type AreaStats = {
  /** 街路樹（都道・単木）。絞り込み後の本数 */
  trees: { total: number; tall: number }
  /** 区市町村道の街路樹（路線単位）。本数は公開されている路線の合計 */
  cityTrees: { routes: number; count: number; unknownRoutes: number }
  parks: { count: number; areaM2: number }
}

const isEmpty = ({ trees, cityTrees, parks }: AreaStats) => trees.total === 0 && cityTrees.routes === 0 && parks.count === 0

/** いま地図に映っている範囲の緑の集計。緑化した建物の合計（StatsBar）とは別物 */
export function AreaStatsPanel({ stats }: { stats: AreaStats | null }) {
  if (!stats) return null
  if (isEmpty(stats)) {
    return (
      <Panel title="表示範囲の緑">
        <p className="text-xs text-slate-400">この範囲に緑のデータはありません</p>
      </Panel>
    )
  }
  const { trees, cityTrees, parks } = stats
  return (
    <Panel title="表示範囲の緑">
      <dl>
        <Row label="街路樹（都道）">
          <span data-testid="area-trees">{formatInt(trees.total)}</span> 本
        </Row>
        <Row label="街路樹（区市町村道）">
          <span data-testid="area-city-trees">{formatInt(cityTrees.count)}</span> 本
        </Row>
        <Row label="公園">
          <span data-testid="area-parks">{formatInt(parks.count)}</span> か所
        </Row>
        <Row label="公園の面積">
          <span data-testid="area-park-area">{formatArea(parks.areaM2)}</span>
        </Row>
      </dl>
      {cityTrees.unknownRoutes > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          区市町村道の本数は公開されている路線の合計です。本数不明の{formatInt(cityTrees.unknownRoutes)}路線は含みません。
        </p>
      )}
    </Panel>
  )
}
