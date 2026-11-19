// シミュレーター（virtual-greening-sim）へ渡す地点データ（stage.json、データ契約の版 2）の型と、スキーマで表せない整合性の確認。
// 型は contracts/stage.schema.json（正本はシミュレーター側の src/vmgs/contracts.py）に合わせる
import type { GreenContext } from './measurementLog'

export type SpotKind = 'sidewalk' | 'plaza' | 'park_edge' | 'rooftop'

export type StageGreen = {
  radius_m: number
  trees_all: number
  trees_tall: number
  parks_count: number
  parks_area_m2: number
  nearest_park_m: number | null
}

export type StageSpot = {
  id: string
  name: string
  lat: number
  lon: number
  kind: SpotKind
  capacity_pods: number
  sky_view_factor: number
  green: StageGreen
  hourly: { hour: number; shade_fraction: number }[]
  /** 地点・時刻ごとの集計値のみ（個人の計測値は入れない） */
  demand?: { hour: number; weight: number }[]
  /** 屋根の有無（版 2 から。無ければ open）。covered は地下通路・屋内の通路・アーケードの上 */
  shelter?: Shelter
  /** 屋根付きの通路の網の番号（版 2 から、covered の地点だけ）。同じ番号の地点どうしは濡れずに行き来できる */
  shelter_network?: string
}

export type Shelter = 'open' | 'covered'

export type Stage = {
  schema_version: '1' | '2'
  area: { id: string; name: string; bbox: [number, number, number, number] }
  date: string
  timezone: 'Asia/Tokyo'
  generator: string
  spots: StageSpot[]
}

/** npm run stage:export の出力先（リポジトリ直下から） */
export const STAGE_OUTPUT_PATH = 'public/data/stage/otemachi.json'

/** 計測ログの緑の文脈（computeGreenContext）を、契約の形（CSV 書き出しと同じ列名・丸め）にする */
export function toStageGreen(context: GreenContext, radiusM: number): StageGreen {
  return {
    radius_m: radiusM,
    trees_all: context.trees.total,
    trees_tall: context.trees.tall,
    parks_count: context.parks.count,
    parks_area_m2: Math.round(context.parks.areaM2),
    nearest_park_m: context.nearestParkM,
  }
}

type ShelterSpot = { id: string; name: string; shelter?: Shelter; shelter_network?: string | null }

/** 屋根の決めごと（JSON Schema では表せない）。版 1 は屋根付きの地点を持てず、屋根付きの地点だけが網の番号を持つ */
export function shelterErrors(stage: { schema_version: string; spots: ShelterSpot[] }): string[] {
  const errors: string[] = []
  for (const spot of stage.spots) {
    const covered = spot.shelter === 'covered'
    if (covered && stage.schema_version === '1') errors.push(`${spot.id}: 版 1 の地点データは屋根付きの地点を持てません（版 2 にする）`)
    else if (covered !== (spot.shelter_network != null)) errors.push(`${spot.id}: 屋根付きの地点だけが網の番号（shelter_network）を持ちます`)
  }
  return errors
}

/** 地図の説明に出す地点の名前。屋根付きの地点には網の番号を添える */
export function spotLabel(spot: ShelterSpot): string {
  return spot.shelter === 'covered' ? `${spot.name}・屋根付き（網 ${spot.shelter_network}）` : spot.name
}

/** 地点 ID の重複、地点ごとの時刻の重複、屋根の決めごと（JSON Schema では表せない決めごと）を確かめる */
export function stageIntegrityErrors(stage: Stage): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const spot of stage.spots) {
    if (ids.has(spot.id)) errors.push(`地点 ID が重複しています: ${spot.id}`)
    ids.add(spot.id)
    const hours = new Set<number>()
    for (const { hour } of spot.hourly) {
      if (hours.has(hour)) errors.push(`${spot.id}: 時刻 ${hour} が重複しています`)
      hours.add(hour)
    }
  }
  return [...errors, ...shelterErrors(stage)]
}
