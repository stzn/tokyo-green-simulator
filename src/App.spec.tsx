import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreesColumnar } from '../scripts/lib/parseTrees'
import App from './App'
import { parseMeasurementLog } from './lib/measurementLog'
import { buildShareUrl } from './lib/scenario'
import { simulateGreening } from './lib/simulation/greening'
import type { WardFeature } from './data/wards'
import type { Extent } from './lib/projection'
import { useAppStore } from './store/appStore'

// WebGL（MapLibre / deck.gl）はjsdomで動かないため、地図はモックにして受け取ったレイヤーだけを記録する
type View = { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number }
const mapViewProps = vi.hoisted(() => ({
  layerIds: [] as string[],
  interleaved: null as boolean | null,
  initialView: null as View | null,
  focus: null as { view: View } | null,
  onViewportChange: null as ((bounds: Extent) => void) | null,
  onViewStateChange: null as ((view: View) => void) | null,
}))
vi.mock('./components/MapView', () => ({
  MapView: ({
    layers,
    interleaved,
    initialView,
    focus,
    onViewportChange,
    onViewStateChange,
  }: {
    layers: { id: string }[]
    interleaved: boolean
    initialView: View
    focus: { view: View } | null
    onViewportChange?: (bounds: Extent) => void
    onViewStateChange?: (view: View) => void
  }) => {
    mapViewProps.layerIds = layers.map((l) => l.id)
    mapViewProps.interleaved = interleaved
    mapViewProps.initialView = initialView
    mapViewProps.focus = focus
    mapViewProps.onViewportChange = onViewportChange ?? null
    mapViewProps.onViewStateChange = onViewStateChange ?? null
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

const parks = {
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[139.75, 35.67], [139.76, 35.67], [139.76, 35.68], [139.75, 35.67]]] },
      properties: { id: 'way/1', name: '日比谷公園', ward: '千代田区', areaM2: 161600, manager: '東京都', managerEstimated: true },
    },
  ],
}

/** 街路樹（都道）・区道・公園で返すデータを分ける */
const stubFetch = (city: unknown = cityTrees) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      return Response.json(u.includes('city-trees') ? city : u.includes('parks') ? parks : trees)
    }),
  )

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))
afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

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

describe('機能: 表示範囲の緑の集計', () => {
  // trees の2本は (139.75,35.68) と (139.76,35.69)。区道の路線と公園も同じあたりにある
  const around = { west: 139.745, south: 35.675, east: 139.765, north: 35.695 }
  const faraway = { west: 138, south: 34, east: 138.1, north: 34.1 }

  it('Given 地図の表示範囲がまだ届いていない / Then 集計は出さない', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(screen.queryByTestId('area-trees')).not.toBeInTheDocument()
  })

  it('Given 緑のある範囲 / When 地図の表示範囲が届く / Then 街路樹・区道・公園を集計して表示する', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    mapViewProps.onViewportChange?.(around)
    expect(await screen.findByTestId('area-trees')).toHaveTextContent('2')
    expect(screen.getByTestId('area-city-trees')).toHaveTextContent('20')
    expect(screen.getByTestId('area-parks')).toHaveTextContent('1')
  })

  it('Given 緑の無い範囲 / When 地図の表示範囲が届く / Then 「この範囲に緑のデータはありません」と表示する', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    mapViewProps.onViewportChange?.(faraway)
    expect(await screen.findByText('この範囲に緑のデータはありません')).toBeInTheDocument()
  })

  it('Given 集計を表示中 / When サクラで絞り込む / Then 街路樹（都道）の集計も絞り込み後の本数になる', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    mapViewProps.onViewportChange?.(around)
    expect(await screen.findByTestId('area-trees')).toHaveTextContent('2')
    await userEvent.type(screen.getByRole('searchbox'), 'サクラ')
    await userEvent.click(screen.getByRole('button', { name: /サクラ/ }))
    expect(await screen.findByTestId('visible-count')).toHaveTextContent('1')
    expect(await screen.findByTestId('area-trees')).toHaveTextContent('1')
  })

  it('Given 集計を表示中 / When 地図を動かし続ける / Then 動きが止まってから集計を更新する（毎フレームは走らせない）', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    mapViewProps.onViewportChange?.(around)
    await screen.findByTestId('area-trees')
    mapViewProps.onViewportChange?.(faraway)
    // 直後はまだ前の集計のまま
    expect(screen.getByTestId('area-trees')).toHaveTextContent('2')
    expect(await screen.findByText('この範囲に緑のデータはありません')).toBeInTheDocument()
  })
})


