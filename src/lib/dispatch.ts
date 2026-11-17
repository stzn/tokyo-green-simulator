// 役者（virtual-greening-sim）が書き出す配車（dispatch.json）と、舞台（stage.json）の読み込み・表示データ化。
// 形の検証は contracts/ の JSON Schema（データ契約 v1 の写し）に任せ、JSON Schema では表せないこと
// （重複・舞台との食い違い・容量超過）は役者側の dispatch_errors_against_stage と同じ基準でここで確かめる。
// 壊れた入力は例外にせず、理由の一覧を返す（呼び出し側で画面に出す）
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import dispatchSchema from '../../contracts/dispatch.schema.json'
import stageSchema from '../../contracts/stage.schema.json'

// --- 契約の型（contracts/*.schema.json に対応。表示に使う項目だけ書く） ---

export type PodAction = 'stay' | 'move' | 'irrigate'

export type StageSpot = {
  id: string
  name: string
  lat: number
  lon: number
  kind: string
  capacity_pods: number
  hourly: { hour: number; shade_fraction: number }[]
  demand?: { hour: number; weight: number }[]
}

export type Stage = {
  schema_version: '1'
  area: { id: string; name: string; bbox: [number, number, number, number] }
  date: string
  generator: string
  spots: StageSpot[]
}

export type PodStep = { hour: number; spot_id: string; action: PodAction; plant_health: number }
export type SpotComfort = { spot_id: string; hour: number; pet_c: number; pods_present: number }

export type Dispatch = {
  schema_version: '1'
  stage_ref: { area_id: string; date: string }
  generator: string
  weather_scenario: string
  pods: { id: string; timeline: PodStep[] }[]
  /** 契約では省略できる。読み込み時に空配列で埋める */
  comfort: SpotComfort[]
}

export type LoadResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

// --- 検証 ---

// スキーマの format: "date"（YYYY-MM-DD）を Ajv に教える（ajv-formats を足さずに済ませる。contracts.spec.ts と同じ）
const ajv = new Ajv2020({ allErrors: true, formats: { date: /^\d{4}-\d{2}-\d{2}$/ } })
const validateStageShape = ajv.compile(stageSchema)
const validateDispatchShape = ajv.compile(dispatchSchema)

/** 画面に出すエラーの上限（壊れたファイルで何千行も並べない） */
const MAX_ERRORS = 20

const describeAjvError = (e: ErrorObject): string => {
  const where = e.instancePath || '（全体）'
  const extra = e.keyword === 'additionalProperties' ? `: ${String((e.params as { additionalProperty: string }).additionalProperty)}` : ''
  return `形式が契約に合いません ${where} ${e.message ?? ''}${extra}`
}

const shapeErrors = (errors: ErrorObject[] | null | undefined): string[] => (errors ?? []).slice(0, MAX_ERRORS).map(describeAjvError)

const duplicatesOf = <T>(values: T[]): T[] => {
  const seen = new Set<T>()
  const dup = new Set<T>()
  for (const v of values) (seen.has(v) ? dup : seen).add(v)
  return [...dup]
}

/** JSON の文字列を読む。読めないときは理由を返す */
export function parseJson(text: string): LoadResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (e) {
    return { ok: false, errors: [`JSON として読めません（${e instanceof Error ? e.message : String(e)}）`] }
  }
}

/** 舞台（stage.json）を確かめる。地点 ID と、地点ごとの時刻の重複も弾く */
export function parseStage(input: unknown): LoadResult<Stage> {
  if (!validateStageShape(input)) return { ok: false, errors: shapeErrors(validateStageShape.errors) }
  const stage = input as Stage
  const errors: string[] = []
  const dupIds = duplicatesOf(stage.spots.map((s) => s.id))
  if (dupIds.length > 0) errors.push(`地点 ID が重複しています: ${dupIds.join(', ')}`)
  for (const spot of stage.spots) {
    const dupHourly = duplicatesOf(spot.hourly.map((h) => h.hour))
    if (dupHourly.length > 0) errors.push(`地点 ${spot.id} の hourly の時刻が重複しています: ${dupHourly.join(', ')}`)
    const dupDemand = duplicatesOf((spot.demand ?? []).map((d) => d.hour))
    if (dupDemand.length > 0) errors.push(`地点 ${spot.id} の demand の時刻が重複しています: ${dupDemand.join(', ')}`)
  }
  return errors.length > 0 ? { ok: false, errors: errors.slice(0, MAX_ERRORS) } : { ok: true, value: stage }
}

