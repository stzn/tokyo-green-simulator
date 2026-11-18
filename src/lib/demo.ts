// 配車のデモ（シミュレーターの結果を public/data/demo/ に置いたもの）の読み込み
import { BASE_URL } from '../config/baseUrl'
import { parseJson, type LoadResult } from './dispatch'

/** デモを置いた配車の方式（地点データは共通、配車と JITAI の集計は方式ごと） */
export const DEMO_POLICIES = ['coverage', 'greedy'] as const
export type DemoPolicy = (typeof DEMO_POLICIES)[number]

/** デモの条件（表示用）。データの出どころは README の「配車のデモ」 */
export const DEMO_LABEL = 'heatwave・5 台'
const DEMO_DIR = 'data/demo/heatwave-p5/'

export type DemoUrls = { stage: string; dispatch: string; jitai: string }
export type DemoJson = { stage: unknown; dispatch: unknown; jitai: unknown }

export function demoUrls(policy: DemoPolicy, base: string = BASE_URL): DemoUrls {
  const dir = `${base}${DEMO_DIR}`
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
export async function fetchDemo(policy: DemoPolicy, fetchFn: FetchFn = (url) => fetch(url)): Promise<LoadResult<DemoJson>> {
  const urls = demoUrls(policy)
  const [stage, dispatch, jitai] = await Promise.all([
    fetchJson(urls.stage, fetchFn),
    fetchJson(urls.dispatch, fetchFn),
    fetchJson(urls.jitai, fetchFn),
  ])
  const errors = [stage, dispatch, jitai].flatMap((r) => (r.ok ? [] : r.errors))
  if (!stage.ok || !dispatch.ok || !jitai.ok) return { ok: false, errors }
  return { ok: true, value: { stage: stage.value, dispatch: dispatch.value, jitai: jitai.value } }
}
