// シミュレーター（virtual-greening-sim）が書き出す JITAI の集計（jitai-summary.json）の読み込みと表示データ化。
// 区画（徒歩圏の 400 m 四方）× 時刻ごとの判定・介入・段階別の見送りの件数だけで、個人の記録は含まない。
// 形の検証は contracts/ の JSON Schema に任せ、JSON Schema で表せないこと（件数の和・重複・地点データとの食い違い）は
// シミュレーター側の JitaiSummary の検証と jitai_summary_errors_against_stage と同じ基準でここで確かめる
import Ajv2020 from 'ajv/dist/2020'
import jitaiSummarySchema from '../../contracts/jitai-summary.schema.json'
import type { LoadResult, Stage } from './dispatch'

export type ZoneGrid = { origin_lon: number; origin_lat: number; zone_m: number }

export type ZoneHour = {
  zone: [number, number]
  hour: number
  decisions: number
  interventions: number
  skipped_calendar: number
  skipped_pods: number
  skipped_pet: number
}

export type JitaiSummary = {
  schema_version: '1'
  stage_ref: { area_id: string; date: string }
  generator: string
  weather_scenario: string
  workers: number
  min_workers: number
  grid: ZoneGrid
  totals: { decisions: number; interventions: number }
  recovery: { enabled: boolean; carryover_minutes: number }
  /** 契約では省略できる。読み込み時に空配列で埋める */
  zones: ZoneHour[]
}

const ajv = new Ajv2020({ allErrors: true, formats: { date: /^\d{4}-\d{2}-\d{2}$/ } })
const validateShape = ajv.compile(jitaiSummarySchema)
const MAX_ERRORS = 20

/** JITAI の集計を確かめる。形に加えて、件数の和・区画と時刻の重複・地点データとの食い違い（区域・日付・区画の原点）を弾く */
export function parseJitaiSummary(input: unknown, stage: Stage): LoadResult<JitaiSummary> {
  if (!validateShape(input)) {
    const errors = (validateShape.errors ?? []).slice(0, MAX_ERRORS).map((e) => {
      const extra = e.keyword === 'additionalProperties' ? `: ${String((e.params as { additionalProperty: string }).additionalProperty)}` : ''
      return `形式が契約に合いません ${e.instancePath || '（全体）'} ${e.message ?? ''}${extra}`
    })
    return { ok: false, errors }
  }
  const raw = input as Omit<JitaiSummary, 'zones'> & { zones?: ZoneHour[] }
  const summary: JitaiSummary = { ...raw, zones: raw.zones ?? [] }
  const errors: string[] = []
  const seen = new Set<string>()
  for (const z of summary.zones) {
    const key = `${z.zone[0]},${z.zone[1]}@${z.hour}`
    if (seen.has(key)) errors.push(`区画と時刻が重複しています: 区画 [${z.zone.join(', ')}] の ${z.hour} 時`)
    seen.add(key)
    const parts = z.interventions + z.skipped_calendar + z.skipped_pods + z.skipped_pet
    if (parts !== z.decisions) errors.push(`区画 [${z.zone.join(', ')}] の ${z.hour} 時: 判定 ${z.decisions} 件が、介入と見送りの和 ${parts} 件と違います`)
  }
  if (summary.stage_ref.area_id !== stage.area.id) errors.push(`区域が違う: 集計 ${summary.stage_ref.area_id}、地点データ ${stage.area.id}`)
  if (summary.stage_ref.date !== stage.date) errors.push(`日付が違う: 集計 ${summary.stage_ref.date}、地点データ ${stage.date}`)
  const [west, south] = stage.area.bbox
  if (summary.grid.origin_lon !== west || summary.grid.origin_lat !== south) {
    errors.push(`区画の原点が区域の南西の角と違う: 集計 (${summary.grid.origin_lon}, ${summary.grid.origin_lat})、地点データ (${west}, ${south})`)
  }
  return errors.length > 0 ? { ok: false, errors: errors.slice(0, MAX_ERRORS) } : { ok: true, value: summary }
}

// シミュレーター側の vmgs.jitai.demand.demand_zones と同じ近似（区域の中央の緯度で平面に近似）
const EARTH_RADIUS_M = 6_371_000
const M_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M

/** 区画の四角（閉じたリング、[lon, lat]）。原点は区域の南西の角 */
export function zonePolygon([ix, iy]: [number, number], grid: ZoneGrid, stage: Stage): [number, number][] {
  const midLat = (stage.area.bbox[1] + stage.area.bbox[3]) / 2
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180)
  const dLon = grid.zone_m / mPerDegLon
  const dLat = grid.zone_m / M_PER_DEG_LAT
  const w = grid.origin_lon + ix * dLon
  const s = grid.origin_lat + iy * dLat
  return [
    [w, s],
    [w + dLon, s],
    [w + dLon, s + dLat],
    [w, s + dLat],
    [w, s],
  ]
}

export type ZoneCell = ZoneHour & { rate: number; polygon: [number, number][] }

/** ある時刻の区画と、介入率（介入 ÷ 判定） */
export function zoneCellsAt(summary: JitaiSummary, stage: Stage, hour: number): ZoneCell[] {
  return summary.zones
    .filter((z) => z.hour === hour)
    .map((z) => ({ ...z, rate: z.interventions / z.decisions, polygon: zonePolygon(z.zone, summary.grid, stage) }))
}

type Color = [number, number, number, number]

/** 介入率の区分（上限を含む）。0 件は「介入なし」として目立たない色にする */
export const JITAI_RATE_CLASSES: { label: string; max: number; color: Color }[] = [
  { label: '介入なし', max: 0, color: [148, 163, 184, 70] },
  { label: '〜20%', max: 0.2, color: [253, 224, 71, 110] },
  { label: '〜40%', max: 0.4, color: [251, 146, 60, 130] },
  { label: '40% 超', max: Number.POSITIVE_INFINITY, color: [52, 211, 153, 150] },
]

export function interventionColor(rate: number): Color {
  return (JITAI_RATE_CLASSES.find((c) => rate <= c.max) ?? JITAI_RATE_CLASSES[JITAI_RATE_CLASSES.length - 1]).color
}
