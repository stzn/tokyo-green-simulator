import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GreenContext } from '../lib/measurementLog'
import { useAppStore } from '../store/appStore'
import { MeasurementPanel } from './MeasurementPanel'

const header = 'timestamp,location,lat,lon,environment,hrv_sdnn'
const goodCsv = `${header}\n2026-09-24 12:30,紀尾井町緑地,35.679,139.737,Green,58\n2026-09-24 12:40,ビル街,35.68,139.74,Urban,40`
const csvFile = (text: string) => new File([text], 'experiment_log.csv', { type: 'text/csv' })

const context: GreenContext = {
  trees: { total: 12, tall: 9 },
  cityTrees: { routes: 2, count: 30 },
  parks: { count: 1, areaM2: 5000 },
  nearestParkM: 0,
  inPark: true,
}

const setup = (contexts: (GreenContext | null)[] = [context, context]) => {
  const onFocusPoint = vi.fn()
  const downloadText = vi.fn()
  render(<MeasurementPanel contexts={contexts} onFocusPoint={onFocusPoint} downloadText={downloadText} />)
  return { onFocusPoint, downloadText }
}

const upload = (text: string) => userEvent.upload(screen.getByLabelText('計測ログ（CSV）を選ぶ'), csvFile(text))

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))

describe('機能: 計測ログの読み込みパネル', () => {
  it('Given 初期状態 / Then 読み込み欄と、端末の外に出さない旨の注記を表示し、書き出しは押せない', () => {
    setup([])
    expect(screen.getByLabelText('計測ログ（CSV）を選ぶ')).toBeInTheDocument()
    expect(screen.getByText(/この端末の中だけ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '緑の文脈つきCSVを書き出す' })).toBeDisabled()
  })

  it('Given 正しいCSV / When 読み込む / Then 件数を知らせ、地点を一覧にして、ストアに保持する', async () => {
    setup()
    await upload(goodCsv)
    expect(await screen.findByRole('status')).toHaveTextContent('2件を読み込みました')
    expect(screen.getByRole('button', { name: /紀尾井町緑地/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ビル街/ })).toBeInTheDocument()
    expect(useAppStore.getState().measurements).toHaveLength(2)
  })

  it('Given 読めない行を含むCSV / When 読み込む / Then 読めた行は取り込み、読めない行を行番号と理由つきで知らせる', async () => {
    setup()
    await upload(`${header}\n2026-09-24 12:30,A,abc,139.737,Green,58\n2026-09-24 12:40,B,35.68,139.74,Urban,40`)
    expect(await screen.findByRole('alert')).toHaveTextContent(/2行目.*緯度/)
    expect(useAppStore.getState().measurements.map((m) => m.location)).toEqual(['B'])
  })

  it('Given 必須列が無いCSV / When 読み込む / Then 理由を知らせ、それまでの計測は消さない', async () => {
    setup()
    await upload(goodCsv)
    await screen.findByRole('status')
    await upload('timestamp,location,lon\n2026-09-24 12:30,A,139.737')
    expect(await screen.findByRole('alert')).toHaveTextContent('必須列がありません')
    expect(useAppStore.getState().measurements).toHaveLength(2)
  })

  it('Given 読めない行が多い / When 知らせる / Then 先頭の数件と残りの件数にまとめる', async () => {
    setup()
    const bad = Array.from({ length: 8 }, (_, i) => `2026-09-24 12:${10 + i},X${i},abc,139.7,Green,50`).join('\n')
    await upload(`${header}\n${bad}`)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getAllByRole('listitem')).toHaveLength(5)
    expect(alert).toHaveTextContent('ほか3件')
  })
})

describe('機能: 計測地点の一覧と半径', () => {
  it('Given 読み込み済み / When 一覧の地点を押す / Then その地点を選択して、地図をそこへ動かす', async () => {
    const { onFocusPoint } = setup()
    await upload(goodCsv)
    await userEvent.click(await screen.findByRole('button', { name: /ビル街/ }))
    expect(useAppStore.getState().selection).toEqual({ kind: 'measurement', index: 1 })
    expect(onFocusPoint).toHaveBeenCalledWith(expect.objectContaining({ longitude: 139.74, latitude: 35.68 }))
  })

  it('Given 初期の半径100m / When 200mを選ぶ / Then 半径が変わる', async () => {
    setup()
    expect(screen.getByRole('radio', { name: '100 m' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '200 m' }))
    expect(useAppStore.getState().measurementRadiusM).toBe(200)
  })
})

describe('機能: 緑の文脈つきCSVの書き出し', () => {
  it('Given 文脈が計算できている / When 書き出す / Then 元の列に文脈の列を足したCSVを渡す', async () => {
    const { downloadText } = setup()
    await upload(goodCsv)
    await waitFor(() => expect(screen.getByRole('button', { name: '緑の文脈つきCSVを書き出す' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '緑の文脈つきCSVを書き出す' }))
    expect(downloadText).toHaveBeenCalledTimes(1)
    const [filename, text] = downloadText.mock.calls[0]
    expect(filename).toBe('experiment_log_green_context.csv')
    expect(text).toContain(`${header},radius_m,trees_all`)
    expect(text).toContain('紀尾井町緑地')
  })

  it('Given 地図データが読み込み中 / Then 書き出しは押せず、理由を表示する', async () => {
    setup([null, null])
    await upload(goodCsv)
    await screen.findByRole('status')
    expect(screen.getByRole('button', { name: '緑の文脈つきCSVを書き出す' })).toBeDisabled()
    expect(screen.getByText(/地図データの読み込みが終わる/)).toBeInTheDocument()
  })
})

describe('機能: 計測ログの消去', () => {
  it('Given 読み込み済み / When 消去する / Then 一覧もストアも空になる', async () => {
    setup()
    await upload(goodCsv)
    await userEvent.click(await screen.findByRole('button', { name: '消去' }))
    expect(useAppStore.getState().measurements).toEqual([])
    expect(screen.queryByRole('button', { name: /ビル街/ })).not.toBeInTheDocument()
  })
})
