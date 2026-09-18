import { PolygonLayer } from '@deck.gl/layers'
import { describe, expect, it } from 'vitest'
import { polygonAreaM2 } from '../lib/geo'
import { simulateGreening } from '../lib/simulation/greening'
import type { GreenedBuilding } from '../store/appStore'
import { createGreeningLayers, toGreeningShapes } from './greening'

const polygon = [
  [
    [139.76, 35.68],
    [139.7611, 35.68],
    [139.7611, 35.6809],
    [139.76, 35.6809],
    [139.76, 35.68],
  ],
]
const building = { id: 'b1', heightM: 40, roofAreaM2: 1000, perimeterM: 130, polygon }
const greened = (roofRatio: number, wallRatio: number): GreenedBuilding => {
  const plan = { roofRatio, wallRatio }
  return { building, plan, result: simulateGreening(building, plan) }
}

describe('機能: 緑化の演出用の形状を作る', () => {
  it('Given 屋上50% / When 形状を作る / Then 屋上の緑は屋根の高さに置かれ、面積は屋根の約半分', () => {
    const [shape] = toGreeningShapes([greened(0.5, 0)])
    expect(shape.roof).not.toBeNull()
    expect(shape.roof!.polygon[0][2]).toBe(40)
    const ratio = polygonAreaM2([shape.roof!.polygon]) / polygonAreaM2(polygon)
    expect(ratio).toBeGreaterThan(0.49)
    expect(ratio).toBeLessThan(0.51)
  })

  it('Given 壁面30% / When 形状を作る / Then 壁面の緑は地上から高さの30%まで伸びる', () => {
    const [shape] = toGreeningShapes([greened(0, 0.3)])
    expect(shape.wall!.heightM).toBeCloseTo(12)
    expect(shape.roof).toBeNull()
  })

  it('Given 屋上0%・壁面0% / When 形状を作る / Then 屋上・壁面とも形状なし', () => {
    const [shape] = toGreeningShapes([greened(0, 0)])
    expect(shape.roof).toBeNull()
    expect(shape.wall).toBeNull()
  })
})

describe('機能: 緑化演出レイヤーを作る', () => {
  it('Given 緑化済み建物 / When レイヤーを作る / Then 屋上と壁面のPolygonLayerを、高さが伸びるアニメーション付きで作る', () => {
    const layers = createGreeningLayers([greened(0.5, 0.3)])
    expect(layers.map((l) => l.id)).toEqual(['greening-roof', 'greening-wall'])
    for (const layer of layers) {
      expect(layer).toBeInstanceOf(PolygonLayer)
      expect(layer.props.extruded).toBe(true)
      expect(layer.props.transitions).toHaveProperty('getElevation')
    }
  })
})
