// 街路樹レイヤー（3Dピラー / ヒートマップ）
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import { ColumnLayer } from '@deck.gl/layers'
import type { TreeMode } from '../store/appStore'
import type { TreeData } from '../data/trees'

type RGB = [number, number, number]

/** 代表樹種の色（凡例と共有する） */
export const SPECIES_COLORS: Record<string, RGB> = {
  イチョウ: [250, 204, 21],
  サクラ: [244, 164, 214],
  ソメイヨシノ: [244, 164, 214],
  ハナミズキ: [251, 113, 133],
  スズカケノキ: [45, 212, 191],
  ケヤキ: [132, 204, 22],
  クスノキ: [34, 197, 94],
  トウカエデ: [251, 146, 60],
}
export const DEFAULT_TREE_COLOR: RGB = [74, 222, 128]

export const speciesColor = (species: string): RGB => SPECIES_COLORS[species] ?? DEFAULT_TREE_COLOR

// 樹種idx → 色 の対応をインスタンスごとの色配列に展開（データごとに1回だけ計算）
const colorCache = new WeakMap<TreeData, Uint8Array>()
function colorsOf(data: TreeData): Uint8Array {
  let colors = colorCache.get(data)
  if (!colors) {
    const palette = data.dict.species.map(speciesColor)
    colors = new Uint8Array(data.count * 3)
    for (let i = 0; i < data.count; i++) colors.set(palette[data.speciesIdx[i]], i * 3)
    colorCache.set(data, colors)
  }
  return colors
}

const filterExtension = new DataFilterExtension({ filterSize: 1 })

type Options = { data: TreeData; mask: Float32Array; mode: TreeMode; visible: boolean }

export function createTreeLayers({ data, mask, mode, visible }: Options) {
  if (mode === 'heatmap') {
    // HeatmapLayerはGPUフィルタに対応しないため、絞り込み後のインデックスを渡す
    const indices: number[] = []
    for (let i = 0; i < data.count; i++) if (mask[i] === 1) indices.push(i)
    return [
      new HeatmapLayer<number>({
        id: 'trees-heatmap',
        data: indices,
        visible,
        getPosition: (i) => [data.positions[i * 2], data.positions[i * 2 + 1]],
        getWeight: (i) => data.height[i],
        radiusPixels: 40,
        intensity: 1.2,
        threshold: 0.03,
        colorRange: [
          [20, 83, 45],
          [22, 101, 52],
          [21, 128, 61],
          [34, 197, 94],
          [134, 239, 172],
          [240, 253, 244],
        ],
      }),
    ]
  }

  return [
    new ColumnLayer({
      id: 'trees-columns',
      // 型付き配列をそのままGPUへ渡す（14万本でもJSオブジェクトを作らない）
      data: {
        length: data.count,
        attributes: {
          getPosition: { value: data.positions, size: 2 },
          getElevation: { value: data.height, size: 1 },
          getFillColor: { value: colorsOf(data), size: 3, normalized: true },
          getFilterValue: { value: mask, size: 1 },
        },
      },
      visible,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 200],
      extruded: true,
      diskResolution: 8,
      radius: 2.5,
      elevationScale: 1,
      extensions: [filterExtension],
      filterRange: [1, 1],
    }),
  ]
}
