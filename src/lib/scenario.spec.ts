import { describe, expect, it } from 'vitest'
import { simulateGreening } from './simulation/greening'
import type { BuildingInfo, GreenedBuilding } from '../store/appStore'
import {
  MAX_SHARE_URL_LENGTH,
  buildShareUrl,
  decodeScenario,
  encodeScenario,
  fromScenario,
  loadScenario,
  readScenarioFromHash,
  saveScenario,
  toScenario,
  type ScenarioView,
} from './scenario'

const view: ScenarioView = { longitude: 139.7645, latitude: 35.6795, zoom: 15.6, pitch: 60, bearing: -25 }

const ringOf = (n: number, cx = 139.7645, cy = 35.6795): number[][] => {
  const pts = Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * 0.0005, cy + Math.sin((i / n) * Math.PI * 2) * 0.0005])
  return [...pts, pts[0]]
}

const building = (id: string, vertices = 8): BuildingInfo => ({
  id,
  heightM: 47.2,
  roofAreaM2: 1514.3,
  perimeterM: 174.6,
  polygon: [ringOf(vertices)],
})

const greenedOf = (...buildings: BuildingInfo[]): Record<string, GreenedBuilding> =>
  Object.fromEntries(
    buildings.map((b) => {
      const plan = { roofRatio: 0.5, wallRatio: 0.1 }
      return [b.id, { building: b, plan, result: simulateGreening(b, plan) }]
    }),
  )

describe('機能: シナリオを保存できる形にする', () => {
  it('Given 緑化した建物と視点 / When シナリオにする / Then 建物・緑化計画・視点を持つ（試算結果は持たない）', () => {
    const s = toScenario(greenedOf(building('a')), view)
    expect(s.view).toEqual(view)
    expect(s.buildings).toHaveLength(1)
    expect(s.buildings[0]).toMatchObject({ id: 'a', heightM: 47.2, roofAreaM2: 1514.3, perimeterM: 174.6, roofRatio: 0.5, wallRatio: 0.1 })
    expect(JSON.stringify(s)).not.toContain('coolingSavedKWh')
  })

  it('Given 穴のある建物 / When シナリオにする / Then 外周だけを持つ（緑化の演出は外周しか使わない）', () => {
    const b = { ...building('a'), polygon: [ringOf(8), ringOf(4)] }
    expect(toScenario(greenedOf(b), view).buildings[0].outline).toEqual(expect.any(Array))
    expect(fromScenario(toScenario(greenedOf(b), view))!.greened.a.building.polygon).toHaveLength(1)
  })

  it('Given 頂点の多い建物 / When シナリオにする / Then 形が変わらない範囲で頂点を減らし、座標を丸める', () => {
    const dense = building('a', 200)
    const outline = toScenario(greenedOf(dense), view).buildings[0].outline
    expect(outline.length).toBeLessThan(dense.polygon[0].length)
    // 小数5桁（約1m）に丸める
    for (const [lon] of outline) expect(lon).toBe(Math.round(lon * 1e5) / 1e5)
  })

  it('Given 緑化した建物が無い / When シナリオにする / Then 建物は空', () => {
    expect(toScenario({}, view).buildings).toEqual([])
  })
})

