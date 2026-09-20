import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreesColumnar } from '../scripts/lib/parseTrees'
import App from './App'
import type { WardFeature } from './data/wards'
import type { Extent } from './lib/projection'
import { useAppStore } from './store/appStore'

// WebGL（MapLibre / deck.gl）はjsdomで動かないため、地図はモックにして受け取ったレイヤーだけを記録する
const mapViewProps = vi.hoisted(() => ({
  layerIds: [] as string[],
  interleaved: null as boolean | null,
  onViewportChange: null as ((bounds: Extent) => void) | null,
}))
vi.mock('./components/MapView', () => ({
  MapView: ({ layers, interleaved, onViewportChange }: { layers: { id: string }[]; interleaved: boolean; onViewportChange?: (bounds: Extent) => void }) => {
    mapViewProps.layerIds = layers.map((l) => l.id)
    mapViewProps.interleaved = interleaved
    mapViewProps.onViewportChange = onViewportChange ?? null
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

const cityTrees = {
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[139.75, 35.68], [139.76, 35.69]] },
      properties: { ward: '千代田区', species: ['イチョウ'], count: 20, route: '特別区道千第1号', alias: '', manager: '千代田区' },
    },
  ],
}

/** 街路樹（都道）と区道で返すデータを分ける */
const stubFetch = (city: unknown = cityTrees) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(String(url).includes('city-trees') ? city : trees)))

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
    stubFetch()
    render(<App />)
    expect(await screen.findByTestId('visible-count')).toHaveTextContent('2')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Urban Green Twin Tokyo')
    expect(screen.getByTestId('stats-buildings')).toBeInTheDocument()
    expect(mapViewProps.layerIds).toEqual(['terrain', 'parks', 'city-trees', 'buildings', 'trees-columns', 'greening-roof', 'greening-wall'])
  })

  it('Given 区道の街路樹データが読めない / Then そのレイヤーは作らず、他のレイヤーは従来どおり出す', async () => {
    stubFetch({ features: null })
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(mapViewProps.layerIds).not.toContain('city-trees')
    expect(mapViewProps.layerIds).toContain('trees-columns')
  })

  it('Given 地形を表示中 / When ヒートマップに切り替える / Then 地形レイヤーを外す（画面上の集計なので地形に追従できず、地形に埋もれてしまう）', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    await userEvent.click(screen.getByRole('radio', { name: 'ヒートマップ' }))
    expect(mapViewProps.layerIds).not.toContain('terrain')
    expect(mapViewProps.layerIds).toContain('trees-heatmap')
  })

  it('Given 3Dピラー表示 / Then 地形に乗せるためinterleavedで描く', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(mapViewProps.interleaved).toBe(true)
  })

  it('Given ヒートマップ表示 / Then ヒートマップはinterleavedでは描けないので、地図に重ねる方式に切り替える', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    await userEvent.click(screen.getByRole('radio', { name: 'ヒートマップ' }))
    expect(mapViewProps.interleaved).toBe(false)
  })

  it('Given 読み込み完了 / When 地形を非表示にする / Then 地形レイヤーごと外す（非表示にするだけでは他レイヤーが地形に乗ったままになる）', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    await userEvent.click(screen.getByRole('checkbox', { name: '地形' }))
    expect(mapViewProps.layerIds).not.toContain('terrain')
  })

  it('Given 読み込み完了 / When サクラで絞り込む / Then 表示本数が1になる', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    useAppStore.getState().toggleSpecies('サクラ')
    expect(await screen.findByText('1', { selector: '[data-testid="visible-count"] span' })).toBeInTheDocument()
  })
})

describe('機能: スマホ向けのパネル開閉', () => {
  it('Given 初期状態 / Then 「レイヤー・絞り込み」パネルは閉じている', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(screen.getByRole('button', { name: 'レイヤー・絞り込み' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('Given 閉じている / When ボタンを押す / Then 開き、もう一度押すと閉じる', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    const toggle = screen.getByRole('button', { name: 'レイヤー・絞り込み' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('機能: 現在地ミニマップ', () => {
  const wardFeature: WardFeature = {
    type: 'Feature',
    properties: { name: '千代田区' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [139.74, 35.7],
          [139.77, 35.7],
          [139.77, 35.68],
          [139.74, 35.68],
          [139.74, 35.7],
        ],
      ],
    },
  }

  const stubFetchWithWards = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('wards.geojson') ? Response.json({ type: 'FeatureCollection', features: [wardFeature] }) : Response.json(trees),
      ),
    )

  it('Given 区境界データを取得済み / Then ミニマップが表示される', async () => {
    stubFetchWithWards()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(await screen.findByTestId('locator-map')).toBeInTheDocument()
  })

  it('Given ミニマップを表示中 / Then 表示範囲が届く前は現在地の枠が無い', async () => {
    stubFetchWithWards()
    render(<App />)
    await screen.findByTestId('visible-count')
    await screen.findByTestId('locator-map')
    expect(screen.queryByTestId('locator-bounds')).not.toBeInTheDocument()
  })

  it('Given ミニマップを表示中 / When 地図の表示範囲が変わる / Then 現在地の枠が現れる', async () => {
    stubFetchWithWards()
    render(<App />)
    await screen.findByTestId('visible-count')
    await screen.findByTestId('locator-map')
    mapViewProps.onViewportChange?.({ west: 139.745, south: 35.685, east: 139.755, north: 35.695 })
    expect(await screen.findByTestId('locator-bounds')).toBeInTheDocument()
  })

  it('Given 区境界データの取得に失敗 / Then ミニマップは表示せず、アプリ全体は壊れない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => (String(input).includes('wards.geojson') ? new Response('', { status: 500 }) : Response.json(trees))),
    )
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(screen.queryByTestId('locator-map')).not.toBeInTheDocument()
  })
})
