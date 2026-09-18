import { describe, expect, it } from 'vitest'
import {
  ALL_COEFFICIENTS,
  GIRTH_REGRESSIONS,
  roofCoolingSavingKWhPerM2,
  streetTreeCo2KgPerYear,
} from './coefficients'

describe('機能: 係数の出典管理', () => {
  it('Given 計算に使う係数 / Then すべて出典確認済みで、出典URL（https）を持つ', () => {
    expect(ALL_COEFFICIENTS.length).toBeGreaterThan(0)
    for (const c of ALL_COEFFICIENTS) {
      expect(c.verified, c.label).toBe(true)
      expect(c.url, c.label).toMatch(/^https:\/\//)
      expect(c.source.length, c.label).toBeGreaterThan(0)
    }
  })

  it('Given 屋上緑化のCO2削減量 5.218kg と当時の排出係数 0.555 / When 電力量に換算する / Then 約9.40 kWh/m²・年', () => {
    expect(roofCoolingSavingKWhPerM2()).toBeCloseTo(5.218 / 0.555, 6)
    expect(roofCoolingSavingKWhPerM2()).toBeCloseTo(9.40, 2)
  })

  it('Given 高木1本あたり 0.0108 t-C/年 / When CO2に換算する / Then 約39.6 kg-CO2/年', () => {
    expect(streetTreeCo2KgPerYear()).toBeCloseTo(0.0108 * (44 / 12) * 1000, 6)
    expect(streetTreeCo2KgPerYear()).toBeCloseTo(39.6, 1)
  })

  it('Given 国総研の17樹種の回帰式 / Then 主要樹種（イチョウ）の式が報告書の表-12と一致する', () => {
    expect(Object.keys(GIRTH_REGRESSIONS)).toHaveLength(17)
    expect(GIRTH_REGRESSIONS['イチョウ']).toEqual({ slope: 3.3907, intercept: -32.1157 })
  })
})
