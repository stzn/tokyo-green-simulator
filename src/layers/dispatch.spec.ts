import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { describe, expect, it } from 'vitest'
import { demandClass, type ComfortMarker, type DemandMarker, type PodMarker } from '../lib/dispatch'
import { interventionColor, type ZoneCell } from '../lib/jitai'
import { actionColor, createDispatchLayers } from './dispatch'

const pod = (podId: string, action: PodMarker['action'], slot = 0): PodMarker => ({
  podId,
  spotId: 'OTM-001',
  spotName: '仲通り',
  lon: 139.7652,
  lat: 35.6872,
  action,
  plantHealth: 95,
  slot,
})
const comfort: ComfortMarker = { spotId: 'OTM-001', spotName: '仲通り', lon: 139.7652, lat: 35.6872, petC: 38.5, podsPresent: 1 }

const layersOf = (pods: PodMarker[], comforts: ComfortMarker[] = [comfort]) =>
  createDispatchLayers({ snapshot: { pods, comfort: comforts }, visible: true, terrain: false })

describe('機能: 配車のレイヤーを作る', () => {
  it('Given ポッドと快適度 / When 作る / Then 快適度の円の上にポッドの点を重ねる', () => {
    const layers = layersOf([pod('P1', 'stay')])
    expect(layers.map((l) => l.id)).toEqual(['dispatch-comfort', 'dispatch-pods'])
    expect(layers.every((l) => l instanceof ScatterplotLayer)).toBe(true)
  })

  it('Given 建物の敷地に重なる地点 / When 作る / Then 屋根に隠れないよう深度を比べずに描く', () => {
    for (const layer of layersOf([pod('P1', 'stay')])) expect(layer.props.parameters).toMatchObject({ depthCompare: 'always' })
  })

  it('Given 表示データが空 / When 作る / Then レイヤーを作らない（空のまま地形の仕組みに乗せるとdeck.glがエラーを出す）', () => {
    expect(layersOf([], [])).toEqual([])
  })

  it('Given ポッドだけ / When 作る / Then ポッドのレイヤーだけ作る', () => {
    expect(layersOf([pod('P1', 'stay')], []).map((l) => l.id)).toEqual(['dispatch-pods'])
  })

  it('Given 行動 / When 色を決める / Then 滞在・移動・散水で色が違う', () => {
    const colors = [actionColor('stay'), actionColor('move'), actionColor('irrigate')].map(String)
    expect(new Set(colors).size).toBe(3)
  })

  it('Given ポッド / When 塗る / Then 行動の色で塗る', () => {
    const [, pods] = layersOf([pod('P1', 'irrigate')])
    const getFillColor = pods.props.getFillColor as unknown as (p: PodMarker) => number[]
    expect(getFillColor(pod('P1', 'irrigate'))).toEqual(actionColor('irrigate'))
  })

  it('Given 同じ地点の 2 台目（slot 1） / When 位置を出す / Then 1 台目と重ならないようずらす', () => {
    const pods = layersOf([pod('P1', 'stay', 0), pod('P2', 'stay', 1)])[1] as ScatterplotLayer<PodMarker>
    const getPosition = pods.props.getPosition as unknown as (p: PodMarker) => number[]
    expect(getPosition(pod('P1', 'stay', 0))).toEqual([139.7652, 35.6872])
    expect(getPosition(pod('P2', 'stay', 1))).not.toEqual([139.7652, 35.6872])
  })

  it('Given 快適度 / When 作る / Then 地点の広がりとしてメートル単位の円で描き、PET の区分の色で塗る', () => {
    const comfortLayer = layersOf([pod('P1', 'stay')])[0] as ScatterplotLayer<ComfortMarker>
    expect(comfortLayer.props.radiusUnits).toBe('meters')
    const getFillColor = comfortLayer.props.getFillColor as unknown as (c: ComfortMarker) => number[]
    const hot = getFillColor(comfort)
    const comfortable = getFillColor({ ...comfort, petC: 21 })
    expect(hot).not.toEqual(comfortable)
  })
  it('Given JITAI の区画 / When 作る / Then 地点とポッドの下に、介入率の色で区画を塗る', () => {
    const zone: ZoneCell = {
      zone: [1, 2],
      hour: 11,
      decisions: 5,
      interventions: 2,
      skipped_calendar: 1,
      skipped_pods: 2,
      skipped_pet: 0,
      rate: 0.4,
      polygon: [
        [139.76, 35.68],
        [139.764, 35.68],
        [139.764, 35.684],
        [139.76, 35.684],
        [139.76, 35.68],
      ],
    }
    const layers = createDispatchLayers({ snapshot: { pods: [pod('P1', 'stay')], comfort: [comfort] }, zones: [zone], visible: true, terrain: false })
    expect(layers.map((l) => l.id)).toEqual(['jitai-zones', 'dispatch-comfort', 'dispatch-pods'])
    const zonesLayer = layers[0] as PolygonLayer<ZoneCell>
    expect(zonesLayer).toBeInstanceOf(PolygonLayer)
    const getFillColor = zonesLayer.props.getFillColor as unknown as (z: ZoneCell) => number[]
    expect(getFillColor(zone)).toEqual(interventionColor(0.4))
  })

  it('Given 配車が無く JITAI の区画だけ / When 作る / Then 区画のレイヤーだけ作る', () => {
    expect(createDispatchLayers({ snapshot: null, zones: [], visible: true, terrain: false })).toEqual([])
  })
})

describe('機能: 地点の色を需要にする', () => {
  const demand: DemandMarker[] = [
    { spotId: 'OTM-001', spotName: '仲通り', lon: 139.7652, lat: 35.6872, weight: 1.2, share: 0.9 },
    { spotId: 'OTM-003', spotName: '和田倉', lon: 139.7612, lat: 35.6842, weight: 0, share: 0 },
  ]
  const build = (spotColor: 'pet' | 'demand') =>
    createDispatchLayers({ snapshot: { pods: [pod('P1', 'stay')], comfort: [comfort] }, demand, spotColor, visible: true, terrain: false })

  it('Given 地点の色が需要 / When 作る / Then PET の円の代わりに需要の円を作り、ポッドをその上に重ねる', () => {
    const layers = build('demand')
    expect(layers.map((l) => l.id)).toEqual(['dispatch-demand', 'dispatch-pods'])
    const circles = layers[0] as ScatterplotLayer<DemandMarker>
    const fill = circles.props.getFillColor as unknown as (m: DemandMarker) => number[]
    expect(fill(demand[0])).toEqual(demandClass(0.9).color)
    // 重みの無い地点は「無し」（灰）の色で描く
    expect(fill(demand[1])).toEqual(demandClass(0).color)
    expect(circles.props.parameters).toMatchObject({ depthCompare: 'always' })
  })

  it('Given 地点の色が PET / When 作る / Then 今までどおり PET の円を作る', () => {
    expect(build('pet').map((l) => l.id)).toEqual(['dispatch-comfort', 'dispatch-pods'])
  })
})
