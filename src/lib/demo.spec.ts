import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_POLICIES, demoUrls, fetchDemo, policyOf } from './demo'
import { parseDispatch, parseStage } from './dispatch'
import { parseJitaiSummary } from './jitai'

const DEMO_DIR = join(process.cwd(), 'public', 'data', 'demo', 'heatwave-p5')
const readDemo = (name: string): unknown => JSON.parse(readFileSync(join(DEMO_DIR, name), 'utf-8'))
/** 公開するファイル名（URL の末尾）から、ディスクの中身を返す fetch */
const diskFetch = vi.fn(async (url: string) => Response.json(readDemo(String(url).split('/').pop() ?? '')))

afterEach(() => vi.clearAllMocks())

describe('機能: 配車のデモのデータ（public/data/demo/heatwave-p5）', () => {
  it('Given 置いてあるデモ / When 方式ごとに地点データと突き合わせて読む / Then 契約 v1 に合格する（契約を変えたら作り直す）', () => {
    const stage = parseStage(readDemo('stage.json'))
    expect(stage.ok, stage.ok ? '' : stage.errors.join('\n')).toBe(true)
    if (!stage.ok) return
    for (const policy of DEMO_POLICIES) {
      const d = parseDispatch(readDemo(`dispatch.${policy}.json`), stage.value)
      expect(d.ok, d.ok ? '' : d.errors.join('\n')).toBe(true)
      const j = parseJitaiSummary(readDemo(`jitai-summary.${policy}.json`), stage.value)
      expect(j.ok, j.ok ? '' : j.errors.join('\n')).toBe(true)
      // 地点データは方式によらず同じなので、配車がどちらの方式かは generator で見分ける
      if (d.ok) expect(policyOf(d.value.generator)).toBe(policy)
    }
  })

  it('Given 方式 / Then 地点データは共通、配車と集計は方式ごとの URL を返す', () => {
    expect(demoUrls('greedy', '/base/')).toEqual({
      stage: '/base/data/demo/heatwave-p5/stage.json',
      dispatch: '/base/data/demo/heatwave-p5/dispatch.greedy.json',
      jitai: '/base/data/demo/heatwave-p5/jitai-summary.greedy.json',
    })
  })

  it('Given 配車の generator / Then 最後の語を方式として読む', () => {
    expect(policyOf('vmgs@0798ea4 coverage')).toBe('coverage')
    expect(policyOf('')).toBe('')
  })

  it('Given 置いてあるデモ / When fetch で読む / Then 3 つの JSON を返す', async () => {
    const r = await fetchDemo('coverage', diskFetch)
    expect(r.ok).toBe(true)
    expect(diskFetch).toHaveBeenCalledTimes(3)
  })

  it('Given 404 を返す / When 読む / Then 例外にせず、どのファイルかと状態を理由にする', async () => {
    const r = await fetchDemo('coverage', vi.fn(async () => new Response('', { status: 404 })))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch(/stage\.json.*404/)
  })

  it('Given ネットワークの失敗・壊れた JSON / When 読む / Then 例外にせず理由を返す', async () => {
    const down = await fetchDemo('greedy', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(down.ok).toBe(false)
    if (!down.ok) expect(down.errors.join()).toContain('Failed to fetch')
    const broken = await fetchDemo('greedy', vi.fn(async () => new Response('{oops', { status: 200 })))
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.errors.join()).toContain('JSON')
  })
})
