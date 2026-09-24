// 計測ログ（experiment_log.csv）の読み込みと、緑の文脈つきCSVの書き出し。
// 健康データを含むため、ここで扱う内容は端末の外に出さない（保存・送信・共有リンクへの埋め込みをしない）

export type Measurement = {
  timestamp: string
  location: string
  lat: number
  lon: number
  /** Green / Urban など。列が無い・空なら '' */
  environment: string
  /** 心拍変動SDNN[ms]。空なら null */
  hrvSdnn: number | null
  heartRate: number | null
  notes: string
  /** 元のCSVの列（列名, 値）を並びのまま持つ。書き出し時に余分な列も含めてそのまま通すため */
  raw: [string, string][]
}

/** 計測地点のまわり（半径R m以内）の緑。読み込み中のデータがある場合は計算せず null を渡す */
export type GreenContext = {
  /** 街路樹（都道・単木）。tall は高木 */
  trees: { total: number; tall: number }
  /** 区市町村道の街路樹。count は本数が公開されている路線の合計 */
  cityTrees: { routes: number; count: number }
  /** 円に一部でも重なる公園。面積は公園全体の面積 */
  parks: { count: number; areaM2: number }
  /** 最寄りの公園の外周までの距離[m]。公園の中なら0、公園データが無ければ null */
  nearestParkM: number | null
  inPark: boolean
}

export const CONTEXT_COLUMNS = [
  'radius_m',
  'trees_all',
  'trees_tall',
  'city_tree_routes',
  'city_trees_known',
  'parks_count',
  'parks_area_m2',
  'nearest_park_m',
  'in_park',
] as const

const REQUIRED_COLUMNS = ['timestamp', 'location', 'lat', 'lon'] as const

// 東京23区とその周辺のおおよその範囲。緯度と経度の取り違えなどを弾くために使う
const LAT_RANGE = [35.4, 35.95] as const
const LON_RANGE = [139.4, 140.0] as const

export type ParseResult = {
  records: Measurement[]
  errors: { line: number; message: string }[]
}

type Row = { line: number; cells: string[] }

/** RFC 4180 相当のCSV分割。引用符の中のカンマ・改行・""に対応する。line は行の開始位置（1始まり） */
function splitCsv(text: string): Row[] {
  const rows: Row[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  const endRow = () => {
    cells.push(cell)
    // 空行（セルが1つで空）は読み飛ばす
    if (!(cells.length === 1 && cells[0].trim() === '')) rows.push({ line: rowLine, cells })
    cells = []
    cell = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else {
        if (c === '\n') line++
        cell += c
      }
    } else if (c === '"') quoted = true
    else if (c === ',') {
      cells.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
      line++
      rowLine = line
    } else cell += c
  }
  if (cell !== '' || cells.length > 0) endRow()
  return rows
}

const toNumberOrNull = (value: string): number | null => {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const inRange = (n: number, [min, max]: readonly [number, number]) => n >= min && n <= max

export function parseMeasurementLog(text: string): ParseResult {
  const rows = splitCsv(text.replace(/^﻿/, ''))
  if (rows.length === 0) return { records: [], errors: [{ line: 1, message: '空のファイルです' }] }

  const headers = rows[0].cells.map((h) => h.trim())
  const missing = REQUIRED_COLUMNS.filter((name) => !headers.includes(name))
  if (missing.length > 0) return { records: [], errors: [{ line: rows[0].line, message: `必須列がありません: ${missing.join(', ')}` }] }

  const records: Measurement[] = []
  const errors: ParseResult['errors'] = []
  for (const { line, cells } of rows.slice(1)) {
    const get = (name: string) => (cells[headers.indexOf(name)] ?? '').trim()
    const lat = toNumberOrNull(get('lat'))
    const lon = toNumberOrNull(get('lon'))
    if (lat === null) {
      errors.push({ line, message: `緯度（lat）が数値ではありません: "${get('lat')}"` })
      continue
    }
    if (lon === null) {
      errors.push({ line, message: `経度（lon）が数値ではありません: "${get('lon')}"` })
      continue
    }
    if (!inRange(lat, LAT_RANGE) || !inRange(lon, LON_RANGE)) {
      errors.push({ line, message: `東京付近の座標ではありません（緯度と経度が逆の可能性）: lat=${lat}, lon=${lon}` })
      continue
    }
    records.push({
      timestamp: get('timestamp'),
      location: get('location'),
      lat,
      lon,
      environment: get('environment'),
      hrvSdnn: toNumberOrNull(get('hrv_sdnn')),
      heartRate: toNumberOrNull(get('heart_rate')),
      notes: get('notes'),
      raw: headers.map((h, i) => [h, cells[i] ?? '']),
    })
  }
  return { records, errors }
}

// 表計算ソフトで式として実行されうる先頭文字。数値として読める値（-5など）は対象外
const FORMULA_START = /^[=+\-@\t\r]/

function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) && !Number.isFinite(Number(value)) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const contextCells = (context: GreenContext | null, radiusM: number): string[] => {
  if (!context) return [String(radiusM), ...Array(CONTEXT_COLUMNS.length - 1).fill('')]
  return [
    String(radiusM),
    String(context.trees.total),
    String(context.trees.tall),
    String(context.cityTrees.routes),
    String(context.cityTrees.count),
    String(context.parks.count),
    String(Math.round(context.parks.areaM2)),
    context.nearestParkM === null ? '' : String(context.nearestParkM),
    String(context.inPark),
  ]
}

/** 元の列の後ろに緑の文脈の列を付け足したCSV。contexts は records と同じ並びで、未計算は null */
export function toCsvWithContext(records: Measurement[], contexts: (GreenContext | null)[], radiusM: number): string {
  if (records.length === 0) return ''
  const head = [...records[0].raw.map(([name]) => name), ...CONTEXT_COLUMNS]
  const lines = records.map((record, i) => [...record.raw.map(([, value]) => value), ...contextCells(contexts[i] ?? null, radiusM)])
  return `${[head, ...lines].map((cells) => cells.map(escapeCell).join(',')).join('\n')}\n`
}
