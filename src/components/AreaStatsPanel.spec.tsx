import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AreaStatsPanel, type AreaStats } from './AreaStatsPanel'

const stats: AreaStats = {
  trees: { total: 1_234, tall: 1_000 },
  cityTrees: { routes: 12, count: 5_600, unknownRoutes: 3 },
  parks: { count: 7, areaM2: 250_000 },
}

describe('機能: 表示範囲の集計パネル', () => {
  it('Given 表示範囲に緑がある / Then 街路樹（都道）・区道・公園を桁区切りと単位つきで表示する', () => {
    render(<AreaStatsPanel stats={stats} />)
    expect(screen.getByTestId('area-trees')).toHaveTextContent('1,234')
    expect(screen.getByTestId('area-city-trees')).toHaveTextContent('5,600')
    expect(screen.getByTestId('area-parks')).toHaveTextContent('7')
    expect(screen.getByTestId('area-park-area')).toHaveTextContent('25 ha')
  })

  it('Given 区道に本数が公開されていない路線がある / Then 本数は分かる分の合計であること（不明な路線数つき）を示す', () => {
    render(<AreaStatsPanel stats={stats} />)
    expect(screen.getByTestId('area-city-trees')).toHaveTextContent('5,600')
    expect(screen.getByText(/本数不明の3路線/)).toBeInTheDocument()
  })

  it('Given 本数不明の路線が無い / Then 不明の注記は出さない', () => {
    render(<AreaStatsPanel stats={{ ...stats, cityTrees: { routes: 12, count: 5_600, unknownRoutes: 0 } }} />)
    expect(screen.queryByText(/本数不明/)).not.toBeInTheDocument()
  })

  it('Given 表示範囲に何も無い（23区の外など） / Then 「この範囲に緑のデータはありません」と表示する', () => {
    render(
      <AreaStatsPanel
        stats={{ trees: { total: 0, tall: 0 }, cityTrees: { routes: 0, count: 0, unknownRoutes: 0 }, parks: { count: 0, areaM2: 0 } }}
      />,
    )
    expect(screen.getByText('この範囲に緑のデータはありません')).toBeInTheDocument()
    expect(screen.queryByTestId('area-trees')).not.toBeInTheDocument()
  })

  it('Given まだ範囲が決まっていない / Then 集計は出さない', () => {
    render(<AreaStatsPanel stats={null} />)
    expect(screen.queryByTestId('area-trees')).not.toBeInTheDocument()
    expect(screen.queryByText('この範囲に緑のデータはありません')).not.toBeInTheDocument()
  })
})
