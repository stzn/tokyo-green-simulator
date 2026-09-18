import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { ColumnLayer } from '@deck.gl/layers'
import { describe, expect, it } from 'vitest'
import { buildTreeMask, toTreeData } from '../data/trees'
import { createTreeLayers, speciesColor } from './trees'

const data = toTreeData({
  count: 3,
  positions: [139.75, 35.68, 139.76, 35.69, 139.7, 35.7],
  height: [12, 8, 6],
  spread: [5, 4, 3],
  girth: [150, 90, 60],
  isTall: [1, 1, 1],
  speciesIdx: [0, 1, 0],
  wardIdx: [0, 0, 1],
  routeIdx: [0, 0, 0],
  dict: { species: ['イチョウ', 'サクラ'], wards: ['千代田区', '新宿区'], routes: ['内堀通り'] },
})

describe('機能: 街路樹レイヤーを作る', () => {
  it('Given 3Dピラー表示 / When 作る / Then ColumnLayerで高さ=樹高、GPUフィルタ付きで描く', () => {
    const [layer] = createTreeLayers({ data, mask: buildTreeMask(data, [], null), mode: 'columns', visible: true })
    expect(layer).toBeInstanceOf(ColumnLayer)
    expect(layer.props.pickable).toBe(true)
    expect((layer.props as { extruded?: boolean }).extruded).toBe(true)
    expect((layer.props as { filterRange?: number[] }).filterRange).toEqual([1, 1])
    const attrs = (layer.props.data as { attributes: Record<string, { value: ArrayLike<number> }> }).attributes
    expect(Array.from(attrs.getElevation.value)).toEqual([12, 8, 6])
    expect(Array.from(attrs.getFilterValue.value)).toEqual([1, 1, 1])
  })

  it('Given イチョウで絞り込み / When 3Dピラーを作る / Then マスクがフィルタ値として渡る', () => {
    const [layer] = createTreeLayers({ data, mask: buildTreeMask(data, ['イチョウ'], null), mode: 'columns', visible: true })
    const attrs = (layer.props.data as { attributes: Record<string, { value: ArrayLike<number> }> }).attributes
    expect(Array.from(attrs.getFilterValue.value)).toEqual([1, 0, 1])
  })

  it('Given ヒートマップ表示 / When 作る / Then HeatmapLayerで、絞り込み後の本数だけを集計する', () => {
    const [layer] = createTreeLayers({ data, mask: buildTreeMask(data, ['イチョウ'], null), mode: 'heatmap', visible: true })
    expect(layer).toBeInstanceOf(HeatmapLayer)
    expect((layer.props.data as ArrayLike<number>).length).toBe(2)
  })

  it('Given 非表示 / When 作る / Then visible=false', () => {
    const [layer] = createTreeLayers({ data, mask: buildTreeMask(data, [], null), mode: 'columns', visible: false })
    expect(layer.props.visible).toBe(false)
  })
})

describe('機能: 樹種ごとの色', () => {
  it('Given 代表樹種 / When 色を決める / Then イチョウは黄、サクラはピンク系', () => {
    const [r, g, b] = speciesColor('イチョウ')
    expect(r).toBeGreaterThan(200)
    expect(g).toBeGreaterThan(150)
    expect(b).toBeLessThan(100)
    const [sr, , sb] = speciesColor('サクラ')
    expect(sr).toBeGreaterThan(200)
    expect(sb).toBeGreaterThan(150)
  })

  it('Given その他の樹種 / When 色を決める / Then 既定の緑', () => {
    const [r, g, b] = speciesColor('モッコク')
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })
})
