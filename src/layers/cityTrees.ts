// 区道の街路樹レイヤー（路線単位の線）。
// 区市町村道は単木の位置が公開されていないため、本数から点を並べて単木のように見せることはしない
// TerrainExtensionはdeck.gl 9.4では実験扱いのため _TerrainExtension という名前でエクスポートされている
import { _TerrainExtension as TerrainExtension, type TerrainExtensionProps } from '@deck.gl/extensions'
import { PathLayer } from '@deck.gl/layers'
import type { CityTreePath } from '../data/cityTrees'
import { speciesColor } from './trees'

// 地形の標高ぶん線を持ち上げる。地形を出していないときは付けない（付けたままだとヒートマップが描画されない）
const terrainExtension = new TerrainExtension()

/** 本数が公開されていない路線の太さ（m）。多いように見せないため最小にする */
const UNKNOWN_WIDTH_M = 3
const MAX_WIDTH_M = 18
/** 本数→太さ。1本あたりの差が出すぎないよう平方根で効かせる */
const widthOf = (count: number | null) => (count === null ? UNKNOWN_WIDTH_M : Math.min(UNKNOWN_WIDTH_M + Math.sqrt(count), MAX_WIDTH_M))

const SELECTED_ALPHA = 255
const DEFAULT_ALPHA = 170

type Options = {
  paths: CityTreePath[]
  visible: boolean
  /** 選択中の路線名 */
  selectedRoute: string | null
  terrain: boolean
}

export function createCityTreesLayer({ paths, visible, selectedRoute, terrain }: Options) {
  return new PathLayer<CityTreePath, TerrainExtensionProps>({
    id: 'city-trees',
    data: paths,
    visible,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 200],
    widthUnits: 'meters',
    widthMinPixels: 2.5,
    widthMaxPixels: 14,
    capRounded: true,
    jointRounded: true,
    // Positionは[lon, lat]の配列。PathLayerのPathGeometryとして扱う
    getPath: (p) => p.path as [number, number][],
    // 線の色は先頭の樹種。都道の単木（trees.ts）と配色を揃える
    getColor: (p) => {
      const [r, g, b] = speciesColor(p.route.species[0])
      return [r, g, b, p.route.route === selectedRoute ? SELECTED_ALPHA : DEFAULT_ALPHA]
    },
    getWidth: (p) => widthOf(p.route.count),
    extensions: terrain ? [terrainExtension] : [],
    terrainDrawMode: 'offset',
    updateTriggers: { getColor: [selectedRoute] },
  })
}
