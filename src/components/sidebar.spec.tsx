import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { toTreeData } from '../data/trees'
import { parseMeasurementLog, type GreenContext } from '../lib/measurementLog'
import { selectTotals, useAppStore, type BuildingInfo } from '../store/appStore'
import { DetailSidebar } from './DetailSidebar'
import { MethodologyModal } from './MethodologyModal'
import { StatsBar } from './StatsBar'

const treeData = toTreeData({
  count: 4,
  positions: [139.75, 35.68, 139.76, 35.69, 139.77, 35.7, 139.78, 35.71],
  height: [12, 2, 2.5, 8],
  spread: [5, -1, 1, 6],
  girth: [150, -1, 40, 120],
  isTall: [1, 0, 0, 1],
  speciesIdx: [0, 1, 1, 2],
  wardIdx: [0, 0, 0, 0],
  routeIdx: [0, 0, 0, 0],
  dict: { species: ['イチョウ', 'トキワマンサク', 'サクラ'], wards: ['千代田区'], routes: ['内堀通り'] },
})

const building: BuildingInfo = {
  id: '13101-bldg-1141',
  heightM: 40,
  roofAreaM2: 1000,
  perimeterM: 130,
  polygon: [
    [
      [139.76, 35.68],
      [139.7611, 35.68],
      [139.7611, 35.6809],
      [139.76, 35.6809],
      [139.76, 35.68],
    ],
  ],
}

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))

