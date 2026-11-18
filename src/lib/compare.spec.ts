import { describe, expect, it } from 'vitest'
import { classifyComparisonFiles, comparisonNames } from './compare'

const dispatchJson = { schema_version: '1', pods: [] }
const jitaiJson = { schema_version: '1', grid: {}, zones: [] }

describe('機能: 比較のファイルを振り分ける', () => {
  it('Given 配車と JITAI の集計 / When 振り分ける / Then 選んだ順によらず、中身でどちらかを見分ける', () => {
    for (const files of [
      [dispatchJson, jitaiJson],
      [jitaiJson, dispatchJson],
    ]) {
      const r = classifyComparisonFiles(files)
      expect(r).toEqual({ ok: true, value: { dispatch: dispatchJson, jitai: jitaiJson } })
    }
  })

  it.each([
    ['配車だけ', [dispatchJson], /JITAI の集計/],
    ['集計だけ', [jitaiJson], /配車/],
    ['配車が 2 つ', [dispatchJson, dispatchJson], /2 つ/],
    ['見分けられない', [{ foo: 1 }, dispatchJson], /見分けられません/],
  ])('Given %s / When 振り分ける / Then 例外にせず理由を返す', (_name, files, reason) => {
    const r = classifyComparisonFiles(files)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch(reason)
  })
})

describe('機能: 比較の名前', () => {
  const run = (generator: string, weather_scenario: string) => ({ generator, weather_scenario })

  it('Given 方式が違う / Then 方式の名前で呼ぶ', () => {
    expect(comparisonNames(run('vmgs@a coverage', 'heatwave'), run('vmgs@a greedy', 'heatwave'))).toEqual(['coverage', 'greedy'])
  })

  it('Given 方式が同じで気象が違う / Then 気象を足して呼ぶ', () => {
    expect(comparisonNames(run('vmgs@a coverage', 'heatwave'), run('vmgs@b coverage', 'normal'))).toEqual([
      'coverage・heatwave',
      'coverage・normal',
    ])
  })

  it('Given 方式も気象も同じ / Then 主と比較と呼ぶ', () => {
    expect(comparisonNames(run('vmgs@a coverage', 'heatwave'), run('vmgs@b coverage', 'heatwave'))).toEqual(['主', '比較'])
  })
})