describe('機能: 共有リンクからの復元', () => {
  const sharedView = { longitude: 139.7, latitude: 35.7, zoom: 14, pitch: 45, bearing: 10 }
  const shared = () => {
    const b = {
      id: '13101-bldg-1',
      heightM: 40,
      roofAreaM2: 1000,
      perimeterM: 130,
      polygon: [[[139.76, 35.68], [139.7611, 35.68], [139.7611, 35.6809], [139.76, 35.6809], [139.76, 35.68]]],
    }
    const plan = { roofRatio: 0.5, wallRatio: 0.1 }
    const r = buildShareUrl({ [b.id]: { building: b, plan, result: simulateGreening(b, plan) } }, sharedView, 'https://example.test/')
    if (!r.ok) throw new Error(r.reason)
    return new URL(r.url).hash
  }

  it('Given 共有リンクを開いた / When 起動する / Then 緑化した建物を復元し、地図をその視点で開く', async () => {
    window.location.hash = shared()
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(screen.getByTestId('stats-buildings')).toHaveTextContent('1')
    expect(mapViewProps.initialView).toEqual(sharedView)
  })

  it('Given 壊れたリンク（#s=xxx） / When 起動する / Then 復元せず、いつもの視点で普通に起動する', async () => {
    window.location.hash = '#s=xxx'
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(screen.getByTestId('stats-buildings')).toHaveTextContent('0')
    expect(mapViewProps.initialView).toMatchObject({ longitude: 139.7645, latitude: 35.6795 })
  })

  it('Given 共有リンクではない起動 / Then 保存と共有のボタンがある', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(screen.getByRole('button', { name: 'この端末に保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '共有リンクをコピー' })).toBeInTheDocument()
  })

  it('Given 地図を動かした / When 保存する / Then 動かした後の視点で保存される', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    const b = { id: 'x', heightM: 10, roofAreaM2: 100, perimeterM: 40, polygon: [[[139.7, 35.6], [139.71, 35.6], [139.71, 35.61], [139.7, 35.6]]] }
    const plan = { roofRatio: 0.5, wallRatio: 0 }
    useAppStore.setState({ greened: { x: { building: b, plan, result: simulateGreening(b, plan) } } })
    mapViewProps.onViewStateChange?.({ longitude: 139.8, latitude: 35.75, zoom: 12, pitch: 30, bearing: 5 })
    await userEvent.click(await screen.findByRole('button', { name: 'この端末に保存' }))
    const saved = JSON.parse(window.localStorage.getItem('urban-green-twin:scenario') ?? '{}')
    expect(saved.view).toMatchObject({ longitude: 139.8, latitude: 35.75, zoom: 12 })
  })
})

describe('機能: 計測ログの重ね合わせ', () => {
  // 街路樹（139.75, 35.68）と区道の路線の端点に一致する地点
  const { records } = parseMeasurementLog('timestamp,location,lat,lon,environment,hrv_sdnn\n2026-09-24 12:30,テスト地点,35.68,139.75,Green,58')

  it('Given 計測を読み込んでいない / Then 計測地点のレイヤーは作らない', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    expect(mapViewProps.layerIds).not.toContain('measurements')
  })

  it('Given 計測を読み込み済み / Then 計測地点のレイヤーを他のレイヤーの上に渡す', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    act(() => useAppStore.getState().setMeasurements(records))
    expect(mapViewProps.layerIds.at(-1)).toBe('measurements')
  })

  it('Given 計測を読み込み済み / When 「計測地点」を非表示にする / Then レイヤーは作られたまま非表示になる', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    act(() => useAppStore.getState().setMeasurements(records))
    await userEvent.click(screen.getByRole('checkbox', { name: '計測地点' }))
    expect(useAppStore.getState().layers.measurements).toBe(false)
  })

  it('Given 計測地点を選択 / Then 半径内の街路樹・区道を数えた緑の文脈を詳細に表示する', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    act(() => {
      useAppStore.getState().setMeasurements(records)
      useAppStore.getState().select({ kind: 'measurement', index: 0 })
    })
    expect(await screen.findByTestId('ctx-trees')).toHaveTextContent('1 本')
    expect(screen.getByTestId('ctx-city-trees')).toHaveTextContent('1 路線・20 本')
  })

  it('Given 樹種で絞り込んでいる / Then 緑の文脈は絞り込みに関係なく全件で数える（画面の状態で研究用の数値が変わらない）', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    act(() => {
      useAppStore.getState().toggleSpecies('サクラ')
      useAppStore.getState().setMeasurements(records)
      useAppStore.getState().select({ kind: 'measurement', index: 0 })
    })
    // 地点の街路樹はイチョウ。サクラだけに絞っても数える
    expect(await screen.findByTestId('ctx-trees')).toHaveTextContent('1 本')
  })

  it('Given 計測を読み込み済み / When 一覧の地点を押す / Then 地図をその地点へ動かす', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    act(() => useAppStore.getState().setMeasurements(records))
    await userEvent.click(screen.getByRole('button', { name: /テスト地点/ }))
    expect(mapViewProps.focus?.view).toMatchObject({ longitude: 139.75, latitude: 35.68 })
  })

  it('Given 計測を読み込み済み / Then 共有リンクにも保存にも計測は含まれない', async () => {
    stubFetch()
    render(<App />)
    await screen.findByTestId('visible-count')
    act(() => useAppStore.getState().setMeasurements(records))
    expect(window.location.hash).toBe('')
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('テスト地点')
  })
})
