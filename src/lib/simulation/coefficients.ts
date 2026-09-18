// 緑化シミュレーション・街路樹推定の係数（すべて公的資料で出典を確認済み。2026-09 確認）
// 公的な根拠が見つからない効果（植物によるCO2固定、雨水貯留、壁面の冷房削減、植栽タイプ別の差）は計算に含めない。
// 値を変えるときは source・url を必ず更新し、coefficients.spec.ts を通すこと。

export type Coefficient = {
  value: number
  unit: string
  label: string
  /** 出典（資料名・該当箇所・前提条件） */
  source: string
  url: string
  verified: boolean
}

// --- 電力・換算 ---

export const EMISSION_FACTOR: Coefficient = {
  value: 0.421,
  unit: 'kg-CO2/kWh',
  label: '電力のCO2排出係数（東京電力EP 2024年度）',
  source: '東京電力エナジーパートナー「CO2排出係数について」2024年度の基礎排出係数・調整後排出係数（同値）。2025年度（0.418）は速報値のため不採用',
  url: 'https://www.tepco.co.jp/ep/company/warming/keisuu',
  verified: true,
}

export const CEDAR_CO2_PER_TREE: Coefficient = {
  value: 8.8,
  unit: 'kg-CO2/本・年',
  label: 'スギ1本の年間CO2吸収量（換算用）',
  source: '林野庁「森林はどのぐらいの量の二酸化炭素を吸収しているの？」36〜40年生のスギ人工林（1,000本/haと仮定）',
  url: 'https://www.rinya.maff.go.jp/j/sin_riyou/ondanka/20141113_topics2_2.html',
  verified: true,
}

// --- 屋上緑化 ---

export const ROOF_COOLING_CO2_REFERENCE: Coefficient = {
  value: 5.218,
  unit: 'kg-CO2/m²・年',
  label: '屋上緑化による冷房等の熱負荷削減に伴うCO2削減量',
  source:
    '国土交通省「低炭素まちづくり実践ハンドブック 資料編」（平成25年12月）4-4 屋上緑化による熱環境改善。クールルーフ推進協議会「平成18年度環境と経済の好循環のまちモデル事業」報告書の値',
  url: 'https://www.mlit.go.jp/common/001023245.pdf',
  verified: true,
}

export const ROOF_COOLING_REFERENCE_EMISSION_FACTOR: Coefficient = {
  value: 0.555,
  unit: 'kg-CO2/kWh',
  label: '上記CO2削減量の算定時の電力排出係数',
  source: '同ハンドブック 4-4（CO2削減量5.218kgは排出係数0.555で算定。電力量に戻すために使う）',
  url: 'https://www.mlit.go.jp/common/001023245.pdf',
  verified: true,
}

/** 屋上緑化1m²あたりの年間の冷房等の電力削減量[kWh] = 5.218 ÷ 0.555 */
export const roofCoolingSavingKWhPerM2 = () => ROOF_COOLING_CO2_REFERENCE.value / ROOF_COOLING_REFERENCE_EMISSION_FACTOR.value

export const ROOF_SURFACE_TEMP_DROP_TYPICAL: Coefficient = {
  value: 15,
  unit: '℃',
  label: '屋上緑化による表面温度低下（夏季の目安）',
  source: '環境省「ヒートアイランド対策ガイドライン改訂版」（平成25年3月）3章 No.7 屋上緑化「夏季における測定結果では、おおむね15℃程度の表面温度低下効果」',
  url: 'https://www.env.go.jp/air/life/heat_island/guideline/h24/chpt3.pdf',
  verified: true,
}

export const ROOF_SURFACE_TEMP_DROP_MAX: Coefficient = {
  value: 23.7,
  unit: '℃',
  label: '屋上緑化による表面温度低下（最大値の実測）',
  source: '国土交通省 報道発表（平成19年8月24日）霞が関合同庁舎3号館の屋上庭園、猛暑日（8月16日）のタイル面56.1℃と芝生面の最大差',
  url: 'https://www.mlit.go.jp/kisha/kisha07/04/040824_.html',
  verified: true,
}

// --- 壁面緑化 ---

