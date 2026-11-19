import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../store/appStore'
import { DispatchPanel } from './DispatchPanel'

const fixture = (name: string) => readFileSync(join(process.cwd(), 'contracts', 'fixtures', name), 'utf-8')
const jsonFile = (text: string, name: string) => new File([text], name, { type: 'application/json' })

const setup = () => {
  const onFocusPoint = vi.fn()
  render(<DispatchPanel onFocusPoint={onFocusPoint} />)
  return { onFocusPoint }
}
const uploadStage = (text = fixture('stage.sample.json')) =>
  userEvent.upload(screen.getByLabelText('地点データ（stage.json）を選ぶ'), jsonFile(text, 'stage.json'))
const uploadDispatch = (text = fixture('dispatch.sample.json')) =>
  userEvent.upload(screen.getByLabelText('配車（dispatch.json）を選ぶ'), jsonFile(text, 'dispatch.json'))

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))

describe('機能: 配車の読み込みと時刻の表示', () => {
  it('Given 初期状態 / Then 地点データ・配車の読み込み欄とサンプルのボタンがあり、時刻のスライダーはまだ無い', () => {
    setup()
    expect(screen.getByLabelText('地点データ（stage.json）を選ぶ')).toBeInTheDocument()
    expect(screen.getByLabelText('配車（dispatch.json）を選ぶ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'サンプルを読み込む' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: '時刻' })).not.toBeInTheDocument()
  })

  it('Given 初期状態 / When サンプルを読み込む / Then 配車を保持し、最初の時刻（11 時）のスライダーを出して、区域へ地図を動かす', async () => {
    const { onFocusPoint } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    expect(await screen.findByRole('status')).toHaveTextContent('大手町・丸の内')
    expect(useAppStore.getState().dispatch?.pods).toHaveLength(2)
    expect(screen.getByRole('slider', { name: '時刻' })).toHaveValue('11')
    expect(onFocusPoint).toHaveBeenCalledWith(expect.objectContaining({ longitude: 139.765, latitude: 35.684 }))
  })

  it('Given サンプルを表示中 / When スライダーを 12 時にする / Then 時刻をストアに置き、その時刻のポッドの地点と行動を一覧にする', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    fireEvent.change(await screen.findByRole('slider', { name: '時刻' }), { target: { value: '12' } })
    expect(useAppStore.getState().dispatchHour).toBe(12)
    expect(screen.getByText('12:00')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'この時刻のポッド' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(/P1.*大手町 仲通り北の歩道.*移動/)
  })

  it('Given 地点データを読み込んだ / When 配車ファイルを選ぶ / Then 読み込んで時刻のスライダーを出す', async () => {
    setup()
    await uploadStage()
    await uploadDispatch()
    expect(await screen.findByRole('slider', { name: '時刻' })).toHaveValue('11')
  })

  it('Given 地点データが無い / When 配車ファイルを選ぶ / Then 先に地点データが要ることを知らせる', async () => {
    setup()
    await uploadDispatch()
    expect(await screen.findByRole('alert')).toHaveTextContent('先に地点データ')
    expect(useAppStore.getState().dispatch).toBeNull()
  })

  it('Given サンプルを表示中 / When 容量を超える配車を選ぶ / Then 理由を知らせ、表示中の配車は残す', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    await screen.findByRole('slider', { name: '時刻' })
    const bad = JSON.parse(fixture('dispatch.sample.json')) as { pods: { timeline: { spot_id: string }[] }[] }
    bad.pods[1].timeline[0].spot_id = 'OTM-003'
    const before = useAppStore.getState().dispatch
    await uploadDispatch(JSON.stringify(bad))
    expect(await screen.findByRole('alert')).toHaveTextContent('容量超過')
    expect(useAppStore.getState().dispatch).toBe(before)
  })

  it('Given 初期状態 / When 壊れた JSON の地点データを選ぶ / Then 例外にせず理由を知らせる', async () => {
    setup()
    await uploadStage('{"schema_version":')
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON として読めません')
    expect(useAppStore.getState().stage).toBeNull()
  })

  it('Given サンプルを表示中 / Then 行動と PET の区分の凡例を出す', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    const legend = await screen.findByRole('list', { name: '凡例' })
    for (const label of ['滞在', '移動', '散水', '快適', '非常に暑い']) expect(within(legend).getByText(new RegExp(label))).toBeInTheDocument()
  })

  it('Given サンプルを表示中 / When 消去する / Then 地点データも配車も外し、スライダーを消す', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    await screen.findByRole('slider', { name: '時刻' })
    await userEvent.click(screen.getByRole('button', { name: '消去' }))
    expect(useAppStore.getState().dispatch).toBeNull()
    expect(screen.queryByRole('slider', { name: '時刻' })).not.toBeInTheDocument()
  })
})

