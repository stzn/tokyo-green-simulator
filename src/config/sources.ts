// データソースと出典表記
export const PLATEAU_BUILDINGS_TILES = 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf'

export const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'

/** 丸の内・大手町を斜めから見下ろす初期視点 */
export const INITIAL_VIEW_STATE = {
  longitude: 139.7645,
  latitude: 35.6795,
  zoom: 15.6,
  pitch: 60,
  bearing: -25,
}

export const ATTRIBUTIONS = [
  { label: '3D都市モデル（Project PLATEAU）東京都23区', detail: '国土交通省／MVT変換: indigo-lab（CC BY 4.0）', url: 'https://github.com/indigo-lab/plateau-tokyo23ku-building-mvt-2020' },
  { label: '都道の街路樹（23区）', detail: '東京都建設局（CC BY 4.0）', url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/t000014d2000000029' },
  { label: '公園・行政界', detail: '© OpenStreetMap contributors（ODbL）', url: 'https://www.openstreetmap.org/copyright' },
  { label: 'ベースマップ', detail: 'OpenFreeMap © OpenMapTiles', url: 'https://openfreemap.org' },
] as const
