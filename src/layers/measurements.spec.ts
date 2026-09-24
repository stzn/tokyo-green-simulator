import { ScatterplotLayer } from '@deck.gl/layers'
import { describe, expect, it } from 'vitest'
import { parseMeasurementLog } from '../lib/measurementLog'
import { createMeasurementLayers, environmentColor } from './measurements'

const { records } = parseMeasurementLog(
  [
    'timestamp,location,lat,lon,environment',
    '2026-09-24 12:30,紀尾井町緑地,35.679,139.737,Green',
    '2026-09-24 12:40,ビル街,35.68,139.74,Urban',
  ].join('\n'),
)

describe('機能: 計測地点のレイヤーを作る', () => {
  it('Given 計測が2件 / When 作る / Then 点のレイヤーになり、クリックで選択できる', () => {
    const [layer] = createMeasurementLayers({ measurements: records, visible: true, selectedIndex: null, radiusM: 100, terrain: false })
    expect(layer).toBeInstanceOf(ScatterplotLayer)
    expect(layer.id).toBe('measurements')
    expect(layer.props.pickable).toBe(true)
  })

  it('Given 読み込んだ計測 / When 作る / Then その配列をそのまま描く', () => {
    const [layer] = createMeasurementLayers({ measurements: records, visible: true, selectedIndex: null, radiusM: 100, terrain: false })
    expect(layer.props.data).toBe(records)
  })

  it('Given 計測が空 / When 作る / Then レイヤーを作らない（空のまま地形の仕組みに乗せるとdeck.glがエラーを出す）', () => {
    expect(createMeasurementLayers({ measurements: [], visible: true, selectedIndex: null, radiusM: 100, terrain: true })).toEqual([])
  })

  it('Given 点の位置 / When 取り出す / Then 経度・緯度の順', () => {
    const [layer] = createMeasurementLayers({ measurements: records, visible: true, selectedIndex: null, radiusM: 100, terrain: false })
    const getPosition = layer.props.getPosition as unknown as (m: (typeof records)[number]) => number[]
    expect(getPosition(records[0])).toEqual([139.737, 35.679])
  })

  it('Given 環境の種別 / When 色を決める / Then GreenとUrbanと未指定で色が違う', () => {
    const green = environmentColor('Green')
    const urban = environmentColor('Urban')
    const other = environmentColor('')
    expect(green).not.toEqual(urban)
    expect(other).not.toEqual(green)
    expect(other).not.toEqual(urban)
  })

  it('Given 環境の表記ゆれ（小文字・前後の空白） / When 色を決める / Then 同じ色', () => {
    expect(environmentColor(' green ')).toEqual(environmentColor('Green'))
  })

  it('Given 選択中の計測地点 / When 作る / Then 半径の円を別レイヤーで描く（メートル単位・クリック対象外）', () => {
    const layers = createMeasurementLayers({ measurements: records, visible: true, selectedIndex: 1, radiusM: 200, terrain: false })
    expect(layers).toHaveLength(2)
    const circle = layers[1]
    expect(circle.id).toBe('measurement-radius')
    expect(circle.props.radiusUnits).toBe('meters')
    expect(circle.props.getRadius).toBe(200)
    expect(circle.props.pickable).toBe(false)
    expect(circle.props.data).toEqual([records[1]])
  })

  it('Given 選択なし / When 作る / Then 半径の円は描かない', () => {
    expect(createMeasurementLayers({ measurements: records, visible: true, selectedIndex: null, radiusM: 100, terrain: false })).toHaveLength(1)
  })

  it('Given 表示OFF / When 作る / Then 点も円も非表示', () => {
    const layers = createMeasurementLayers({ measurements: records, visible: false, selectedIndex: 0, radiusM: 100, terrain: false })
    expect(layers.every((l) => l.props.visible === false)).toBe(true)
  })
})
