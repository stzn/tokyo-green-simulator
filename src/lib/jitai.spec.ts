import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStage, type Stage } from './dispatch'
import { interventionColor, JITAI_RATE_CLASSES, parseJitaiSummary, zoneCellsAt, zonePolygon } from './jitai'

const read = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(process.cwd(), 'contracts', 'fixtures', name), 'utf-8')) as Record<string, unknown>
const stageResult = parseStage(read('stage.sample.json'))
if (!stageResult.ok) throw new Error(stageResult.errors.join())
const stage: Stage = stageResult.value
type Mutable = { stage_ref: { area_id: string; date: string }; grid: { origin_lon: number }; zones: Record<string, unknown>[] } & Record<string, unknown>
const sample = () => read('jitai-summary.sample.json') as Mutable

describe('機能: JITAI の集計（jitai-summary.json）を読み込む', () => {
  it('Given 契約のサンプル / When 地点データと突き合わせて読む / Then 合格する', () => {
    const r = parseJitaiSummary(sample(), stage)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.zones).toHaveLength(2)
  })

  it('Given 判定の数が介入と見送りの和と違う / When 読む / Then 理由を返し、例外にしない', () => {
    const data = sample()
    data.zones[0].decisions = 99
    const r = parseJitaiSummary(data, stage)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toContain('和')
  })

  it('Given 同じ区画と時刻が 2 件 / When 読む / Then 重複として弾く', () => {
    const data = sample()
    data.zones[1] = { ...data.zones[0] }
    const r = parseJitaiSummary(data, stage)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toContain('重複')
  })

  it('Given 区域・日付・区画の原点が地点データと違う / When 読む / Then それぞれを理由に挙げる', () => {
    const data = sample()
    data.stage_ref.area_id = 'shibuya'
    data.stage_ref.date = '2025-07-01'
    data.grid.origin_lon = 139.0
    const r = parseJitaiSummary(data, stage)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const all = r.errors.join('\n')
      expect(all).toContain('shibuya')
      expect(all).toContain('2025-07-01')
      expect(all).toContain('原点')
    }
  })

  it('Given 個人の記録を含む / When 読む / Then 契約に無いキーとして弾く', () => {
    const data = sample()
    data.records = [{ worker_id: 'W01' }]
    expect(parseJitaiSummary(data, stage).ok).toBe(false)
  })
})

describe('機能: 区画を地図に置く', () => {
  it('Given 区画 [0, 0] と一辺 400 m / Then 区域の南西の角から始まる、およそ 400 m 四方の閉じた四角になる', () => {
    const ring = zonePolygon([0, 0], { origin_lon: 139.758, origin_lat: 35.676, zone_m: 400 }, stage)
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual([139.758, 35.676])
    expect(ring[4]).toEqual(ring[0])
    // 南北 400 m ≈ 0.003597 度、東西は緯度で補正（シミュレーター側の vmgs.jitai.demand.demand_zones と同じ式）
    expect(ring[2][1] - 35.676).toBeCloseTo(400 / ((Math.PI / 180) * 6_371_000), 9)
    const midLat = (stage.area.bbox[1] + stage.area.bbox[3]) / 2
    expect(ring[2][0] - 139.758).toBeCloseTo(400 / ((Math.PI / 180) * 6_371_000 * Math.cos((midLat * Math.PI) / 180)), 9)
  })

  it('Given 集計 / When 時刻を選ぶ / Then その時刻の区画だけを、介入率つきで返す', () => {
    const r = parseJitaiSummary(sample(), stage)
    if (!r.ok) throw new Error(r.errors.join())
    const at11 = zoneCellsAt(r.value, stage, 11)
    expect(at11).toHaveLength(1)
    expect(at11[0]).toMatchObject({ zone: [1, 2], decisions: 5, interventions: 2, rate: 0.4 })
    expect(zoneCellsAt(r.value, stage, 3)).toEqual([])
  })

  it('Given 介入率 / Then 区分の色で塗り、0 件と高い率は別の色になる', () => {
    expect(interventionColor(0)).toEqual(JITAI_RATE_CLASSES[0].color)
    expect(interventionColor(0.5)).toEqual(JITAI_RATE_CLASSES[JITAI_RATE_CLASSES.length - 1].color)
    expect(interventionColor(0)).not.toEqual(interventionColor(0.5))
  })
})