/** 配車（dispatch.json）を確かめる。形に加えて、舞台との食い違い（区域・日付・未知の地点・容量超過）と重複を弾く */
export function parseDispatch(input: unknown, stage: Stage): LoadResult<Dispatch> {
  if (!validateDispatchShape(input)) return { ok: false, errors: shapeErrors(validateDispatchShape.errors) }
  const raw = input as Omit<Dispatch, 'comfort'> & { comfort?: SpotComfort[] }
  const dispatch: Dispatch = { ...raw, comfort: raw.comfort ?? [] }
  const errors: string[] = []

  // 配車の中の重複
  const dupPods = duplicatesOf(dispatch.pods.map((p) => p.id))
  if (dupPods.length > 0) errors.push(`ポッド ID が重複しています: ${dupPods.join(', ')}`)
  for (const pod of dispatch.pods) {
    const dupHours = duplicatesOf(pod.timeline.map((s) => s.hour))
    if (dupHours.length > 0) errors.push(`ポッド ${pod.id} の時刻が重複しています: ${dupHours.join(', ')}`)
  }
  // 同じ地点・時刻の PET が 2 つあると、どちらを描くか決められない
  for (const key of duplicatesOf(dispatch.comfort.map((c) => `${c.spot_id}@${c.hour}`))) {
    const [spotId, hour] = key.split('@')
    errors.push(`快適度が重複しています: ${spotId} の ${hour} 時`)
  }

  // 舞台との食い違い（役者側 dispatch_errors_against_stage と同じ基準）
  if (dispatch.stage_ref.area_id !== stage.area.id) errors.push(`区域が違う: 配車 ${dispatch.stage_ref.area_id}、舞台 ${stage.area.id}`)
  if (dispatch.stage_ref.date !== stage.date) errors.push(`日付が違う: 配車 ${dispatch.stage_ref.date}、舞台 ${stage.date}`)
  const capacity = new Map(stage.spots.map((s) => [s.id, s.capacity_pods]))
  const used = new Map<string, { spotId: string; hour: number; n: number }>()
  for (const pod of dispatch.pods) {
    for (const step of pod.timeline) {
      if (!capacity.has(step.spot_id)) {
        errors.push(`舞台にない地点: ポッド ${pod.id} の ${step.hour} 時 ${step.spot_id}`)
        continue
      }
      const key = `${step.spot_id}@${step.hour}`
      const u = used.get(key) ?? { spotId: step.spot_id, hour: step.hour, n: 0 }
      used.set(key, { ...u, n: u.n + 1 })
    }
  }
  for (const { spotId, hour, n } of used.values()) {
    const cap = capacity.get(spotId) ?? 0
    if (n > cap) errors.push(`容量超過: ${spotId} の ${hour} 時に ${n} 台（容量 ${cap}）`)
  }
  for (const c of dispatch.comfort) {
    if (!capacity.has(c.spot_id)) errors.push(`舞台にない地点の快適度: ${c.spot_id}`)
  }

  return errors.length > 0 ? { ok: false, errors: errors.slice(0, MAX_ERRORS) } : { ok: true, value: dispatch }
}

// --- 時刻 → 表示データ ---

export type PodMarker = {
  podId: string
  spotId: string
  spotName: string
  lon: number
  lat: number
  action: PodAction
  plantHealth: number
  /** 同じ地点・時刻に居るポッドの中での順番（0 から）。描くときに重ならないようずらす */
  slot: number
}

export type ComfortMarker = { spotId: string; spotName: string; lon: number; lat: number; petC: number; podsPresent: number }

