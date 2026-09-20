import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../store/appStore'
import { FilterPanel } from './FilterPanel'
import { LayerPanel } from './LayerPanel'

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))

describe('機能: レイヤーパネル', () => {
  it('Given 初期状態 / Then 地形・3D建物・公園・街路樹（都道・区市町村道）のチェックがすべてON', () => {
    render(<LayerPanel />)
    for (const name of ['地形', '3D建物', '公園', '街路樹（都道）', '街路樹（区市町村道）']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked()
    }
  })

  it('Given 区市町村道の街路樹がON / When チェックを外す / Then 区道の街路樹レイヤーが非表示になる', async () => {
    render(<LayerPanel />)
    await userEvent.click(screen.getByRole('checkbox', { name: '街路樹（区市町村道）' }))
    expect(useAppStore.getState().layers.cityTrees).toBe(false)
  })

  it('Given 地形がON / When 地形のチェックを外す / Then 地形レイヤーが非表示になる', async () => {
    render(<LayerPanel />)
    await userEvent.click(screen.getByRole('checkbox', { name: '地形' }))
    expect(useAppStore.getState().layers.terrain).toBe(false)
  })

  it('Given 公園がON / When 公園のチェックを外す / Then 公園レイヤーが非表示になる', async () => {
    render(<LayerPanel />)
    await userEvent.click(screen.getByRole('checkbox', { name: '公園' }))
    expect(useAppStore.getState().layers.parks).toBe(false)
  })

  it('Given 3Dピラー表示 / When ヒートマップを選ぶ / Then 街路樹がヒートマップ表示になる', async () => {
    render(<LayerPanel />)
    await userEvent.click(screen.getByRole('radio', { name: 'ヒートマップ' }))
    expect(useAppStore.getState().treeMode).toBe('heatmap')
  })
})

describe('機能: 絞り込みパネル', () => {
  const species = [
    { species: 'イチョウ', count: 17216 },
    { species: 'サクラ', count: 3547 },
    { species: 'ケヤキ', count: 3996 },
  ]
  const wards = ['千代田区', '新宿区']

  it('Given 樹種の一覧 / Then 樹種ボタンが本数付きで並ぶ', () => {
    render(<FilterPanel species={species} wards={wards} visibleCount={24759} />)
    expect(screen.getByRole('button', { name: /イチョウ.*17,216/ })).toBeInTheDocument()
  })

  it('Given 絞り込みなし / When サクラを押す / Then サクラで絞り込まれ、ボタンが押下状態になる', async () => {
    render(<FilterPanel species={species} wards={wards} visibleCount={24759} />)
    const sakura = screen.getByRole('button', { name: /サクラ/ })
    await userEvent.click(sakura)
    expect(useAppStore.getState().speciesFilter).toEqual(['サクラ'])
    expect(sakura).toHaveAttribute('aria-pressed', 'true')
  })

  it('Given サクラで絞り込み中 / When 解除を押す / Then 絞り込みがなくなる', async () => {
    useAppStore.getState().toggleSpecies('サクラ')
    render(<FilterPanel species={species} wards={wards} visibleCount={3547} />)
    await userEvent.click(screen.getByRole('button', { name: '樹種の絞り込みを解除' }))
    expect(useAppStore.getState().speciesFilter).toEqual([])
  })

  it('Given 区の選択肢 / When 新宿区を選び、次に「すべての区」を選ぶ / Then 区の絞り込みが切り替わる', async () => {
    render(<FilterPanel species={species} wards={wards} visibleCount={24759} />)
    const select = screen.getByRole('combobox', { name: '行政区' })
    await userEvent.selectOptions(select, '新宿区')
    expect(useAppStore.getState().wardFilter).toBe('新宿区')
    await userEvent.selectOptions(select, 'すべての区')
    expect(useAppStore.getState().wardFilter).toBeNull()
  })

  it('Given 表示中の本数 / Then 件数が表示される', () => {
    render(<FilterPanel species={species} wards={wards} visibleCount={24759} />)
    expect(within(screen.getByTestId('visible-count')).getByText('24,759')).toBeInTheDocument()
  })

  it('Given 多数の樹種 / When 検索欄に入力する / Then 一致する樹種だけが並ぶ', () => {
    render(<FilterPanel species={species} wards={wards} visibleCount={24759} />)
    fireEvent.change(screen.getByRole('searchbox', { name: '樹種を検索' }), { target: { value: 'ケヤ' } })
    expect(screen.getByRole('button', { name: /ケヤキ/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /イチョウ/ })).not.toBeInTheDocument()
  })
})
