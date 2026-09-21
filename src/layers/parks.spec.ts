// deck.gl 9.4では実験扱いのため _TerrainExtension という名前でエクスポートされている
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions'
import { GeoJsonLayer } from '@deck.gl/layers'
import { describe, expect, it } from 'vitest'
import type { ParkFeature } from '../data/parks'
import { createParksLayer, parkFromFeature } from './parks'

const properties = { id: 'way/1', name: '日比谷公園', ward: '千代田区', areaM2: 161600, manager: '東京都', managerEstimated: true }

const features: ParkFeature[] = [
  {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[139.75, 35.67], [139.76, 35.67], [139.76, 35.68], [139.75, 35.67]]] },
    properties,
  },
]

describe('機能: 公園レイヤーを作る', () => {
  it('Given 表示ON / When 作る / Then 公園GeoJSONを塗りつぶし表示し、クリックで選択できる', () => {
    const layer = createParksLayer({ features, visible: true, selectedId: null, terrain: false })
    expect(layer).toBeInstanceOf(GeoJsonLayer)
    expect(layer.props.pickable).toBe(true)
    expect(layer.props.filled).toBe(true)
  })

  it('Given 読み込んだ公園データ / When 作る / Then その配列をそのまま描く（URLを渡して二重に取得しない）', () => {
    const layer = createParksLayer({ features, visible: true, selectedId: null, terrain: false })
    expect(layer.props.data).toBe(features)
  })

  it('Given 選択中の公園 / When 色を決める / Then 選択中の公園は明るく塗る', () => {
    const layer = createParksLayer({ features, visible: true, selectedId: 'way/1', terrain: false })
    const getColor = layer.props.getFillColor as unknown as (f: { properties: typeof properties }) => number[]
    const selected = getColor({ properties })
    const other = getColor({ properties: { ...properties, id: 'way/2' } })
    expect(selected[3]).toBeGreaterThan(other[3])
  })
})

describe('機能: 公園の地物から詳細情報を取り出す', () => {
  it('Given 公園の地物 / When 取り出す / Then サイドバー用の情報になる', () => {
    expect(parkFromFeature({ properties })).toEqual(properties)
  })
})

describe('機能: 公園を地形に乗せる', () => {
  it('Given 地形あり / When レイヤーを作る / Then 標高ぶん持ち上げる拡張が付く', () => {
    const layer = createParksLayer({ features, visible: true, selectedId: null, terrain: true })
    expect(layer.props.extensions.some((e) => e instanceof TerrainExtension)).toBe(true)
    expect(layer.props.terrainDrawMode).toBe('offset')
  })

  it('Given 地形なし / When レイヤーを作る / Then 拡張を付けない', () => {
    const layer = createParksLayer({ features, visible: true, selectedId: null, terrain: false })
    expect(layer.props.extensions.some((e) => e instanceof TerrainExtension)).toBe(false)
  })
})
