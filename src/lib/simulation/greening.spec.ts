import { describe, expect, it } from 'vitest'
import {
  CEDAR_CO2_PER_TREE,
  EMISSION_FACTOR,
  ROOF_SURFACE_TEMP_DROP_MAX,
  ROOF_SURFACE_TEMP_DROP_TYPICAL,
  WALL_SURFACE_TEMP_DROP_MAX,
  roofCoolingSavingKWhPerM2,
} from './coefficients'
import { simulateGreening, type BuildingShape } from './greening'

const building: BuildingShape = { roofAreaM2: 1000, perimeterM: 130, heightM: 40 }

describe('機能: 建物の緑化効果を算出する（出典のある効果のみ）', () => {
  describe('シナリオ: 緑化しない', () => {
    it('Given 屋上0%・壁面0% / When 算出する / Then すべての指標が0', () => {
      expect(simulateGreening(building, { roofRatio: 0, wallRatio: 0 })).toEqual({
        roofGreenM2: 0,
        wallGreenM2: 0,
        roofSurfaceTempDropC: 0,
        roofSurfaceTempDropMaxC: 0,
        wallSurfaceTempDropMaxC: 0,
        coolingSavedKWh: 0,
        co2TotalKg: 0,
        cedarEquivalent: 0,
      })
    })
  })

  describe('シナリオ: 屋上を全面緑化する', () => {
    const r = simulateGreening(building, { roofRatio: 1, wallRatio: 0 })

    it('Given 屋上1,000m²を100% / Then 緑化面積は1,000m²', () => {
      expect(r.roofGreenM2).toBe(1000)
    })

    it('Given 屋上1,000m² / Then 冷房の電力削減は 1,000 × 9.40 ≒ 9,402 kWh/年', () => {
      expect(r.coolingSavedKWh).toBeCloseTo(1000 * roofCoolingSavingKWhPerM2())
    })

    it('Given 冷房の電力削減 / Then CO2削減は電力量 × 排出係数（0.421）', () => {
      expect(r.co2TotalKg).toBeCloseTo(r.coolingSavedKWh * EMISSION_FACTOR.value)
    })

    it('Given CO2削減 / Then スギの本数に換算される', () => {
      expect(r.cedarEquivalent).toBeCloseTo(r.co2TotalKg / CEDAR_CO2_PER_TREE.value)
    })
  })

  describe('シナリオ: 屋上の表面温度', () => {
    it('Given 屋上緑化あり / Then 緑化部分の表面温度低下は目安15℃・最大23.7℃（緑化率では按分しない）', () => {
      for (const roofRatio of [0.2, 0.5, 1]) {
        const r = simulateGreening(building, { roofRatio, wallRatio: 0 })
        expect(r.roofSurfaceTempDropC).toBe(ROOF_SURFACE_TEMP_DROP_TYPICAL.value)
        expect(r.roofSurfaceTempDropMaxC).toBe(ROOF_SURFACE_TEMP_DROP_MAX.value)
      }
    })
  })

  describe('シナリオ: 壁面を緑化する', () => {
    it('Given 外周130m・高さ40m・壁面20% / Then 壁面緑化面積は1,040m²', () => {
      expect(simulateGreening(building, { roofRatio: 0, wallRatio: 0.2 }).wallGreenM2).toBeCloseTo(1040)
    })

    it('Given 壁面のみ緑化 / Then 壁面の表面温度低下（最大10℃）だけが出て、CO2は計上しない', () => {
      const r = simulateGreening(building, { roofRatio: 0, wallRatio: 0.2 })
      expect(r.wallSurfaceTempDropMaxC).toBe(WALL_SURFACE_TEMP_DROP_MAX.value)
      expect(r.co2TotalKg).toBe(0)
      expect(r.coolingSavedKWh).toBe(0)
      expect(r.roofSurfaceTempDropC).toBe(0)
    })
  })

  describe('シナリオ: 範囲外の入力', () => {
    it('Given 緑化率が1を超える・負の値 / When 算出する / Then 0〜1に丸めて計算する', () => {
      const r = simulateGreening(building, { roofRatio: 1.5, wallRatio: -0.3 })
      expect(r.roofGreenM2).toBe(1000)
      expect(r.wallGreenM2).toBe(0)
    })

    it('Given 高さや面積が0の建物 / When 算出する / Then 0を返しNaNにならない', () => {
      const r = simulateGreening({ roofAreaM2: 0, perimeterM: 0, heightM: 0 }, { roofRatio: 1, wallRatio: 1 })
      expect(r.co2TotalKg).toBe(0)
      expect(r.roofSurfaceTempDropC).toBe(0)
      expect(r.wallSurfaceTempDropMaxC).toBe(0)
    })
  })
})
