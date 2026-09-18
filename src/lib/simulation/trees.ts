// 街路樹の属性から推定値（樹齢・年間CO2吸収量）を求める。UIでは必ず「推定」と表示すること
import { GIRTH_REGRESSION_ALIASES, GIRTH_REGRESSIONS, streetTreeCo2KgPerYear } from './coefficients'

export type AgeEstimate = {
  years: number
  /** 適用した回帰式の樹種（CSVの樹種名と違う場合は画面に明記する） */
  formulaSpecies: string
}

/**
 * 胸高幹周[cm]から樹齢[年]を推定する（国総研の樹種別回帰式を逆算）。
 * 回帰式のない樹種、または幹周が欠損（<=0）なら null
 */
export function estimateTreeAge(girthCm: number, species: string): AgeEstimate | null {
  if (!(girthCm > 0)) return null
  const formulaSpecies = GIRTH_REGRESSION_ALIASES[species] ?? species
  const regression = GIRTH_REGRESSIONS[formulaSpecies]
  if (!regression) return null
  const years = Math.round((girthCm - regression.intercept) / regression.slope)
  // 切片の影響で0年以下になる小径木は1年とする
  return { years: Math.max(1, years), formulaSpecies }
}

/** 年間CO2吸収量[kg]。国のインベントリと同じく高木のみ対象とし、中木は null */
export function estimateAnnualCo2Kg(isTall: boolean): number | null {
  return isTall ? streetTreeCo2KgPerYear() : null
}
