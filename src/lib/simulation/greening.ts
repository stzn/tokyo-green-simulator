// 建物の屋上・壁面緑化による効果を算出する純関数（出典のある効果のみ。係数は coefficients.ts）
import {
  CEDAR_CO2_PER_TREE,
  EMISSION_FACTOR,
  ROOF_SURFACE_TEMP_DROP_MAX,
  ROOF_SURFACE_TEMP_DROP_TYPICAL,
  WALL_SURFACE_TEMP_DROP_MAX,
  roofCoolingSavingKWhPerM2,
} from './coefficients'

export type BuildingShape = {
  roofAreaM2: number
  perimeterM: number
  heightM: number
}

export type GreeningPlan = {
  /** 屋上緑化率 0〜1（設備スペース等を除いた実緑化の割合） */
  roofRatio: number
  /** 壁面緑化率 0〜1 */
  wallRatio: number
}

export type GreeningResult = {
  roofGreenM2: number
  wallGreenM2: number
  /** 緑化部分の屋上表面温度の低下[℃]（夏季の目安）。屋上全体の平均ではない */
  roofSurfaceTempDropC: number
  /** 同・最大値の実測[℃] */
  roofSurfaceTempDropMaxC: number
  /** 緑化部分の壁面表面温度の低下[℃]（最大） */
  wallSurfaceTempDropMaxC: number
  /** 屋上緑化による冷房等の年間電力削減[kWh] */
  coolingSavedKWh: number
  /** 冷房等の電力削減による年間CO2削減[kg]（植物による固定は含まない） */
  co2TotalKg: number
  /** スギ何本分の年間吸収量に相当するか */
  cedarEquivalent: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
const nonNegative = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0)

export function simulateGreening(building: BuildingShape, plan: GreeningPlan): GreeningResult {
  const roofGreenM2 = nonNegative(building.roofAreaM2) * clamp01(plan.roofRatio)
  const wallGreenM2 = nonNegative(building.perimeterM) * nonNegative(building.heightM) * clamp01(plan.wallRatio)

  const coolingSavedKWh = roofGreenM2 * roofCoolingSavingKWhPerM2()
  const co2TotalKg = coolingSavedKWh * EMISSION_FACTOR.value
  const hasRoof = roofGreenM2 > 0

  return {
    roofGreenM2,
    wallGreenM2,
    roofSurfaceTempDropC: hasRoof ? ROOF_SURFACE_TEMP_DROP_TYPICAL.value : 0,
    roofSurfaceTempDropMaxC: hasRoof ? ROOF_SURFACE_TEMP_DROP_MAX.value : 0,
    wallSurfaceTempDropMaxC: wallGreenM2 > 0 ? WALL_SURFACE_TEMP_DROP_MAX.value : 0,
    coolingSavedKWh,
    co2TotalKg,
    cedarEquivalent: co2TotalKg / CEDAR_CO2_PER_TREE.value,
  }
}
