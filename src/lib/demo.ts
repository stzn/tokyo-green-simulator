// 配車のデモ（シミュレーターの結果を public/data/demo/ に置いたもの）の読み込み
import { BASE_URL } from '../config/baseUrl'
import { parseJson, type LoadResult } from './dispatch'

/** デモを置いた配車の方式（地点データは共通、配車と JITAI の集計は方式ごと） */
export const DEMO_POLICIES = ['coverage', 'greedy'] as const
export type DemoPolicy = (typeof DEMO_POLICIES)[number]

/** デモの条件（気象 × ポッドの台数）。先頭が既定。データの出どころは README の「配車のデモ」 */
export const DEMO_CONDITIONS = [
  { id: 'heatwave-p5', label: 'heatwave・5 台' },
  { id: 'heatwave-p8', label: 'heatwave・8 台' },
  { id: 'normal-p5', label: 'normal・5 台' },
  { id: 'rainy-p5', label: 'rainy・5 台' },
] as const
export type DemoCondition = (typeof DEMO_CONDITIONS)[number]['id']

export const demoLabel = (condition: DemoCondition): string => DEMO_CONDITIONS.find((c) => c.id === condition)?.label ?? condition

export type DemoUrls = { stage: string; dispatch: string; jitai: string }
export type DemoJson = { stage: unknown; dispatch: unknown; jitai: unknown }

export function demoUrls(condition: DemoCondition, policy: DemoPolicy, base: string = BASE_URL): DemoUrls {
  const dir = `${base}data/demo/${condition}/`
  return {
    stage: `${dir}stage.json`,
    dispatch: `${dir}dispatch.${policy}.json`,
    jitai: `${dir}jitai-summary.${policy}.json`,
  }
}

/** 配車の generator（例: "vmgs@abc1234 coverage"）の最後の語を方式とみなす */
export const policyOf = (generator: string): string => generator.trim().split(/\s+/).pop() ?? ''

type FetchFn = (url: string) => Promise<Response>

const fetchJson = async (url: string, fetchFn: FetchFn): Promise<LoadResult<unknown>> => {
  const name = url.split('/').pop() ?? url
  try {
    const res = await fetchFn(url)
    if (!res.ok) return { ok: false, errors: [`デモの ${name} を読み込めません（HTTP ${res.status}）`] }
    const json = parseJson(await res.text())
    return json.ok ? json : { ok: false, errors: json.errors.map((e) => `デモの ${name}: ${e}`) }
  } catch (e) {
    return { ok: false, errors: [`デモの ${name} を読み込めません（${e instanceof Error ? e.message : String(e)}）`] }
  }
}

/** デモの 3 つの JSON を読む。契約の確認は呼び出し側（地点データと突き合わせる）で行う */
export async function fetchDemo(
  condition: DemoCondition,
  policy: DemoPolicy,
  fetchFn: FetchFn = (url) => fetch(url),
): Promise<LoadResult<DemoJson>> {
  const urls = demoUrls(condition, policy)
  const [stage, dispatch, jitai] = await Promise.all([
    fetchJson(urls.stage, fetchFn),
    fetchJson(urls.dispatch, fetchFn),
    fetchJson(urls.jitai, fetchFn),
  ])
  const errors = [stage, dispatch, jitai].flatMap((r) => (r.ok ? [] : r.errors))
  if (!stage.ok || !dispatch.ok || !jitai.ok) return { ok: false, errors }
  return { ok: true, value: { stage: stage.value, dispatch: dispatch.value, jitai: jitai.value } }
}

export type DemoComparisonJson = { stage: unknown; main: { dispatch: unknown; jitai: unknown }; other: { dispatch: unknown; jitai: unknown } }

/** 比較のデモを読む。地点データは 1 回、配車と集計は主（coverage）と比較（greedy）の 2 方式 */
export async function fetchDemoComparison(
  condition: DemoCondition,
  fetchFn: FetchFn = (url) => fetch(url),
): Promise<LoadResult<DemoComparisonJson>> {
  const main = demoUrls(condition, 'coverage')
  const other = demoUrls(condition, 'greedy')
  const results = await Promise.all([main.stage, main.dispatch, main.jitai, other.dispatch, other.jitai].map((u) => fetchJson(u, fetchFn)))
  const values: unknown[] = []
  const errors: string[] = []
  for (const r of results) {
    if (r.ok) values.push(r.value)
    else errors.push(...r.errors)
  }
  if (errors.length > 0) return { ok: false, errors }
  const [stage, mainDispatch, mainJitai, otherDispatch, otherJitai] = values
  return { ok: true, value: { stage, main: { dispatch: mainDispatch, jitai: mainJitai }, other: { dispatch: otherDispatch, jitai: otherJitai } } }
}
