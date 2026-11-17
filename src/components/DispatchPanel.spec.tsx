import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  userEvent.upload(screen.getByLabelText('舞台（stage.json）を選ぶ'), jsonFile(text, 'stage.json'))
const uploadDispatch = (text = fixture('dispatch.sample.json')) =>
  userEvent.upload(screen.getByLabelText('配車（dispatch.json）を選ぶ'), jsonFile(text, 'dispatch.json'))

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))

describe('機能: 配車の読み込みと時刻の表示', () => {
  it('Given 初期状態 / Then 舞台・配車の読み込み欄とサンプルのボタンがあり、時刻のスライダーはまだ無い', () => {
    setup()
    expect(screen.getByLabelText('舞台（stage.json）を選ぶ')).toBeInTheDocument()
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

  it('Given 舞台を読み込んだ / When 配車ファイルを選ぶ / Then 読み込んで時刻のスライダーを出す', async () => {
    setup()
    await uploadStage()
    await uploadDispatch()
    expect(await screen.findByRole('slider', { name: '時刻' })).toHaveValue('11')
  })

  it('Given 舞台が無い / When 配車ファイルを選ぶ / Then 先に舞台が要ることを知らせる', async () => {
    setup()
    await uploadDispatch()
    expect(await screen.findByRole('alert')).toHaveTextContent('先に舞台')
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

  it('Given 初期状態 / When 壊れた JSON の舞台を選ぶ / Then 例外にせず理由を知らせる', async () => {
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

  it('Given サンプルを表示中 / When 消去する / Then 舞台も配車も外し、スライダーを消す', async () => {
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
  })

  it('Given 舞台が未読み込み / When JITAI の集計を選ぶ / Then 先に舞台を読むよう伝える', async () => {
    setup()
    await uploadJitai()
    expect(await screen.findByRole('alert')).toHaveTextContent('先に舞台')
  })

  it('Given 舞台 / When 区域の違う集計を選ぶ / Then 理由を出し、集計は置かない', async () => {
    setup()
    await uploadStage()
    const bad = JSON.parse(fixture('jitai-summary.sample.json')) as { stage_ref: { area_id: string } }
    bad.stage_ref.area_id = 'shibuya'
    await uploadJitai(JSON.stringify(bad))
    expect(await screen.findByRole('alert')).toHaveTextContent('shibuya')
    expect(useAppStore.getState().jitaiSummary).toBeNull()
  })
})
