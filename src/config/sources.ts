// データソースと出典表記
export const PLATEAU_BUILDINGS_TILES = 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf'

export const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'

/**
 * 地理院標高タイルを配信形式に詰め替えたもの（npm run data:dem で生成。src/lib/dem.ts 参照）。
 * z=10〜13を持ち、ズームインでは13のタイルを使い回す。
 * 低ズーム側を欠かすとMapLibreのterrainがベースマップを描けなくなるため、アプリの最小ズームまで用意している
 */
export const DEM_TILES = `${import.meta.env.BASE_URL}data/dem/{z}/{x}-{y}.png`
export const DEM_MIN_ZOOM = 10
export const DEM_MAX_ZOOM = 13

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
  { label: '地形（標高タイル）', detail: '国土地理院「地理院タイル（標高タイルDEM10B）」を加工して使用', url: 'https://maps.gsi.go.jp/development/ichiran.html' },
  { label: 'ベースマップ', detail: 'OpenFreeMap © OpenMapTiles', url: 'https://openfreemap.org' },
] as const
