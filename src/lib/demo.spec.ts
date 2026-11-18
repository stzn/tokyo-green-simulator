import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CONDITIONS, DEMO_POLICIES, demoUrls, fetchDemo, fetchDemoComparison, policyOf } from './demo'
import { parseDispatch, parseStage } from './dispatch'
import { parseJitaiSummary } from './jitai'

const DEMO_ROOT = join(process.cwd(), 'public', 'data', 'demo')
const readDemo = (condition: string, name: string): unknown => JSON.parse(readFileSync(join(DEMO_ROOT, condition, name), 'utf-8'))
/** 公開する URL の末尾（条件のディレクトリとファイル名）から、ディスクの中身を返す fetch */
const diskFetch = vi.fn(async (url: string) => {
  const [condition, name] = String(url).split('/').slice(-2)
  return Response.json(readDemo(condition, name))
})

afterEach(() => vi.clearAllMocks())

describe('機能: 配車のデモのデータ（public/data/demo/）', () => {
  it('Given デモの条件 / Then heatwave・5 台を先頭（既定）に、台数と天気の違う条件を並べる', () => {
    expect(DEMO_CONDITIONS.map((c) => c.id)).toEqual(['heatwave-p5', 'heatwave-p8', 'normal-p5', 'rainy-p5'])
    expect(new Set(DEMO_CONDITIONS.map((c) => c.label)).size).toBe(DEMO_CONDITIONS.length)
  })

  it.each(DEMO_CONDITIONS.map((c) => c.id))('Given 置いてある %s / When 方式ごとに地点データと突き合わせて読む / Then 契約 v1 に合格する（契約を変えたら作り直す）', (condition) => {
    const readDemoFile = (name: string) => readDemo(condition, name)
    const stage = parseStage(readDemoFile('stage.json'))
    expect(stage.ok, stage.ok ? '' : stage.errors.join('\n')).toBe(true)
    if (!stage.ok) return
    for (const policy of DEMO_POLICIES) {
      const d = parseDispatch(readDemoFile(`dispatch.${policy}.json`), stage.value)
      expect(d.ok, d.ok ? '' : d.errors.join('\n')).toBe(true)
      const j = parseJitaiSummary(readDemoFile(`jitai-summary.${policy}.json`), stage.value)
      expect(j.ok, j.ok ? '' : j.errors.join('\n')).toBe(true)
      // 地点データは方式によらず同じなので、配車がどちらの方式かは generator で見分ける
      if (d.ok) expect(policyOf(d.value.generator)).toBe(policy)
    }
  })

  it('Given 条件と方式 / Then 地点データは条件で共通、配車と集計は方式ごとの URL を返す', () => {
    expect(demoUrls('rainy-p5', 'greedy', '/base/')).toEqual({
      stage: '/base/data/demo/rainy-p5/stage.json',
      dispatch: '/base/data/demo/rainy-p5/dispatch.greedy.json',
      jitai: '/base/data/demo/rainy-p5/jitai-summary.greedy.json',
    })
  })

  it('Given 配車の generator / Then 最後の語を方式として読む', () => {
    expect(policyOf('vmgs@0798ea4 coverage')).toBe('coverage')
    expect(policyOf('')).toBe('')
  })

  it('Given 置いてあるデモ / When fetch で読む / Then 3 つの JSON を返す', async () => {
    const r = await fetchDemo('heatwave-p5', 'coverage', diskFetch)
    expect(r.ok).toBe(true)
    expect(diskFetch).toHaveBeenCalledTimes(3)
  })

  it('Given 404 を返す / When 読む / Then 例外にせず、どのファイルかと状態を理由にする', async () => {
    const r = await fetchDemo('heatwave-p5', 'coverage', vi.fn(async () => new Response('', { status: 404 })))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch(/stage\.json.*404/)
  })

  it('Given ネットワークの失敗・壊れた JSON / When 読む / Then 例外にせず理由を返す', async () => {
    const down = await fetchDemo('heatwave-p5', 'greedy', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(down.ok).toBe(false)
    if (!down.ok) expect(down.errors.join()).toContain('Failed to fetch')
    const broken = await fetchDemo('heatwave-p5', 'greedy', vi.fn(async () => new Response('{oops', { status: 200 })))
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.errors.join()).toContain('JSON')
  })
})

describe('機能: 比較のデモを読む', () => {
  it('Given 置いてあるデモ / When 比較を読む / Then 地点データは 1 回、配車と集計は coverage と greedy を読む', async () => {
    const r = await fetchDemoComparison('normal-p5', diskFetch)
    expect(r.ok).toBe(true)
    const urls = diskFetch.mock.calls.map(([u]) => String(u).split('/').slice(-2).join('/'))
    expect(urls.sort()).toEqual(
      ['dispatch.coverage.json', 'dispatch.greedy.json', 'jitai-summary.coverage.json', 'jitai-summary.greedy.json', 'stage.json']
        .map((n) => `normal-p5/${n}`)
        .sort(),
    )
    if (r.ok) expect(policyOf((r.value.main.dispatch as { generator: string }).generator)).toBe('coverage')
  })

  it('Given どれかが 404 / When 比較を読む / Then 例外にせず理由を返す', async () => {
    const r = await fetchDemoComparison('heatwave-p5', vi.fn(async () => new Response('', { status: 404 })))
    expect(r.ok).toBe(false)
  })
})
