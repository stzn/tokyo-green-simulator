import { describe, expect, it } from 'vitest'
import { GIRTH_REGRESSIONS, streetTreeCo2KgPerYear } from './coefficients'
import { estimateAnnualCo2Kg, estimateTreeAge } from './trees'

const ageBy = (species: string, girth: number) => {
  const { slope, intercept } = GIRTH_REGRESSIONS[species]
  return Math.round((girth - intercept) / slope)
}

describe('機能: 街路樹の樹齢を推定する（国総研の樹種別回帰式）', () => {
  it('Given 幹周131cmのイチョウ / When 推定する / Then 回帰式を逆算した樹齢（約48年）と、使った式の樹種を返す', () => {
    expect(estimateTreeAge(131, 'イチョウ')).toEqual({ years: ageBy('イチョウ', 131), formulaSpecies: 'イチョウ' })
    expect(estimateTreeAge(131, 'イチョウ')!.years).toBe(48)
  })

  it('Given CSVの「サクラ」 / When 推定する / Then ソメイヨシノの式を適用したことがわかる', () => {
    expect(estimateTreeAge(120, 'サクラ')).toEqual({ years: ageBy('ソメイヨシノ', 120), formulaSpecies: 'ソメイヨシノ' })
  })

  it('Given CSVの「スズカケノキ」 / When 推定する / Then プラタナスの式を適用する', () => {
    expect(estimateTreeAge(150, 'スズカケノキ')!.formulaSpecies).toBe('プラタナス')
  })

  it('Given 回帰式のない樹種（トキワマンサク） / When 推定する / Then null（推定式なし）', () => {
    expect(estimateTreeAge(60, 'トキワマンサク')).toBeNull()
  })

  it('Given 幹周が欠損（-1） / When 推定する / Then null', () => {
    expect(estimateTreeAge(-1, 'イチョウ')).toBeNull()
  })

  it('Given 切片より小さい幹周（式では0年以下になる） / When 推定する / Then 最低1年として返す', () => {
    expect(estimateTreeAge(10, 'ユリノキ')!.years).toBe(1)
  })
})

describe('機能: 街路樹1本の年間CO2吸収量（国のインベントリの高木1本あたりの値）', () => {
  it('Given 高木 / When 推定する / Then 39.6 kg-CO2/年（幹周によらない）', () => {
    expect(estimateAnnualCo2Kg(true)).toBeCloseTo(streetTreeCo2KgPerYear())
  })

  it('Given 中木 / When 推定する / Then null（国の算定対象外）', () => {
    expect(estimateAnnualCo2Kg(false)).toBeNull()
  })
})