describe('機能: JITAI の集計の表示', () => {
  const uploadJitai = (text = fixture('jitai-summary.sample.json')) =>
    userEvent.upload(screen.getByLabelText('JITAI の集計（jitai-summary.json）を選ぶ'), jsonFile(text, 'jitai-summary.json'))

  it('Given サンプルを読み込んだ / Then JITAI の集計も読み込み、11 時の区画の判定・介入・見送りの内訳を出す', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    expect(await screen.findByRole('status')).toHaveTextContent('大手町・丸の内')
    expect(useAppStore.getState().jitaiSummary?.zones).toHaveLength(2)
    const list = screen.getByRole('list', { name: 'この時刻の JITAI（区画ごと）' })
    expect(within(list).getByText(/判定 5/)).toBeInTheDocument()
    expect(within(list).getByText(/介入 2/)).toBeInTheDocument()
    // 天候の段階（雨・PET）の見送りは「天候」と出す
    expect(within(list).getAllByText(/天候 \d+/).length).toBeGreaterThan(0)
  })

  it('Given 地点データが未読み込み / When JITAI の集計を選ぶ / Then 先に地点データを読むよう伝える', async () => {
    setup()
    await uploadJitai()
    expect(await screen.findByRole('alert')).toHaveTextContent('先に地点データ')
  })

  it('Given 地点データ / When 区域の違う集計を選ぶ / Then 理由を出し、集計は置かない', async () => {
    setup()
    await uploadStage()
    const bad = JSON.parse(fixture('jitai-summary.sample.json')) as { stage_ref: { area_id: string } }
    bad.stage_ref.area_id = 'shibuya'
    await uploadJitai(JSON.stringify(bad))
    expect(await screen.findByRole('alert')).toHaveTextContent('shibuya')
    expect(useAppStore.getState().jitaiSummary).toBeNull()
  })
})

/** デモの URL の末尾（条件のディレクトリとファイル名）から、置いてあるファイルの中身を返す */
const demoFile = (url: string) => readFileSync(join(process.cwd(), 'public', 'data', 'demo', ...String(url).split('/').slice(-2)), 'utf-8')

