// 計測地点（experiment_log.csv）のレイヤー。点は環境（Green/Urban）で色分けし、選んだ地点は半径の円を重ねる
// deck.gl 9.4では実験扱いのため _TerrainExtension という名前でエクスポートされている
import { _TerrainExtension as TerrainExtension, type TerrainExtensionProps } from '@deck.gl/extensions'
import { ScatterplotLayer } from '@deck.gl/layers'
import type { Measurement } from '../lib/measurementLog'

type Color = [number, number, number, number]

const GREEN: Color = [52, 211, 153, 255]
const URBAN: Color = [148, 163, 184, 255]
const OTHER: Color = [251, 191, 36, 255]

/** Green は緑、Urban は灰色、それ以外（未指定を含む）は琥珀色。大文字小文字と前後の空白は区別しない */
export function environmentColor(environment: string): Color {
  const key = environment.trim().toLowerCase()
  if (key === 'green') return GREEN
  if (key === 'urban') return URBAN
  return OTHER
}

// 点は地形の標高ぶん持ち上げる（公園レイヤーと同じくoffset）
const terrainExtension = new TerrainExtension()

type Options = {
  measurements: Measurement[]
  visible: boolean
  selectedIndex: number | null
  radiusM: number
  terrain: boolean
}

export function createMeasurementLayers({ measurements, visible, selectedIndex, radiusM, terrain }: Options) {
  // データが無いうちはレイヤーを作らない（空のまま地形の仕組みに乗せると、初回描画でdeck.glがエラーを出す）
  if (measurements.length === 0) return []
  const extensions = terrain ? [terrainExtension] : []
  const selected = selectedIndex === null ? undefined : measurements[selectedIndex]

  const points = new ScatterplotLayer<Measurement, TerrainExtensionProps>({
    id: 'measurements',
    data: measurements,
    visible,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 120],
    getPosition: (m) => [m.lon, m.lat],
    getFillColor: (m) => environmentColor(m.environment),
    getLineColor: [15, 23, 42, 255],
    radiusUnits: 'pixels',
    getRadius: 7,
    stroked: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 2,
    extensions,
    terrainDrawMode: 'offset',
  })
  if (!selected) return [points]

  // 選んだ地点の集計範囲。メートルで描くので、ズームしても実際の半径のまま
  const circle = new ScatterplotLayer<Measurement, TerrainExtensionProps>({
    id: 'measurement-radius',
    data: [selected],
    visible,
    pickable: false,
    getPosition: (m) => [m.lon, m.lat],
    getFillColor: [52, 211, 153, 40],
    getLineColor: [110, 231, 183, 220],
    radiusUnits: 'meters',
    getRadius: radiusM,
    stroked: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 1.5,
    extensions,
    terrainDrawMode: 'offset',
  })
  return [points, circle]
}
