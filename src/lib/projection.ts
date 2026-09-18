// 緯度経度をSVGの小さなロケーターマップ用に投影する（現在地ミニマップ専用の軽量投影）
import type { Geometry, Position } from './geo'

export type Extent = { west: number; south: number; east: number; north: number }
export type ViewBox = { width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type Projector = (lng: number, lat: number) => [number, number]

/** 複数の地物（Polygon/MultiPolygon）を包む範囲を求める */
export function computeExtent(features: { geometry: Geometry }[]): Extent {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const { geometry } of features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const rings of polygons) {
      for (const ring of rings) {
        for (const [lng, lat] of ring) {
          if (lng < west) west = lng
          if (lng > east) east = lng
          if (lat < south) south = lat
          if (lat > north) north = lat
        }
      }
    }
  }
  return { west, south, east, north }
}

/**
 * extentをviewBoxに収まるよう、アスペクト比を保って中央に投影する関数を作る（等距円筒図法。中心緯度でcos補正）。
 * padding[px]を指定すると、その分だけ内側に描画される
 */
export function makeProjector(extent: Extent, viewBox: ViewBox, padding = 0): Projector {
  const latMid = (extent.north + extent.south) / 2
  const lonScale = Math.cos((latMid * Math.PI) / 180)
  const lonSpan = Math.max((extent.east - extent.west) * lonScale, 1e-9)
  const latSpan = Math.max(extent.north - extent.south, 1e-9)
  const innerW = viewBox.width - padding * 2
  const innerH = viewBox.height - padding * 2
  const scale = Math.min(innerW / lonSpan, innerH / latSpan)
  const drawW = lonSpan * scale
  const drawH = latSpan * scale
  const offsetX = padding + (innerW - drawW) / 2
  const offsetY = padding + (innerH - drawH) / 2
  return (lng, lat) => [offsetX + (lng - extent.west) * lonScale * scale, offsetY + (extent.north - lat) * scale]
}

/**
 * 現在の表示範囲（bounds）をextent基準のviewBox上の矩形にする。
 * minSize[px]を下回らないようにし、viewBoxの外にははみ出させない（クランプ）
 */
export function projectBoundsToRect(bounds: Extent, extent: Extent, viewBox: ViewBox, padding = 0, minSize = 4): Rect {
  const project = makeProjector(extent, viewBox, padding)
  const [x1, y1] = project(bounds.west, bounds.north)
  const [x2, y2] = project(bounds.east, bounds.south)
  let x = Math.min(x1, x2)
  let y = Math.min(y1, y2)
  let width = Math.abs(x2 - x1)
  let height = Math.abs(y2 - y1)
  if (width < minSize) {
    x -= (minSize - width) / 2
    width = minSize
  }
  if (height < minSize) {
    y -= (minSize - height) / 2
    height = minSize
  }
  const clampedX = Math.max(0, Math.min(x, viewBox.width))
  const clampedY = Math.max(0, Math.min(y, viewBox.height))
  const clampedRight = Math.max(clampedX, Math.min(x + width, viewBox.width))
  const clampedBottom = Math.max(clampedY, Math.min(y + height, viewBox.height))
  return { x: clampedX, y: clampedY, width: clampedRight - clampedX, height: clampedBottom - clampedY }
}

/** ジオメトリ（穴やMultiPolygonを含む）をSVGのd属性文字列にする。穴は fill-rule="evenodd" 前提 */
export function geometryToPath(geometry: Geometry, project: Projector): string {
  const ringPath = (ring: Position[]) => `${ring.map(([lng, lat], i) => `${i === 0 ? 'M' : 'L'}${project(lng, lat).join(',')}`).join(' ')}Z`
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons
    .flat()
    .map(ringPath)
    .join(' ')
}
