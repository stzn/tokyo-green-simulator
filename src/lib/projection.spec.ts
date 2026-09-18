import { describe, expect, it } from 'vitest'
import type { Geometry } from './geo'
import { computeExtent, geometryToPath, makeProjector, projectBoundsToRect, type Extent } from './projection'

const polygonFeature = (coordinates: number[][][]): { geometry: Geometry } => ({ geometry: { type: 'Polygon', coordinates } })

describe('機能: 地物群を包む範囲を求める', () => {
  it('Given 単一のPolygon地物 / Then その頂点群を包む範囲を返す', () => {
    const feature = polygonFeature([
      [
        [139.7, 35.6],
        [139.8, 35.6],
        [139.8, 35.7],
        [139.7, 35.7],
        [139.7, 35.6],
      ],
    ])
    expect(computeExtent([feature])).toEqual({ west: 139.7, south: 35.6, east: 139.8, north: 35.7 })
  })

  it('Given 複数の地物 / Then すべての頂点を包む範囲になる', () => {
    const a = polygonFeature([
      [
        [139.7, 35.6],
        [139.75, 35.6],
        [139.75, 35.65],
        [139.7, 35.65],
        [139.7, 35.6],
      ],
    ])
    const b = polygonFeature([
      [
        [139.8, 35.75],
        [139.85, 35.75],
        [139.85, 35.8],
        [139.8, 35.8],
        [139.8, 35.75],
      ],
    ])
    expect(computeExtent([a, b])).toEqual({ west: 139.7, south: 35.6, east: 139.85, north: 35.8 })
  })

  it('Given MultiPolygonの地物 / Then すべてのポリゴンの頂点を包む範囲になる', () => {
    const feature: { geometry: Geometry } = {
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [139.7, 35.6],
              [139.72, 35.6],
              [139.72, 35.62],
              [139.7, 35.62],
              [139.7, 35.6],
            ],
          ],
          [
            [
              [139.9, 35.8],
              [139.92, 35.8],
              [139.92, 35.82],
              [139.9, 35.82],
              [139.9, 35.8],
            ],
          ],
        ],
      },
    }
    expect(computeExtent([feature])).toEqual({ west: 139.7, south: 35.6, east: 139.92, north: 35.82 })
  })
})

describe('機能: 緯度経度をSVG座標に投影する', () => {
  // 中心緯度0度（cos補正=1）にして計算をシンプルにする
  const extent: Extent = { west: -5, south: -5, east: 5, north: 5 }

  it('Given 正方形のextentと正方形のviewBox・paddingなし / When 四隅を投影する / Then viewBoxの四隅ぴったりに写る', () => {
    const project = makeProjector(extent, { width: 100, height: 100 })
    expect(project(-5, 5)).toEqual([0, 0]) // 北西 → 左上
    expect(project(5, 5)).toEqual([100, 0]) // 北東 → 右上
    expect(project(5, -5)).toEqual([100, 100]) // 南東 → 右下
    expect(project(-5, -5)).toEqual([0, 100]) // 南西 → 左下
  })

  it('Given 中心 / When 投影する / Then viewBoxの中心に写る', () => {
    const project = makeProjector(extent, { width: 100, height: 100 })
    expect(project(0, 0)).toEqual([50, 50])
  })

  it('Given 横長のextent（経度方向が2倍広い）と正方形のviewBox / Then 縦方向にレターボックス（余白）ができ中央に描かれる', () => {
    const wideExtent: Extent = { west: -10, south: -5, east: 10, north: 5 }
    const project = makeProjector(wideExtent, { width: 100, height: 100 })
    // 経度方向はviewBox幅いっぱい、緯度方向は縮尺が同じため半分(50)だけ使われ、上下に25ずつ余白ができる
    expect(project(-10, 5)).toEqual([0, 25])
    expect(project(10, -5)).toEqual([100, 75])
  })

  it('Given padding / Then 描画範囲がpadding分だけ内側に収まる', () => {
    const project = makeProjector(extent, { width: 100, height: 100 }, 10)
    expect(project(-5, 5)).toEqual([10, 10])
    expect(project(5, -5)).toEqual([90, 90])
  })

  it('Given 北緯が高いextent / When cos補正を確認する / Then 経度方向の縮尺が緯度方向より小さくなる（横に詰まる）', () => {
    // 北緯60度付近ではcos(60°)=0.5。経度1度あたりの実距離は緯度1度の約半分になる
    const highLatExtent: Extent = { west: 0, south: 59, east: 1, north: 61 }
    const project = makeProjector(highLatExtent, { width: 200, height: 200 })
    const [x0] = project(0, 60)
    const [x1] = project(1, 60)
    // 緯度2度(60±1)に対して経度1度はcos(60°)倍で圧縮されるため、幅方向に余白ができ x0 > 0 になる
    expect(x0).toBeGreaterThan(0)
    expect(x1 - x0).toBeLessThan(200)
  })
})

