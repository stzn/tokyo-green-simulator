// 緑化シミュレーション・街路樹推定の係数（すべて公的資料で出典を確認済み。2026-09 確認）
// 計算に含めない効果とその理由は EXCLUDED_EFFECTS にまとめている（原典に当たって確認済み）。
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

// --- 参考値（計算には使わないが、試算の幅を示すために画面に出す） ---

/**
 * 屋上緑化による通年空調負荷の削減率は、建物の断熱性能で2倍以上変わる。
 * このアプリの試算（9.40 kWh/m²・年）は建物ごとの断熱性能を区別しておらず、
 * 実際の削減量はこの幅の中で上下することを示すために持っている
 */
export const ROOF_COOLING_RANGE_BY_INSULATION = {
  /** 東京での通年空調負荷削減率[%]（断熱材の厚さ別） */
  tokyo: { none: 12.4, mm25: 7.1, mm50: 5.0 },
  source:
    '環境省「ヒートアイランド対策ガイドライン改訂版」（平成25年3月）3章 No.7 屋上緑化 図3.32 業務建物における空調負荷削減効果（LESCOMシミュレーション）。最上階が対象',
  url: 'https://www.env.go.jp/air/life/heat_island/guideline/h24/chpt3.pdf',
} as const

// --- 計算に含めていない効果 ---

export type ExcludedEffect = {
  label: string
  /** 原典に当たって確認した資料 */
  checked: string
  /** 何が書かれていたか、なぜ計算に含めないか */
  reason: string
}

/**
 * 公的資料に当たったうえで計算に含めないと判断した効果（2026-09 調査）。
 * 「根拠が見つからない」ではなく、どの資料の何を見て判断したかを残す
 */
export const EXCLUDED_EFFECTS: ExcludedEffect[] = [
  {
    label: '屋上・壁面の植物によるCO2固定',
    checked: '日本国温室効果ガスインベントリ報告書2025年 6章 6.8.1（Page 6-62、脚注13）',
    reason:
      '国の算定でも都市緑地の生体バイオマスは「高木（樹高3〜5m以上になる樹木）のみ」を対象としており、屋上の芝生・地被・低木は計上しない。国と同じ範囲に合わせる',
  },
  {
    label: '雨水の一時貯留（流出抑制）',
    checked:
      '東京都雨水貯留・浸透施設技術指針（平成21年2月）本編・資料編、国土交通省「低炭素まちづくり実践ハンドブック 資料編」、国土交通省 屋上緑化・壁面緑化推進の取組',
    reason:
      '技術指針が扱う「屋上貯留」は屋上を貯留施設にするもので、屋上緑化の植栽基盤そのものの貯留量[mm]は示されていない。他の公的資料にも原単位が無く、貯留量は土壌厚・土壌材料・先行降雨で大きく変わるため、代表値を置くと誤差が大きい',
  },
  {
    label: '壁面緑化による冷房負荷の削減',
    checked: '山崎ほか(2009)『熱的薄い壁体建物の屋上・壁面緑化による冷房負荷低減効果』日本建築学会技術報告集',
    reason: '査読付き論文はあるが、断熱のほぼ無い実験棟が対象で、一般建築物に当てはめると過大評価になる',
  },
  {
    label: '植栽タイプ（セダム・芝・低中木）による差',
    checked: '環境省「ヒートアイランド対策ガイドライン改訂版」3章 No.7 屋上緑化・No.8 壁面緑化',
    reason:
      'セダム系植物は「蒸散量が少なく、対策効果が限定的」、壁面緑化は「樹種や工法によって効果にも違いが見られる」と書かれているが、いずれも定性的な記述でタイプ別の数値が無い',
  },
  {
    label: '周辺気温の低下',
    checked: '環境省「ヒートアイランド対策ガイドライン改訂版」3章 No.6 建物敷地の緑化 図3.27（UCSSシミュレーション）',
    reason:
      '緑化率別の気温低下を示した図はあるが、対象が「敷地の緑化」で屋上・壁面緑化ではなく、数値も図から読み取る形でしか示されていない。建物単位の推計には使えない',
  },
]

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
