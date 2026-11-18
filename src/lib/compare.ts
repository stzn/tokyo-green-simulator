// 主と並べて比べる「比較」の配車・JITAI の集計の扱い（ファイルの振り分けと、画面で呼ぶ名前）
import type { LoadResult } from './dispatch'
import { policyOf } from './demo'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 比較に選んだファイルを、中身で配車（pods がある）と JITAI の集計（zones か grid がある）に振り分ける。契約の確認は呼び出し側で行う */
export function classifyComparisonFiles(jsons: unknown[]): LoadResult<{ dispatch: unknown; jitai: unknown }> {
  const dispatches: unknown[] = []
  const jitais: unknown[] = []
  for (const json of jsons) {
    if (isObject(json) && 'pods' in json) dispatches.push(json)
    else if (isObject(json) && ('zones' in json || 'grid' in json)) jitais.push(json)
    else return { ok: false, errors: ['配車か JITAI の集計かを見分けられません（配車は pods、集計は grid を持ちます）'] }
  }
  const errors: string[] = []
  if (dispatches.length > 1) errors.push('配車が 2 つ以上あります。比較には配車と JITAI の集計を 1 つずつ選んでください')
  if (jitais.length > 1) errors.push('JITAI の集計が 2 つ以上あります。比較には配車と JITAI の集計を 1 つずつ選んでください')
  if (dispatches.length === 0) errors.push('比較の配車（dispatch.json）がありません。配車と JITAI の集計を 1 つずつ選んでください')
  if (jitais.length === 0) errors.push('比較の JITAI の集計（jitai-summary.json）がありません。配車と JITAI の集計を 1 つずつ選んでください')
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { dispatch: dispatches[0], jitai: jitais[0] } }
}

type Run = { generator: string; weather_scenario: string }

/** 主と比較を画面で呼ぶ名前。方式が違えば方式名、同じで気象が違えば気象を足し、それでも同じなら「主」「比較」 */
export function comparisonNames(main: Run, other: Run): [string, string] {
  const [a, b] = [policyOf(main.generator), policyOf(other.generator)]
  if (a !== b) return [a, b]
  if (main.weather_scenario !== other.weather_scenario) return [`${a}・${main.weather_scenario}`, `${b}・${other.weather_scenario}`]
  return ['主', '比較']
}