describe('機能: 詳細サイドバー', () => {
  it('Given 何も選択していない / Then 操作ガイドを表示する', () => {
    render(<DetailSidebar treeData={treeData} />)
    expect(screen.getByText(/クリック/)).toBeInTheDocument()
  })

  describe('シナリオ: 樹木を選択する', () => {
    it('Given 高木のイチョウを選択 / Then 樹種・樹高・幹周・路線と、「推定」付きの樹齢（回帰式）・CO2吸収量を表示する', () => {
      useAppStore.getState().select({ kind: 'tree', index: 0 })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByRole('heading', { name: 'イチョウ' })).toBeInTheDocument()
      expect(screen.getByText('12 m')).toBeInTheDocument()
      expect(screen.getByText('150 cm')).toBeInTheDocument()
      expect(screen.getByText('内堀通り')).toBeInTheDocument()
      expect(screen.getByText(/約54年/)).toBeInTheDocument()
      expect(screen.getByText(/39\.6 kg/)).toBeInTheDocument()
      expect(screen.getAllByText('推定').length).toBeGreaterThanOrEqual(2)
    })

    it('Given CSVの「サクラ」を選択 / Then ソメイヨシノの式を適用したことを表示する', () => {
      useAppStore.getState().select({ kind: 'tree', index: 3 })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByText(/ソメイヨシノの式/)).toBeInTheDocument()
    })

    it('Given 回帰式のない樹種の中木 / Then 樹齢は「推定式なし」、CO2は「対象外（中木）」と表示する', () => {
      useAppStore.getState().select({ kind: 'tree', index: 2 })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByText('推定式なし')).toBeInTheDocument()
      expect(screen.getByText('対象外（中木）')).toBeInTheDocument()
    })

    it('Given 幹周が欠損した樹木 / Then 幹周・樹齢は「不明」と表示する', () => {
      useAppStore.getState().select({ kind: 'tree', index: 1 })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getAllByText('不明').length).toBeGreaterThanOrEqual(2)
    })

    it('Given 樹木を選択中 / When 閉じるを押す / Then 選択が解除される', async () => {
      useAppStore.getState().select({ kind: 'tree', index: 0 })
      render(<DetailSidebar treeData={treeData} />)
      await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
      expect(useAppStore.getState().selection).toBeNull()
    })
  })

  describe('シナリオ: 公園を選択する', () => {
    it('Given 管理者が推定の公園 / Then 名称・面積(ha)・区・「推定」付きの管理者を表示する', () => {
      useAppStore.getState().select({
        kind: 'park',
        park: { id: 'way/1', name: '日比谷公園', ward: '千代田区', areaM2: 161600, manager: '東京都', managerEstimated: true },
      })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByRole('heading', { name: '日比谷公園' })).toBeInTheDocument()
      expect(screen.getByText('16.16 ha')).toBeInTheDocument()
      expect(screen.getByText('東京都')).toBeInTheDocument()
      expect(screen.getByText('推定')).toBeInTheDocument()
    })
  })

  describe('シナリオ: 区道の街路樹（路線）を選択する', () => {
    const route = { ward: '世田谷区', species: ['イチョウ', 'サクラ'], count: 120, route: '特別区道世1号', alias: '区役所通り', manager: '世田谷区' }

    it('Given 本数の分かる路線を選択 / Then 路線名・通称・区・樹種・本数・所管を表示する', () => {
      useAppStore.setState({ selection: { kind: 'cityTree', route } })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('特別区道世1号')
      expect(screen.getByText('区役所通り')).toBeInTheDocument()
      // 行政区と所管の両方に区名が入る
      expect(screen.getAllByText('世田谷区')).toHaveLength(2)
      expect(screen.getByText('イチョウ、サクラ')).toBeInTheDocument()
      expect(screen.getByText('120 本')).toBeInTheDocument()
    })

    it('Given 本数が公開されていない路線を選択 / Then 本数は「不明」と表示する', () => {
      useAppStore.setState({ selection: { kind: 'cityTree', route: { ...route, count: null } } })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByText('不明')).toBeInTheDocument()
    })

    it('Given 路線を選択 / Then 単木の情報が無いことを断り、樹高や樹齢・CO2は出さない', () => {
      useAppStore.setState({ selection: { kind: 'cityTree', route } })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.queryByText('樹高')).not.toBeInTheDocument()
      expect(screen.queryByText('推定樹齢')).not.toBeInTheDocument()
      expect(screen.getByText(/1本ごとの位置や樹高は公開されていません/)).toBeInTheDocument()
    })

    it('Given 通称名の無い路線を選択 / Then 通称の行を出さない', () => {
      useAppStore.setState({ selection: { kind: 'cityTree', route: { ...route, alias: '' } } })
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.queryByText('通称')).not.toBeInTheDocument()
    })
  })

  describe('シナリオ: 建物を選択して緑化をシミュレーションする', () => {
    beforeEach(() => useAppStore.getState().select({ kind: 'building', building }))

    it('Given 建物を選択 / Then 建物IDと高さ・屋根面積、既定の計画での効果を表示する', () => {
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByText('13101-bldg-1141')).toBeInTheDocument()
      expect(screen.getByText('40 m')).toBeInTheDocument()
      expect(screen.getByText('1,000 m²')).toBeInTheDocument()
      // 緑化部分の表面温度は目安15℃・最大23.7℃（緑化率で按分しない）
      expect(screen.getByTestId('result-roof-temp')).toHaveTextContent('−15')
      expect(screen.getByTestId('result-roof-temp')).toHaveTextContent('最大 −23.7')
      // 屋上500m² × 9.40kWh
      expect(screen.getByTestId('result-cooling')).toHaveTextContent('4,701')
    })

    it('Given 屋上緑化率50% / When スライダーを100%にする / Then 冷房の電力削減が倍になる', () => {
      render(<DetailSidebar treeData={treeData} />)
      fireEvent.change(screen.getByRole('slider', { name: '屋上緑化率' }), { target: { value: '100' } })
      expect(useAppStore.getState().plan.roofRatio).toBe(1)
      expect(screen.getByTestId('result-cooling')).toHaveTextContent('9,402')
    })

    it('Given 根拠のない植栽タイプ別の差 / Then 植栽タイプの選択肢は表示しない', () => {
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.queryByRole('radio', { name: '低中木' })).not.toBeInTheDocument()
    })

    it('Given 壁面緑化10% / Then 壁面の表面温度低下（最大10℃）を表示する', () => {
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByTestId('result-wall-temp')).toHaveTextContent('最大 −10')
    })

    it('Given 未緑化の建物 / When 「緑化する」を押す / Then 緑化済みになり、ボタンが「更新」と「取り消す」に変わる', async () => {
      render(<DetailSidebar treeData={treeData} />)
      await userEvent.click(screen.getByRole('button', { name: '緑化する' }))
      expect(useAppStore.getState().greened[building.id]).toBeDefined()
      expect(screen.getByRole('button', { name: '緑化内容を更新' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '取り消す' }))
      expect(useAppStore.getState().greened[building.id]).toBeUndefined()
    })

    it('Given 計算の範囲 / Then 出典のある効果だけを計算していることを明示する', () => {
      render(<DetailSidebar treeData={treeData} />)
      expect(screen.getByText(/出典のある効果のみ/)).toBeInTheDocument()
    })
  })
})

describe('機能: エリア合計バー', () => {
  it('Given 緑化なし / Then 0棟と表示する', () => {
    render(<StatsBar />)
    expect(screen.getByTestId('stats-buildings')).toHaveTextContent('0')
  })

  it('Given 建物を1棟緑化 / Then 棟数とCO2削減量が表示される', () => {
    useAppStore.getState().select({ kind: 'building', building })
    useAppStore.getState().greenSelected()
    render(<StatsBar />)
    expect(screen.getByTestId('stats-buildings')).toHaveTextContent('1')
    const co2 = Math.round(selectTotals(useAppStore.getState()).co2TotalKg).toLocaleString('ja-JP')
    expect(screen.getByTestId('stats-co2')).toHaveTextContent(co2)
    expect(screen.getByTestId('stats-cooling')).toBeInTheDocument()
    expect(screen.queryByTestId('stats-rain')).not.toBeInTheDocument()
  })
})

