// 太陽位置（方位・高度）。NOAA の簡易式（Spencer の級数による均時差・赤緯）で、誤差は0.5°程度。
// 日影の判定には十分な精度で、依存を増やさないため自前で計算する

export type SolarPosition = {
  /** 北を0°として時計回り（東=90°、南=180°） */
  azimuthDeg: number
  /** 地平線を0°とした高度（大気差の補正なし）。負は地平線の下 */
  altitudeDeg: number
}

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** 日本時間（Asia/Tokyo、夏時間なし）の日付と時・分から Date を作る。分は60以上でもよい */
export function jstDate(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour - 9, minute))
}

/** 時刻と地点（緯度・経度[°]）から太陽の方位と高度を求める */
export function solarPosition(at: Date, latDeg: number, lonDeg: number): SolarPosition {
  const startOfYear = Date.UTC(at.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((at.getTime() - startOfYear) / 86_400_000) + 1
  const hourUtc = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600
  const daysInYear = (at.getUTCFullYear() % 4 === 0 && at.getUTCFullYear() % 100 !== 0) || at.getUTCFullYear() % 400 === 0 ? 366 : 365
  // 年の中の位置（ラジアン）
  const g = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1 + (hourUtc - 12) / 24)

  // 均時差[分]と赤緯[rad]
  const eqTimeMin =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)

  // 真太陽時[分] → 時角[rad]（南中で0、午前は負）
  const trueSolarMin = hourUtc * 60 + eqTimeMin + 4 * lonDeg
  const hourAngle = toRad(trueSolarMin / 4 - 180)

  const lat = toRad(latDeg)
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)
  const altitudeDeg = toDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))))
  // 南から測った方位を、北から時計回りに直す
  const fromSouth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat))
  const azimuthDeg = (toDeg(fromSouth) + 180 + 360) % 360
  return { azimuthDeg, altitudeDeg }
}
