import { MVTLayer } from '@deck.gl/geo-layers'
import { describe, expect, it } from 'vitest'
import { BUILDING_COLORS, buildingFromFeature, createBuildingsLayer, type BuildingFeature } from './buildings'

const feature: BuildingFeature = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [139.76, 35.68],
        [139.7611, 35.68],
        [139.7611, 35.6809],
        [139.76, 35.6809],
        [139.76, 35.68],
      ],
    ],
  },
  properties: { 建物ID: '13101-bldg-1141', measuredHeight: 8.2, buildingRoofEdgeArea: 2043.13 },
}

describe('機能: PLATEAUの建物地物から建物情報を作る', () => {
  it('Given 建物ID・高さ・屋根面積のある地物 / When 変換する / Then それらをそのまま使い、外周長はポリゴンから求める', () => {
    const b = buildingFromFeature(feature)!
    expect(b).toMatchObject({ id: '13101-bldg-1141', heightM: 8.2, roofAreaM2: 2043.13 })
    expect(b.perimeterM).toBeGreaterThan(390)
    expect(b.perimeterM).toBeLessThan(405)
    expect(b.polygon).toEqual(feature.geometry.coordinates)
  })

  it('Given 屋根面積が無い（0） / When 変換する / Then フットプリントの面積で代用する', () => {
    const b = buildingFromFeature({ ...feature, properties: { ...feature.properties, buildingRoofEdgeArea: 0 } })!
    expect(b.roofAreaM2).toBeGreaterThan(9800)
    expect(b.roofAreaM2).toBeLessThan(10100)
  })

  it('Given 高さが0（未計測） / When 変換する / Then 既定の高さ3mとして扱う', () => {
    expect(buildingFromFeature({ ...feature, properties: { ...feature.properties, measuredHeight: 0 } })!.heightM).toBe(3)
  })

  it('Given MultiPolygonの地物 / When 変換する / Then 最大のポリゴンを使う', () => {
    const small = [
      [
        [139.7, 35.6],
        [139.7001, 35.6],
        [139.7001, 35.6001],
        [139.7, 35.6],
      ],
    ]
    const b = buildingFromFeature({ ...feature, geometry: { type: 'MultiPolygon', coordinates: [small, feature.geometry.coordinates as number[][][]] } })!
    expect(b.polygon).toEqual(feature.geometry.coordinates)
  })

  it('Given 建物IDが無い / When 変換する / Then null', () => {
    expect(buildingFromFeature({ ...feature, properties: { measuredHeight: 10 } })).toBeNull()
  })
})

describe('機能: 建物レイヤーを作る', () => {
  it('Given 表示ON / When 作る / Then PLATEAUのMVTを押し出し表示し、クリックで選択できる', () => {
    const layer = createBuildingsLayer({ visible: true, selectedId: null, greenedIds: new Set() })
    expect(layer).toBeInstanceOf(MVTLayer)
    expect(layer.props.visible).toBe(true)
    expect(layer.props.extruded).toBe(true)
    expect(layer.props.pickable).toBe(true)
  })

  it('Given 選択中・緑化済みの建物 / When 色を決める / Then 選択色・緑化色・通常色で塗り分ける', () => {
    const layer = createBuildingsLayer({ visible: true, selectedId: 'a', greenedIds: new Set(['b']) })
    const getColor = layer.props.getFillColor as unknown as (f: BuildingFeature) => number[]
    const withId = (id: string) => ({ ...feature, properties: { ...feature.properties, 建物ID: id } })
    expect(getColor(withId('a'))).toEqual(BUILDING_COLORS.selected)
    expect(getColor(withId('b'))).toEqual(BUILDING_COLORS.greened)
    expect(getColor(withId('c'))).toEqual(BUILDING_COLORS.default)
  })

  it('Given 選択中かつ緑化済みの建物 / When 色を決める / Then 緑化の結果が見えるよう緑化色を優先する', () => {
    const layer = createBuildingsLayer({ visible: true, selectedId: 'a', greenedIds: new Set(['a']) })
    const getColor = layer.props.getFillColor as unknown as (f: BuildingFeature) => number[]
    expect(getColor({ ...feature, properties: { ...feature.properties, 建物ID: 'a' } })).toEqual(BUILDING_COLORS.greened)
  })

  it('Given 高さ属性 / When 押し出し高さを決める / Then measuredHeightを使う', () => {
    const layer = createBuildingsLayer({ visible: true, selectedId: null, greenedIds: new Set() })
    expect((layer.props.getElevation as unknown as (f: BuildingFeature) => number)(feature)).toBe(8.2)
  })
})