describe('機能: 現在の表示範囲を矩形に投影する', () => {
  const extent: Extent = { west: -5, south: -5, east: 5, north: 5 }
  const viewBox = { width: 100, height: 100 }

  it('Given extentと同じ範囲のbounds / Then viewBox全体を覆う矩形になる', () => {
    const rect = projectBoundsToRect(extent, extent, viewBox)
    expect(rect).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('Given extentの右上4分の1だけのbounds / Then 矩形がviewBoxの右上に来る', () => {
    const bounds: Extent = { west: 0, south: 0, east: 5, north: 5 }
    const rect = projectBoundsToRect(bounds, extent, viewBox)
    expect(rect).toEqual({ x: 50, y: 0, width: 50, height: 50 })
  })

  it('Given 非常に小さい範囲（ズームインした状態）のbounds / Then 最小サイズ以上の矩形になる', () => {
    const tiny: Extent = { west: 0, south: 0, east: 0.001, north: 0.001 }
    const rect = projectBoundsToRect(tiny, extent, viewBox, 0, 4)
    expect(rect.width).toBeGreaterThanOrEqual(4)
    expect(rect.height).toBeGreaterThanOrEqual(4)
  })

  it('Given extentより大きく外にはみ出すbounds / Then viewBoxの外に出ない（0以上、幅・高さ以内）', () => {
    const huge: Extent = { west: -50, south: -50, east: 50, north: 50 }
    const rect = projectBoundsToRect(huge, extent, viewBox)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(100)
    expect(rect.y + rect.height).toBeLessThanOrEqual(100)
  })

  it('Given extentから完全に外れたbounds / Then 幅・高さが0になる（無理にはみ出させない）', () => {
    const outside: Extent = { west: 20, south: 20, east: 21, north: 21 }
    const rect = projectBoundsToRect(outside, extent, viewBox)
    expect(rect.width).toBe(0)
    expect(rect.height).toBe(0)
  })
})

describe('機能: ジオメトリをSVGパス文字列にする', () => {
  const identity = (lng: number, lat: number): [number, number] => [lng, lat]

  it('Given 三角形のPolygon / When パスを作る / Then M...L...L...Zの形式になる', () => {
    const geometry: Geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [5, 10],
          [0, 0],
        ],
      ],
    }
    expect(geometryToPath(geometry, identity)).toBe('M0,0 L10,0 L5,10 L0,0Z')
  })

  it('Given 穴（内側のリング）を持つPolygon / When パスを作る / Then 外周と内側の両方がスペース区切りの1つの文字列になる', () => {
    const geometry: Geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3],
        ],
      ],
    }
    const path = geometryToPath(geometry, identity)
    expect(path).toContain('M0,0 L10,0 L10,10 L0,10 L0,0Z')
    expect(path).toContain('M3,3 L7,3 L7,7 L3,7 L3,3Z')
  })

  it('Given MultiPolygon / When パスを作る / Then すべてのポリゴンのリングがつながる', () => {
    const geometry: Geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [5, 6],
            [5, 5],
          ],
        ],
      ],
    }
    const path = geometryToPath(geometry, identity)
    expect(path).toContain('M0,0 L1,0 L0,1 L0,0Z')
    expect(path).toContain('M5,5 L6,5 L5,6 L5,5Z')
  })
})
