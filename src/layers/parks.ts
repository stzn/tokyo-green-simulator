// 公園ポリゴンのレイヤー（OSM由来。public/data/parks.geojson）
// deck.gl 9.4では実験扱いのため _TerrainExtension という名前でエクスポートされている
import { _TerrainExtension as TerrainExtension, type TerrainExtensionProps } from '@deck.gl/extensions'
import { GeoJsonLayer } from '@deck.gl/layers'
import type { ParkFeature } from '../data/parks'
import type { ParkInfo } from '../store/appStore'

type ParkFeatureLike = { properties: ParkInfo }

export const parkFromFeature = (f: ParkFeatureLike): ParkInfo => ({ ...f.properties })

// 地形の標高ぶん持ち上げる（drapeではなくoffset。公園は小さめのポリゴンで、地面に貼るより浮かせたほうが見やすい）
const terrainExtension = new TerrainExtension()

type Options = { features: ParkFeature[]; visible: boolean; selectedId: string | null; terrain: boolean }

export function createParksLayer({ features, visible, selectedId, terrain }: Options) {
  return new GeoJsonLayer<ParkInfo, TerrainExtensionProps>({
    id: 'parks',
    data: features,
    visible,
    filled: true,
    stroked: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [134, 239, 172, 90],
    getFillColor: (f: ParkFeatureLike) => (f.properties.id === selectedId ? [52, 211, 153, 190] : [16, 185, 129, 95]),
    getLineColor: [110, 231, 183, 200],
    lineWidthMinPixels: 1,
    extensions: terrain ? [terrainExtension] : [],
    terrainDrawMode: 'offset',
    updateTriggers: { getFillColor: [selectedId] },
  })
}