export const WALL_SURFACE_TEMP_DROP_MAX: Coefficient = {
  value: 10,
  unit: '℃',
  label: '壁面緑化による表面温度低下（最大）',
  source: '環境省「ヒートアイランド対策ガイドライン改訂版」3章 No.8 壁面緑化（東京都「壁面緑化ガイドライン」平成18年を引用）。西面・16時頃に最大10℃程度',
  url: 'https://www.env.go.jp/air/life/heat_island/guideline/h24/chpt3.pdf',
  verified: true,
}

// --- 街路樹 ---

export const STREET_TREE_CARBON_PER_TREE: Coefficient = {
  value: 0.0108,
  unit: 't-C/本・年',
  label: '高木1本当たりの年間生体バイオマス成長量（道路緑地・北海道以外）',
  source: '日本国温室効果ガスインベントリ報告書2025年 表6-53。国の算定は高木（樹高3〜5m以上）のみが対象で、中木・低木・草本は計上しない',
  url: 'https://www.env.go.jp/content/000310774.pdf',
  verified: true,
}

/** CO2 / C の分子量比 */
export const CO2_PER_C = 44 / 12

/** 街路樹（高木）1本の年間CO2吸収量[kg] = 0.0108 t-C × 44/12 × 1000 */
export const streetTreeCo2KgPerYear = () => STREET_TREE_CARBON_PER_TREE.value * CO2_PER_C * 1000

export const GIRTH_REGRESSION_SOURCE: Coefficient = {
  value: 17,
  unit: '樹種',
  label: '樹齢と胸高幹周の回帰式（胸高幹周[cm] = a × 樹齢 + b）',
  source:
    '国土技術政策総合研究所「公園樹木管理の高度化に関する研究」（平成22年度）表-12 17樹種における樹木成長量の回帰式。測定樹齢範囲内の直線回帰で、切片を0に固定していない',
  url: 'https://www.nilim.go.jp/lab/bcg/siryou/tnn/tnn0663pdf/ks066309.pdf',
  verified: true,
}

/** 胸高幹周[cm] = slope × 樹齢[年] + intercept（上記 表-12 の値） */
export const GIRTH_REGRESSIONS: Record<string, { slope: number; intercept: number }> = {
  イチョウ: { slope: 3.3907, intercept: -32.1157 },
  ソメイヨシノ: { slope: 3.7777, intercept: 16.415 },
  ケヤキ: { slope: 2.7068, intercept: 14.674 },
  ハナミズキ: { slope: 1.7602, intercept: -4.0851 },
  クスノキ: { slope: 3.0178, intercept: 14.0533 },
  ナナカマド: { slope: 2.3898, intercept: -11.4292 },
  フクギ: { slope: 0.7958, intercept: 21.9286 },
  ヤマザクラ: { slope: 4.6236, intercept: -17.2528 },
  プラタナス: { slope: 4.4123, intercept: -18.1803 },
  イロハモミジ: { slope: 1.8535, intercept: 2.5389 },
  クロガネモチ: { slope: 2.6855, intercept: -5.7438 },
  シラカシ: { slope: 2.724, intercept: -1.6739 },
  ユリノキ: { slope: 2.5207, intercept: 26.9043 },
  ヤマモモ: { slope: 2.0772, intercept: 17.4238 },
  コブシ: { slope: 2.1123, intercept: -1.4201 },
  サルスベリ: { slope: 1.617, intercept: 2.9886 },
  トチノキ: { slope: 2.4751, intercept: -6.1612 },
}

/** 街路樹CSVの樹種名 → 回帰式の樹種名（同一とみなせるものだけ。画面に適用した式を明記する） */
export const GIRTH_REGRESSION_ALIASES: Record<string, string> = {
  サクラ: 'ソメイヨシノ',
  スズカケノキ: 'プラタナス',
  スズカケノキ属: 'プラタナス',
}

/** 画面の「計算方法と出典」とテストで使う一覧 */
export const ALL_COEFFICIENTS: Coefficient[] = [
  ROOF_SURFACE_TEMP_DROP_TYPICAL,
  ROOF_SURFACE_TEMP_DROP_MAX,
  WALL_SURFACE_TEMP_DROP_MAX,
  ROOF_COOLING_CO2_REFERENCE,
  ROOF_COOLING_REFERENCE_EMISSION_FACTOR,
  EMISSION_FACTOR,
  CEDAR_CO2_PER_TREE,
  STREET_TREE_CARBON_PER_TREE,
  GIRTH_REGRESSION_SOURCE,
]
