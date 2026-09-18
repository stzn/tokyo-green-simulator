import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreesColumnar } from '../scripts/lib/parseTrees'
import App from './App'
import { useAppStore } from './store/appStore'

// WebGL（MapLibre / deck.gl）はjsdomで動かないため、地図はモックにして受け取ったレイヤーだけを記録する
const mapViewProps = vi.hoisted(() => ({ layerIds: [] as string[] }))
vi.mock('./components/MapView', () => ({
  MapView: ({ layers }: { layers: { id: string }[] }) => {
    mapViewProps.layerIds = layers.map((l) => l.id)
    return <div data-testid="map" />
  },
}))

const trees: TreesColumnar = {
  count: 2,
  positions: [139.75, 35.68, 139.76, 35.69],
  height: [12, 8],
  spread: [5, 4],
  girth: [150, 90],
  isTall: [1, 1],
  speciesIdx: [0, 1],
  wardIdx: [0, 0],
  routeIdx: [0, 0],
  dict: { species: ['イチョウ', 'サクラ'], wards: ['千代田区'], routes: ['内堀通り'] },
}

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))
afterEach(() => vi.unstubAllGlobals())

describe('機能: アプリの起動', () => {
  it('Given 街路樹データを読み込み中 / Then 読み込み中の表示が出る', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('読み込み中')
  })

  it('Given 読み込みに失敗 / Then エラーメッセージが出る', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('読み込みに失敗')
  })

  it('Given 読み込み完了 / Then タイトル・レイヤー・絞り込み・合計バーが揃い、地図に全レイヤーが渡る', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(trees)))
    render(<App />)
    expect(await screen.findByTestId('visible-count')).toHaveTextContent('2')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Urban Green Twin Tokyo')
    expect(screen.getByTestId('stats-buildings')).toBeInTheDocument()
    expect(mapViewProps.layerIds).toEqual(['parks', 'buildings', 'trees-columns', 'greening-roof', 'greening-wall'])
  })

  it('Given 読み込み完了 / When サクラで絞り込む / Then 表示本数が1になる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(trees)))
    render(<App />)
    await screen.findByTestId('visible-count')
    useAppStore.getState().toggleSpecies('サクラ')
    expect(await screen.findByText('1', { selector: '[data-testid="visible-count"] span' })).toBeInTheDocument()
  })
})

describe('機能: スマホ向けのパネル開閉', () => {
  it('Given 初期状態 / Then 「レイヤー・絞り込み」パネルは閉じている', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(trees)))
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(screen.getByRole('button', { name: 'レイヤー・絞り込み' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('Given 閉じている / When ボタンを押す / Then 開き、もう一度押すと閉じる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(trees)))
    render(<App />)
    await screen.findByTestId('visible-count')
    const toggle = screen.getByRole('button', { name: 'レイヤー・絞り込み' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
