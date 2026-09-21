// シナリオ（緑化した建物と地図の視点）の保存・共有。サーバーは使わず、localStorageとURLのハッシュに出し入れする。
// 試算結果は持たず、復元時に係数から計算し直す（係数を更新しても古い値が残らないように）
import type { BuildingInfo, GreenedBuilding } from '../store/appStore'
import { simplifyRing } from './geo'
import { simulateGreening } from './simulation/greening'

export type ScenarioView = { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number }

export type ScenarioBuilding = {
  id: string
  heightM: number
  roofAreaM2: number
  perimeterM: number
  roofRatio: number
  wallRatio: number
  /** 外周リング（[経度, 緯度]）。緑化の演出が使うのは外周だけなので、穴は持たない */
  outline: [number, number][]
}

export type Scenario = { v: 1; view: ScenarioView; buildings: ScenarioBuilding[] }

const VERSION = 1
/** 共有先（チャットやSNS）で切れにくい長さの目安 */
export const MAX_SHARE_URL_LENGTH = 6000
/** 悪意のある・壊れたURLで大量の建物を作らせない */
const MAX_BUILDINGS = 500
/** 外周の簡略化の許容誤差（度）。約1mで、緑の演出の見た目は変わらない */
const OUTLINE_TOLERANCE_DEG = 0.00001
const STORAGE_KEY = 'urban-green-twin:scenario'

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits

// --- 画面の状態 ⇄ シナリオ ---

export function toScenario(greened: Record<string, GreenedBuilding>, view: ScenarioView): Scenario {
  return {
    v: VERSION,
    view: {
      longitude: round(view.longitude, 5),
      latitude: round(view.latitude, 5),
      zoom: round(view.zoom, 2),
      pitch: round(view.pitch, 1),
      bearing: round(view.bearing, 1),
    },
    buildings: Object.values(greened).map(({ building, plan }) => ({
      id: building.id,
      heightM: round(building.heightM, 1),
      roofAreaM2: round(building.roofAreaM2, 1),
      perimeterM: round(building.perimeterM, 1),
      roofRatio: plan.roofRatio,
      wallRatio: plan.wallRatio,
      outline: simplifyRing(building.polygon[0], OUTLINE_TOLERANCE_DEG).map(([lon, lat]) => [round(lon, 5), round(lat, 5)]),
    })),
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isLonLat = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
const inRange = (v: unknown, min: number, max: number): v is number => isNum(v) && v >= min && v <= max

function isScenarioBuilding(b: unknown): b is ScenarioBuilding {
  if (typeof b !== 'object' || b === null) return false
  const x = b as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    x.id.length > 0 &&
    x.id.length <= 100 &&
    isNum(x.heightM) &&
    x.heightM > 0 &&
    isNum(x.roofAreaM2) &&
    x.roofAreaM2 >= 0 &&
    isNum(x.perimeterM) &&
    x.perimeterM >= 0 &&
    inRange(x.roofRatio, 0, 1) &&
    inRange(x.wallRatio, 0, 1) &&
    Array.isArray(x.outline) &&
    x.outline.length >= 3 &&
    x.outline.every(isLonLat)
  )
}

/** 形を確かめる。壊れた値・別の版は null（呼び出し側で「読めなかった」として扱う） */
function validateScenario(input: unknown): Scenario | null {
  if (typeof input !== 'object' || input === null) return null
  const s = input as Record<string, unknown>
  if (s.v !== VERSION) return null
  const v = s.view as Record<string, unknown> | undefined
  if (!v || !inRange(v.longitude, -180, 180) || !inRange(v.latitude, -90, 90) || !inRange(v.zoom, 0, 24) || !inRange(v.pitch, 0, 90) || !isNum(v.bearing)) {
    return null
  }
  if (!Array.isArray(s.buildings) || s.buildings.length > MAX_BUILDINGS || !s.buildings.every(isScenarioBuilding)) return null
  return input as Scenario
}

const closeRing = (ring: [number, number][]): number[][] => {
  const [first] = ring
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

/** シナリオを画面の状態に戻す。試算結果は係数から計算し直す。読めないシナリオは null */
export function fromScenario(input: unknown): { greened: Record<string, GreenedBuilding>; view: ScenarioView } | null {
  const scenario = validateScenario(input)
  if (!scenario) return null
  const greened: Record<string, GreenedBuilding> = {}
  for (const b of scenario.buildings) {
    const building: BuildingInfo = {
      id: b.id,
      heightM: b.heightM,
      roofAreaM2: b.roofAreaM2,
      perimeterM: b.perimeterM,
      polygon: [closeRing(b.outline)],
    }
    const plan = { roofRatio: b.roofRatio, wallRatio: b.wallRatio }
    greened[b.id] = { building, plan, result: simulateGreening(building, plan) }
  }
  return { greened, view: scenario.view }
}

// --- 文字列（URL用） ---

/** JSON → UTF-8 → Base64URL。URLにそのまま置ける（+ / = を含まない） */
export function encodeScenario(scenario: Scenario): string {
  const bytes = new TextEncoder().encode(JSON.stringify(scenario))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function decodeScenario(text: string): Scenario | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const base64 = text.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return validateScenario(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  } catch {
    return null
  }
}

/** URLのハッシュ（#s=...）からシナリオを取り出す。無い・壊れているときは null */
export function readScenarioFromHash(hash: string): Scenario | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get('s')
  return encoded ? decodeScenario(encoded) : null
}

export type ShareResult = { ok: true; url: string } | { ok: false; reason: string }

/** 共有リンクを作る。長くなりすぎるときは作らず、理由を返す */
export function buildShareUrl(greened: Record<string, GreenedBuilding>, view: ScenarioView, pageUrl: string): ShareResult {
  const scenario = toScenario(greened, view)
  if (scenario.buildings.length === 0) return { ok: false, reason: '共有するには、先に建物を緑化してください' }
  const url = `${pageUrl.replace(/#.*$/, '')}#s=${encodeScenario(scenario)}`
  if (url.length > MAX_SHARE_URL_LENGTH) {
    return {
      ok: false,
      reason: `リンクが長すぎて共有できません（${scenario.buildings.length}棟）。棟数を減らすか、「この端末に保存」を使ってください`,
    }
  }
  return { ok: true, url }
}

// --- 端末への保存 ---

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** 保存できたかを返す。容量超過・プライベートブラウズなどで使えないときは false（例外にしない） */
export function saveScenario(storage: StorageLike, scenario: Scenario): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(scenario))
    return true
  } catch {
    return false
  }
}

/** 保存したシナリオを読む。無い・壊れている・使えないときは null */
export function loadScenario(storage: StorageLike): Scenario | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw ? validateScenario(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