describe('機能: シナリオを画面の状態に戻す', () => {
  it('Given 保存したシナリオ / When 戻す / Then 建物・計画を復元し、試算結果は係数から計算し直す', () => {
    const original = greenedOf(building('a'))
    const restored = fromScenario(toScenario(original, view))!
    expect(restored.view).toEqual(view)
    expect(restored.greened.a.plan).toEqual({ roofRatio: 0.5, wallRatio: 0.1 })
    expect(restored.greened.a.result.roofGreenM2).toBeCloseTo(original.a.result.roofGreenM2, 6)
    expect(restored.greened.a.building.polygon[0].length).toBeGreaterThanOrEqual(4)
  })

  it('Given 復元した外周 / Then 閉じたリング（先頭と末尾が同じ）になる', () => {
    const ring = fromScenario(toScenario(greenedOf(building('a', 100)), view))!.greened.a.building.polygon[0]
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it.each([
    ['null', null],
    ['文字列', 'x'],
    ['版が違う', { v: 99, view, buildings: [] }],
    ['視点が無い', { v: 1, buildings: [] }],
    ['建物が配列でない', { v: 1, view, buildings: 'x' }],
    ['緑化率が範囲外', { v: 1, view, buildings: [{ id: 'a', heightM: 10, roofAreaM2: 100, perimeterM: 40, roofRatio: 9, wallRatio: 0, outline: [[139.7, 35.6], [139.71, 35.6], [139.71, 35.61], [139.7, 35.6]] }] }],
    ['座標が数値でない', { v: 1, view, buildings: [{ id: 'a', heightM: 10, roofAreaM2: 100, perimeterM: 40, roofRatio: 0.5, wallRatio: 0, outline: [['x', 1]] }] }],
  ])('Given 壊れたシナリオ（%s） / When 戻す / Then nullを返し、例外にしない', (_name, input) => {
    expect(fromScenario(input)).toBeNull()
  })
})

describe('機能: シナリオを文字列にして共有する', () => {
  it('Given シナリオ / When 符号化して復号する / Then 元に戻る（日本語の建物IDを含んでも）', () => {
    const s = toScenario(greenedOf(building('13101-bldg-1141')), view)
    expect(decodeScenario(encodeScenario(s))).toEqual(s)
  })

  it('Given 符号化した文字列 / Then URLにそのまま置ける（+ / = を含まない）', () => {
    expect(encodeScenario(toScenario(greenedOf(building('a')), view))).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it.each(['', '###', 'あいう', 'AAAA', btoa('not json')])('Given 壊れた文字列（%s） / When 復号する / Then nullを返す', (input) => {
    expect(decodeScenario(input)).toBeNull()
  })

  it('Given URLのハッシュに #s=... がある / When 読む / Then シナリオを取り出す', () => {
    const s = toScenario(greenedOf(building('a')), view)
    expect(readScenarioFromHash(`#s=${encodeScenario(s)}`)).toEqual(s)
  })

  it.each(['', '#', '#s=', '#s=%%%', '#other=1', '#s=AAAA'])('Given ハッシュが空・別物・壊れている（%s） / When 読む / Then nullで、アプリは起動できる', (hash) => {
    expect(readScenarioFromHash(hash)).toBeNull()
  })
})

describe('機能: 共有リンクを作る', () => {
  const base = 'https://stzn.github.io/tokyo-green-simulator/'

  it('Given 少数の建物 / When リンクを作る / Then ページのURLに #s=... を付けたものになる', () => {
    const r = buildShareUrl(greenedOf(building('a')), view, base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.startsWith(`${base}#s=`)).toBe(true)
  })

  it('Given 共有リンク / When ハッシュから読み戻す / Then 同じ建物・視点になる', () => {
    const r = buildShareUrl(greenedOf(building('a'), building('b')), view, base)
    if (!r.ok) throw new Error('リンクが作れませんでした')
    const restored = fromScenario(readScenarioFromHash(new URL(r.url).hash))!
    expect(Object.keys(restored.greened).sort()).toEqual(['a', 'b'])
    expect(restored.view).toEqual(view)
  })

  it('Given 建物が多すぎてURLが長くなる / When リンクを作る / Then 作らず、上限を超えたことと保存を使うことを伝える', () => {
    const many = Array.from({ length: 60 }, (_, i) => building(`bldg-${i}`, 80))
    const r = buildShareUrl(greenedOf(...many), view, base)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toContain('長すぎ')
      expect(r.reason).toContain('保存')
    }
  })

  it('Given 上限ぎりぎり以下のURL / Then 上限は共有先で切れにくい長さである', () => {
    expect(MAX_SHARE_URL_LENGTH).toBeLessThanOrEqual(8000)
  })

  it('Given 建物が0棟 / When リンクを作る / Then 共有する内容が無いことを伝える', () => {
    const r = buildShareUrl({}, view, base)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('緑化')
  })
})

describe('機能: 端末に保存する', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  it('Given 保存していない / When 読む / Then null', () => {
    expect(loadScenario(memory())).toBeNull()
  })

  it('Given シナリオを保存 / When 読む / Then 同じものが返る', () => {
    const storage = memory()
    const s = toScenario(greenedOf(building('a')), view)
    saveScenario(storage, s)
    expect(loadScenario(storage)).toEqual(s)
  })

  it('Given 保存領域に壊れた値が入っている / When 読む / Then nullを返し、例外にしない', () => {
    const storage = memory()
    storage.setItem('urban-green-twin:scenario', '{broken')
    expect(loadScenario(storage)).toBeNull()
  })

  it('Given 保存領域が使えない（プライベートブラウズなど） / When 保存する / Then 失敗を返し、例外にしない', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(saveScenario(broken, toScenario({}, view))).toBe(false)
    expect(loadScenario(broken)).toBeNull()
  })
})