export type DispatchSnapshot = { pods: PodMarker[]; comfort: ComfortMarker[] }

/** ポッドか快適度のデータがある時刻（昇順） */
export function dispatchHours(dispatch: Dispatch): number[] {
  const hours = new Set<number>()
  for (const pod of dispatch.pods) for (const step of pod.timeline) hours.add(step.hour)
  for (const c of dispatch.comfort) hours.add(c.hour)
  return [...hours].sort((a, b) => a - b)
}

/** ある時刻のポッドの位置と地点の PET。座標は舞台の地点から引く（読み込み時に地点の存在は確かめてある） */
export function snapshotAt(stage: Stage, dispatch: Dispatch, hour: number): DispatchSnapshot {
  const spots = new Map(stage.spots.map((s) => [s.id, s]))
  const slots = new Map<string, number>()
  const pods: PodMarker[] = []
  for (const pod of dispatch.pods) {
    const step = pod.timeline.find((s) => s.hour === hour)
    const spot = step && spots.get(step.spot_id)
    if (!step || !spot) continue
    const slot = slots.get(spot.id) ?? 0
    slots.set(spot.id, slot + 1)
    pods.push({
      podId: pod.id,
      spotId: spot.id,
      spotName: spot.name,
      lon: spot.lon,
      lat: spot.lat,
      action: step.action,
      plantHealth: step.plant_health,
      slot,
    })
  }
  const comfort: ComfortMarker[] = []
  for (const c of dispatch.comfort) {
    const spot = spots.get(c.spot_id)
    if (c.hour !== hour || !spot) continue
    comfort.push({ spotId: spot.id, spotName: spot.name, lon: spot.lon, lat: spot.lat, petC: c.pet_c, podsPresent: c.pods_present })
  }
  return { pods, comfort }
}

// --- 凡例（行動・PET の区分） ---

type Color = [number, number, number, number]

export const POD_ACTIONS: { action: PodAction; label: string; color: Color }[] = [
  { action: 'stay', label: '滞在', color: [52, 211, 153, 255] },
  { action: 'move', label: '移動', color: [244, 114, 182, 255] },
  { action: 'irrigate', label: '散水', color: [56, 189, 248, 255] },
]

export type PetCategoryKey = 'cool' | 'comfortable' | 'slightlyWarm' | 'warm' | 'hot' | 'veryHot'
export type PetCategory = { key: PetCategoryKey; label: string; range: string; color: Color }

/**
 * PET の温熱感覚の区分（Matzarakis & Mayer 1996 の中欧向けの区分。上限を含む）。
 * 18 ℃ 未満（やや涼しい〜非常に寒い）は、夏の暑さ対策を見るこの画面では「涼しい」にまとめる
 */
export const PET_CATEGORIES: (PetCategory & { maxC: number })[] = [
  { key: 'cool', label: '涼しい', range: '18 ℃ 未満', maxC: 18, color: [96, 165, 250, 170] },
  { key: 'comfortable', label: '快適', range: '18〜23 ℃', maxC: 23, color: [74, 222, 128, 170] },
  { key: 'slightlyWarm', label: 'やや暑い', range: '23〜29 ℃', maxC: 29, color: [250, 204, 21, 170] },
  { key: 'warm', label: '暑い', range: '29〜35 ℃', maxC: 35, color: [251, 146, 60, 170] },
  { key: 'hot', label: 'とても暑い', range: '35〜41 ℃', maxC: 41, color: [239, 68, 68, 170] },
  { key: 'veryHot', label: '非常に暑い', range: '41 ℃ 超', maxC: Number.POSITIVE_INFINITY, color: [168, 85, 247, 190] },
]

export function petCategory(petC: number): PetCategory {
  // cool だけは上限を含まない（18 ℃ ちょうどは快適）
  const found = PET_CATEGORIES.find((c) => (c.key === 'cool' ? petC < c.maxC : petC <= c.maxC))
  return found ?? PET_CATEGORIES[PET_CATEGORIES.length - 1]
}
