// 役者（virtual-greening-sim）へ渡す舞台（stage.json、データ契約 v1）の型と、スキーマで表せない整合性の確認。
// 型は contracts/stage.schema.json（正本は役者側の src/vmgs/contracts.py）に合わせる
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
}

export type Stage = {
  schema_version: '1'
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

/** 地点 ID の重複と、地点ごとの時刻の重複（JSON Schema では表せない決めごと）を確かめる */
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
  return errors
}
