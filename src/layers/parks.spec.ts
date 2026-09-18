import { GeoJsonLayer } from '@deck.gl/layers'
import { describe, expect, it } from 'vitest'
import { createParksLayer, parkFromFeature } from './parks'

const properties = { id: 'way/1', name: '日比谷公園', ward: '千代田区', areaM2: 161600, manager: '東京都', managerEstimated: true }

describe('機能: 公園レイヤーを作る', () => {
  it('Given 表示ON / When 作る / Then 公園GeoJSONを塗りつぶし表示し、クリックで選択できる', () => {
    const layer = createParksLayer({ visible: true, selectedId: null })
    expect(layer).toBeInstanceOf(GeoJsonLayer)
    expect(layer.props.pickable).toBe(true)
    expect(layer.props.filled).toBe(true)
  })

  it('Given 選択中の公園 / When 色を決める / Then 選択中の公園は明るく塗る', () => {
    const layer = createParksLayer({ visible: true, selectedId: 'way/1' })
    const getColor = layer.props.getFillColor as (f: { properties: typeof properties }) => number[]
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