describe('機能: 配車のデモ（heatwave・5 台）', () => {
  const stubDemo = () => vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(demoFile(url), { status: 200 })))
  afterEach(() => vi.unstubAllGlobals())

  it('Given 初期状態 / When 「デモ: coverage」を押す / Then 3 つを読み込み、方式と判定・介入の件数を出してスライダーを出す', async () => {
    stubDemo()
    const { onFocusPoint } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'デモ: coverage' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('coverage')
    expect(status).toHaveTextContent('判定 657 件・介入 211 件')
    expect(useAppStore.getState().dispatch?.pods).toHaveLength(5)
    expect(screen.getByRole('slider', { name: '時刻' })).toBeInTheDocument()
    expect(onFocusPoint).toHaveBeenCalled()
  })

  it('Given デモの条件で rainy・5 台を選ぶ / When 「デモ: coverage」を押す / Then その条件の配車と集計を読み、条件の名前と件数を出す', async () => {
    stubDemo()
    setup()
    expect(screen.getByRole('combobox', { name: 'デモの条件' })).toHaveValue('heatwave-p5')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'デモの条件' }), 'rainy・5 台')
    await userEvent.click(screen.getByRole('button', { name: 'デモ: coverage' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('デモ（rainy・5 台・方式 coverage）: 判定 758 件・介入 145 件')
    expect(useAppStore.getState().jitaiSummary?.weather_scenario).toBe('rainy')
  })

  it('Given デモの条件で rainy・5 台・雨よけ無しを選ぶ / When 「デモ: coverage」を押す / Then 雨よけ有りより介入が少ない', async () => {
    stubDemo()
    setup()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'デモの条件' }), 'rainy・5 台・雨よけ無し')
    await userEvent.click(screen.getByRole('button', { name: 'デモ: coverage' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('デモ（rainy・5 台・雨よけ無し・方式 coverage）: 判定 783 件・介入 119 件')
  })

  it('Given coverage を表示中 / When 「デモ: greedy」を押す / Then 配車と集計が greedy に替わる', async () => {
    stubDemo()
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'デモ: coverage' }))
    await screen.findByText(/coverage/, { selector: '[role=status]' })
    await userEvent.click(screen.getByRole('button', { name: 'デモ: greedy' }))
    expect(await screen.findByText(/greedy/, { selector: '[role=status]' })).toHaveTextContent('判定 877 件・介入 52 件')
    expect(useAppStore.getState().dispatch?.generator).toMatch(/greedy$/)
    expect(useAppStore.getState().jitaiSummary?.totals.interventions).toBe(52)
  })

  it('Given coverage を表示中 / When デモのファイルが 404 / Then 理由を出し、表示中の配車を残す', async () => {
    stubDemo()
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'デモ: coverage' }))
    await screen.findByText(/coverage/, { selector: '[role=status]' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await userEvent.click(screen.getByRole('button', { name: 'デモ: greedy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('404')
    expect(useAppStore.getState().dispatch?.generator).toMatch(/coverage$/)
  })
})

describe('機能: 地点の需要の表示', () => {
  it('Given サンプルを 12 時で表示 / When 地点の色を需要にする / Then 需要の要約（合計・地点数・多い順）と需要の凡例を出す', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    fireEvent.change(await screen.findByRole('slider', { name: '時刻' }), { target: { value: '12' } })
    await userEvent.click(screen.getByRole('radio', { name: '需要' }))
    expect(useAppStore.getState().spotColor).toBe('demand')
    expect(screen.getByText(/需要: 合計 1\.8（2 地点）/)).toHaveTextContent('大手町 仲通り北の歩道')
    const legend = screen.getByRole('list', { name: '凡例' })
    expect(within(legend).getByText(/とても多い/)).toBeInTheDocument()
    expect(within(legend).queryByText(/非常に暑い/)).not.toBeInTheDocument()
  })

  it('Given 需要を表示中 / When 需要の無い時刻（3 時） / Then 需要が無いことを伝える', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'サンプルを読み込む' }))
    await userEvent.click(await screen.findByRole('radio', { name: '需要' }))
    fireEvent.change(screen.getByRole('slider', { name: '時刻' }), { target: { value: '3' } })
    expect(screen.getByText('この時刻の需要はありません')).toBeInTheDocument()
  })

  it('Given 需要が 1 件も無い地点データ / Then 需要を選べず、シミュレーターが一様とみなすことを伝える', async () => {
    setup()
    const stage = JSON.parse(fixture('stage.sample.json')) as { spots: { demand?: unknown[] }[] }
    for (const spot of stage.spots) spot.demand = []
    await uploadStage(JSON.stringify(stage))
    await uploadDispatch()
    expect(await screen.findByRole('radio', { name: '需要' })).toBeDisabled()
    expect(screen.getByText(/この地点データには需要がありません/)).toBeInTheDocument()
  })
})