describe('機能: 計算方法と出典のモーダル', () => {
  it('Given 閉じている / When 「計算方法と出典」を押す / Then 係数がすべて「確認済」で、出典へのリンクがある', async () => {
    render(<MethodologyModal />)
    await userEvent.click(screen.getByRole('button', { name: '計算方法と出典' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('電力のCO2排出係数')
    expect(dialog).toHaveTextContent('0.421')
    expect(screen.queryByText('未確認')).not.toBeInTheDocument()
    expect(screen.getAllByText('確認済').length).toBeGreaterThan(0)
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href')?.startsWith('https://www.env.go.jp/'))).toBe(true)
  })

  it('Given 開いている / Then 「計測地点まわりの緑」の節で、数え方（半径・全件・重なる公園は全体）を示す', async () => {
    render(<MethodologyModal />)
    await userEvent.click(screen.getByRole('button', { name: '計算方法と出典' }))
    expect(screen.getByRole('heading', { name: '計測地点まわりの緑' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('絞り込みに関係なく全件')
    expect(dialog).toHaveTextContent('公園全体の面積')
    expect(dialog).toHaveTextContent('重なる部分の面積は求めていません')
  })

  it('Given 開いている / Then 「計算に含めていないもの」の節で、効果ごとに調べた資料と含めない理由を示す', async () => {
    render(<MethodologyModal />)
    await userEvent.click(screen.getByRole('button', { name: '計算方法と出典' }))
    expect(screen.getByRole('heading', { name: '計算に含めていないもの' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    // 「根拠が見つからない」ではなく、当たった資料が分かること
    expect(dialog).toHaveTextContent('東京都雨水貯留・浸透施設技術指針')
    expect(dialog).toHaveTextContent('日本国温室効果ガスインベントリ報告書2025年')
    expect(dialog).toHaveTextContent('蒸散量が少なく、対策効果が限定的')
  })

  it('Given 開いている / Then 屋上緑化の削減量が建物の断熱性能で変わることを、出典つきで示す', async () => {
    render(<MethodologyModal />)
    await userEvent.click(screen.getByRole('button', { name: '計算方法と出典' }))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('heading', { name: '試算の幅' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('12.4')
    expect(dialog).toHaveTextContent('5.0')
    expect(dialog).toHaveTextContent('図3.32')
  })

  it('Given 開いている / When 閉じるを押す / Then ダイアログが消える', async () => {
    render(<MethodologyModal />)
    await userEvent.click(screen.getByRole('button', { name: '計算方法と出典' }))
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('機能: 計測地点の詳細', () => {
  const { records } = parseMeasurementLog(
    'timestamp,location,lat,lon,environment,hrv_sdnn,heart_rate,notes\n2026-09-24 12:30,紀尾井町緑地,35.679,139.737,Green,58,68,ベンチ着席\n2026-09-24 12:40,ビル街,35.68,139.74,Urban,,,',
  )
  const context: GreenContext = {
    trees: { total: 12, tall: 9 },
    cityTrees: { routes: 2, count: 30 },
    parks: { count: 1, areaM2: 5000 },
    nearestParkM: 0,
    inPark: true,
  }
  const open = (index: number, contexts: (GreenContext | null)[]) => {
    useAppStore.setState({ measurements: records, measurementRadiusM: 100, selection: { kind: 'measurement', index } })
    render(<DetailSidebar treeData={treeData} measurementContexts={contexts} />)
  }

  it('Given 計測地点を選択 / Then 場所・日時・環境・HRV・心拍・メモを表示する', () => {
    open(0, [context, null])
    expect(screen.getByRole('heading', { name: '紀尾井町緑地' })).toBeInTheDocument()
    expect(screen.getByText('2026-09-24 12:30')).toBeInTheDocument()
    expect(screen.getByText('Green')).toBeInTheDocument()
    expect(screen.getByText('58 ms')).toBeInTheDocument()
    expect(screen.getByText('68 bpm')).toBeInTheDocument()
    expect(screen.getByText('ベンチ着席')).toBeInTheDocument()
  })

  it('Given HRVと心拍が無い計測 / Then 「未記録」と表示する', () => {
    open(1, [context, context])
    expect(screen.getAllByText('未記録')).toHaveLength(2)
  })

  it('Given 緑の文脈が計算済み / Then 半径を見出しに、街路樹・区道・公園の値を表示する', () => {
    open(0, [context, null])
    expect(screen.getByText(/半径100 m/)).toBeInTheDocument()
    expect(screen.getByTestId('ctx-trees')).toHaveTextContent('12 本')
    expect(screen.getByTestId('ctx-trees-tall')).toHaveTextContent('9 本')
    expect(screen.getByTestId('ctx-city-trees')).toHaveTextContent('2 路線・30 本')
    expect(screen.getByTestId('ctx-parks')).toHaveTextContent('1 か所')
    expect(screen.getByTestId('ctx-nearest-park')).toHaveTextContent('公園の中')
  })

  it('Given 公園の外の地点 / Then 最寄りの公園までの距離を表示する', () => {
    open(0, [{ ...context, inPark: false, nearestParkM: 166.8, parks: { count: 0, areaM2: 0 } }, null])
    expect(screen.getByTestId('ctx-nearest-park')).toHaveTextContent('167 m')
  })

  it('Given 地図データが読み込み中 / Then 読み込み中と表示する', () => {
    open(0, [null, null])
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument()
  })

  it('Given 計測地点の詳細 / When 閉じるを押す / Then 選択が外れる', async () => {
    open(0, [context, null])
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(useAppStore.getState().selection).toBeNull()
  })
})
