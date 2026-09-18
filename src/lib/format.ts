// 表示用の数値フォーマット（日本語ロケール）
const nf = (maxDigits: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: maxDigits })

export const formatInt = (v: number) => nf(0).format(Math.round(v))
export const formatNum = (v: number, digits = 1) => nf(digits).format(v)

/** 1ha以上はha、それ未満はm² */
export const formatArea = (m2: number) => (m2 >= 10_000 ? `${nf(2).format(m2 / 10_000)} ha` : `${formatInt(m2)} m²`)