describe('機能: 方式を並べて比べる（デモ）', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(demoFile(url), { status: 200 }))))
  afterEach(() => vi.unstubAllGlobals())

  it('Given 初期状態 / When 「デモ: 比べる」を押す / Then coverage を主、greedy を比較に置き、1 日の介入の合計を並べる', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'デモ: 比べる' }))
    expect(await screen.findByText(/1 日の介入: coverage 211 件・greedy 52 件/)).toBeInTheDocument()
    expect(useAppStore.getState().dispatch?.generator).toMatch(/coverage$/)
    expect(useAppStore.getState().comparison?.dispatch.generator).toMatch(/greedy$/)
  })

  it('Given 比較中 / When 14 時にする / Then その時刻の介入の件数と差、差の大きい順の区画を出す', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'デモ: 比べる' }))
    await screen.findByText(/1 日の介入/)
    fireEvent.change(screen.getByRole('slider', { name: '時刻' }), { target: { value: '14' } })
    expect(screen.getByText(/この時刻の介入: coverage 20 件・greedy 0 件（差 \+20）/)).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'この時刻の区画（方式の差）' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('区画 [1, 0] coverage 4・greedy 0（差 +4）')
  })

  it('Given 比較中 / When 「デモ: coverage」を押す / Then 比較を外す', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'デモ: 比べる' }))
    await screen.findByText(/1 日の介入/)
    await userEvent.click(screen.getByRole('button', { name: 'デモ: coverage' }))
    await screen.findByText(/方式 coverage/, { selector: '[role=status]' })
    expect(useAppStore.getState().comparison).toBeNull()
  })
})

describe('機能: 自分のファイルどうしで比べる', () => {
  const demo = (name: string) => demoFile(`heatwave-p5/${name}`)
  const compareInput = () => screen.getByLabelText('比較（配車と JITAI の集計）を選ぶ')
  const loadMain = async () => {
    await uploadStage(demo('stage.json'))
    await uploadDispatch(demo('dispatch.coverage.json'))
    await userEvent.upload(
      screen.getByLabelText('JITAI の集計（jitai-summary.json）を選ぶ'),
      jsonFile(demo('jitai-summary.coverage.json'), 'jitai-summary.json'),
    )
    await screen.findByText(/JITAI の集計.*を読み込みました/)
  }

  it('Given 主の配車・集計がそろっていない / Then 比較は選べず、理由を書く', async () => {
    setup()
    await uploadStage(demo('stage.json'))
    await uploadDispatch(demo('dispatch.coverage.json'))
    expect(compareInput()).toBeDisabled()
    expect(screen.getByText(/主の地点データ・配車・JITAI の集計を読み込むと選べます/)).toBeInTheDocument()
  })

  it('Given 主を読み込んだ / When 比較に配車と集計の 2 ファイルを選ぶ / Then 方式の名前で並べ、比較を外せる', async () => {
    setup()
    await loadMain()
    await userEvent.upload(compareInput(), [
      jsonFile(demo('jitai-summary.greedy.json'), 'b.json'),
      jsonFile(demo('dispatch.greedy.json'), 'a.json'),
    ])
    expect(await screen.findByText(/1 日の介入: coverage 211 件・greedy 52 件/)).toBeInTheDocument()
    expect(useAppStore.getState().comparison?.dispatch.generator).toMatch(/greedy$/)
    await userEvent.click(screen.getByRole('button', { name: '比較を外す' }))
    expect(useAppStore.getState().comparison).toBeNull()
    expect(screen.queryByText(/1 日の介入/)).not.toBeInTheDocument()
  })

  it('Given 主を読み込んだ / When 比較に配車 1 つだけを選ぶ / Then 理由を出し、比較は置かない', async () => {
    setup()
    await loadMain()
    await userEvent.upload(compareInput(), jsonFile(demo('dispatch.greedy.json'), 'a.json'))
    expect(await screen.findByRole('alert')).toHaveTextContent('JITAI の集計')
    expect(useAppStore.getState().comparison).toBeNull()
  })
})
