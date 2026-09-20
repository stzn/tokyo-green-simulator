// 東京都都市整備局「緑のオープンデータ」の街路樹（路線単位）→ アプリで使う形へ
// 区市町村道の街路樹は単木の位置が公開されておらず、路線の線に「樹種」と「本数」が付く形で配布される
import proj4 from 'proj4'
import { TOKYO_23_WARDS } from './tokyoWards'

/** dbfの1行（shapefileパッケージが返すプロパティ） */
export type CityTreeAttributes = {
  区市町村?: string
  樹種?: string
  本数?: number
  路線名?: string
  道路通称名?: string
  所管?: string
  備考?: string
}

export type CityTreeRoute = {
  ward: string
  /** カンマ区切りの樹種を分割したもの。不明な場合は ['樹種不明'] */
  species: string[]
  /** 本数。不明（-9999）は null */
  count: number | null
  route: string
  /** 道路通称名。無い場合は空文字 */
  alias: string
  manager: string
}

/** 本数が不明なレコードに入っている値 */
const UNKNOWN_COUNT = -9999
/** 値が無いことを表す記号（道路通称名・備考などで使われる） */
const EMPTY_MARKS = new Set(['', '-', '－'])

const clean = (value: string | undefined) => {
  const v = (value ?? '').trim()
  return EMPTY_MARKS.has(v) ? '' : v
}

export function toCityTreeRoute(attrs: CityTreeAttributes): CityTreeRoute {
  const species = (attrs.樹種 ?? '')
    .split(',')
    .map((s) => clean(s))
    .filter((s) => s !== '')
  const count = attrs.本数
  return {
    ward: clean(attrs.区市町村),
    species: species.length > 0 ? species : ['樹種不明'],
    count: count === undefined || count === UNKNOWN_COUNT ? null : count,
    route: clean(attrs.路線名),
    alias: clean(attrs.道路通称名),
    manager: clean(attrs.所管),
  }
}

const WARDS_23 = new Set<string>(TOKYO_23_WARDS)

/** このアプリの対象は23区。多摩部の市町村は除く */
export const isTokyo23Ward = (name: string): boolean => WARDS_23.has(name)

// 配布データの座標系: JGD2011 平面直角座標系 第9系（EPSG:6677）。原点は北緯36度・東経139度50分
const JGD2011_ZONE_9 = '+proj=tmerc +lat_0=36 +lon_0=139.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs'

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

/** 第9系の[x, y]（東方向, 北方向）を [経度, 緯度] に直す */
export function toWgs84([x, y]: [number, number]): [number, number] {
  const [lon, lat] = proj4(JGD2011_ZONE_9, WGS84, [x, y])
  return [round6(lon), round6(lat)]
}
