// 東京都建設局「都道の街路樹」CSV → 列指向データ（ブラウザで型付き配列に変換しやすい形）

export type TreesColumnar = {
  count: number
  /** lon, lat の交互配列 */
  positions: number[]
  /** 樹高[m] */
  height: number[]
  /** 枝張[m]。欠損は-1 */
  spread: number[]
  /** 幹周[cm]。欠損は-1 */
  girth: number[]
  /** 高木=1, 中木=0 */
  isTall: number[]
  speciesIdx: number[]
  wardIdx: number[]
  routeIdx: number[]
  dict: { species: string[]; wards: string[]; routes: string[] }
}

const MISSING = -1

// 辞書エンコード（出現順にインデックスを振る）
function createDictionary() {
  const values: string[] = []
  const index = new Map<string, number>()
  return {
    values,
    idOf(value: string) {
      let id = index.get(value)
      if (id === undefined) {
        id = values.length
        values.push(value)
        index.set(value, id)
      }
      return id
    },
  }
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
const toNumberOr = (s: string | undefined, fallback: number) => {
  if (s === undefined || s.trim() === '') return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

export function parseTreesCsv(csv: string): TreesColumnar {
  const lines = csv.split(/\r?\n/)
  const header = lines[0].split(',')
  const col = (prefix: string) => {
    const i = header.findIndex((h) => h.startsWith(prefix))
    if (i < 0) throw new Error(`CSVに列「${prefix}」が見つかりません`)
    return i
  }
  const c = {
    species: col('樹種'),
    kind: col('区分'),
    height: col('樹高'),
    spread: col('枝張'),
    girth: col('幹周'),
    ward: col('行政区'),
    route: col('路線名'),
    lon: col('経度'),
    lat: col('緯度'),
  }

  const species = createDictionary()
  const wards = createDictionary()
  const routes = createDictionary()
  const out: TreesColumnar = {
    count: 0,
    positions: [],
    height: [],
    spread: [],
    girth: [],
    isTall: [],
    speciesIdx: [],
    wardIdx: [],
    routeIdx: [],
    dict: { species: species.values, wards: wards.values, routes: routes.values },
  }

  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue
    // このCSVは引用符付きフィールドを含まないため単純分割で足りる
    const f = line.split(',')
    const lon = toNumberOr(f[c.lon], NaN)
    const lat = toNumberOr(f[c.lat], NaN)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue

    out.positions.push(round6(lon), round6(lat))
    out.height.push(toNumberOr(f[c.height], MISSING))
    out.spread.push(toNumberOr(f[c.spread], MISSING))
    out.girth.push(toNumberOr(f[c.girth], MISSING))
    out.isTall.push(f[c.kind] === '高木' ? 1 : 0)
    out.speciesIdx.push(species.idOf(f[c.species] || '不明'))
    out.wardIdx.push(wards.idOf(f[c.ward] || '不明'))
    out.routeIdx.push(routes.idOf(f[c.route] || '不明'))
    out.count++
  }
  return out
}
