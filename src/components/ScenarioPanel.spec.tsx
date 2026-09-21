import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScenarioView } from '../lib/scenario'
import { simulateGreening } from '../lib/simulation/greening'
import { useAppStore, type BuildingInfo } from '../store/appStore'
import { ScenarioPanel } from './ScenarioPanel'

const view: ScenarioView = { longitude: 139.7645, latitude: 35.6795, zoom: 15.6, pitch: 60, bearing: -25 }

const building: BuildingInfo = {
  id: '13101-bldg-1',
  heightM: 40,
  roofAreaM2: 1000,
  perimeterM: 130,
  polygon: [[[139.76, 35.68], [139.7611, 35.68], [139.7611, 35.6809], [139.76, 35.6809], [139.76, 35.68]]],
}
const plan = { roofRatio: 0.5, wallRatio: 0.1 }

const memoryStorage = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

const setup = (over: Partial<Parameters<typeof ScenarioPanel>[0]> = {}) => {
  const storage = memoryStorage()
  const copyText = vi.fn(async (_text: string) => {})
  const onRestoreView = vi.fn()
  render(<ScenarioPanel getView={() => view} onRestoreView={onRestoreView} storage={storage} pageUrl="https://example.test/app/" copyText={copyText} {...over} />)
  return { storage, copyText, onRestoreView }
}

const greenOneBuilding = () => useAppStore.setState({ greened: { [building.id]: { building, plan, result: simulateGreening(building, plan) } } })

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))

describe('機能: シナリオの保存・共有パネル', () => {
  it('Given 何も緑化していない / Then 保存と共有は押せず、保存した内容を開くだけ押せる', () => {
    setup()
    expect(screen.getByRole('button', { name: 'この端末に保存' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '共有リンクをコピー' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存した内容を開く' })).toBeEnabled()
  })

  it('Given 建物を緑化した / When 「この端末に保存」を押す / Then 保存して棟数を知らせる', async () => {
    greenOneBuilding()
    const { storage } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'この端末に保存' }))
    expect(screen.getByRole('status')).toHaveTextContent('1棟を保存しました')
    expect(storage.getItem('urban-green-twin:scenario')).not.toBeNull()
  })

  it('Given 保存領域が使えない / When 保存する / Then 失敗を伝え、アプリは壊れない', async () => {
    greenOneBuilding()
    setup({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota')
        },
      },
    })
    await userEvent.click(screen.getByRole('button', { name: 'この端末に保存' }))
    expect(screen.getByRole('status')).toHaveTextContent('保存できませんでした')
  })

  it('Given 保存済みのシナリオ / When 「保存した内容を開く」を押す / Then 緑化を復元し、保存時の視点へ移動する', async () => {
    greenOneBuilding()
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'この端末に保存' }))
    useAppStore.setState({ greened: {} })
    await userEvent.click(screen.getByRole('button', { name: '保存した内容を開く' }))
    expect(Object.keys(useAppStore.getState().greened)).toEqual([building.id])
    expect(props.onRestoreView).toHaveBeenCalledWith(view)
    expect(screen.getByRole('status')).toHaveTextContent('1棟を開きました')
  })

  it('Given 何も保存していない / When 「保存した内容を開く」を押す / Then 「保存された内容がありません」と伝える', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: '保存した内容を開く' }))
    expect(screen.getByRole('status')).toHaveTextContent('保存された内容がありません')
    expect(props.onRestoreView).not.toHaveBeenCalled()
  })

  it('Given 保存した内容が壊れている / When 開く / Then 読めなかったと伝え、今の緑化は消さない', async () => {
    greenOneBuilding()
    const storage = memoryStorage()
    storage.setItem('urban-green-twin:scenario', '{broken')
    setup({ storage })
    await userEvent.click(screen.getByRole('button', { name: '保存した内容を開く' }))
    expect(screen.getByRole('status')).toHaveTextContent('保存された内容がありません')
    expect(Object.keys(useAppStore.getState().greened)).toEqual([building.id])
  })

  it('Given 建物を緑化した / When 「共有リンクをコピー」を押す / Then #s=付きのリンクをコピーして知らせる', async () => {
    greenOneBuilding()
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: '共有リンクをコピー' }))
    expect(props.copyText).toHaveBeenCalledTimes(1)
    const copied = props.copyText.mock.calls[0][0]
    expect(copied.startsWith('https://example.test/app/#s=')).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('共有リンクをコピーしました')
  })

  it('Given クリップボードが使えない / When 共有リンクをコピー / Then リンクを表示し、手動でコピーしてもらう', async () => {
    greenOneBuilding()
    setup({
      copyText: async () => {
        throw new Error('denied')
      },
    })
    await userEvent.click(screen.getByRole('button', { name: '共有リンクをコピー' }))
    expect(screen.getByRole('status')).toHaveTextContent('コピーできませんでした')
    expect((screen.getByRole('textbox', { name: '共有リンク' }) as HTMLInputElement).value).toContain('#s=')
  })

  it('Given 建物が多すぎてリンクが長くなる / When 共有リンクをコピー / Then コピーせず、理由と保存の案内を出す', async () => {
    const many: Record<string, ReturnType<typeof entry>> = {}
    const entry = (i: number) => {
      const n = 80
      const ring = Array.from({ length: n }, (_, k) => [139.7645 + i * 0.001 + Math.cos((k / n) * 6.28) * 0.0005, 35.68 + Math.sin((k / n) * 6.28) * 0.0005])
      const b: BuildingInfo = { ...building, id: `bldg-${i}`, polygon: [[...ring, ring[0]]] }
      return { building: b, plan, result: simulateGreening(b, plan) }
    }
    for (let i = 0; i < 60; i++) many[`bldg-${i}`] = entry(i)
    useAppStore.setState({ greened: many })
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: '共有リンクをコピー' }))
    expect(props.copyText).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('長すぎ')
  })
})
