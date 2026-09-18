// 公園ポリゴンのレイヤー（OSM由来。public/data/parks.geojson）
import { GeoJsonLayer } from '@deck.gl/layers'
import type { ParkInfo } from '../store/appStore'

export const PARKS_URL = `${import.meta.env.BASE_URL}data/parks.geojson`

type ParkFeatureLike = { properties: ParkInfo }

export const parkFromFeature = (f: ParkFeatureLike): ParkInfo => ({ ...f.properties })

type Options = { visible: boolean; selectedId: string | null }

export function createParksLayer({ visible, selectedId }: Options) {
  return new GeoJsonLayer({
    id: 'parks',
    data: PARKS_URL,
    visible,
    filled: true,
    stroked: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [134, 239, 172, 90],
    getFillColor: (f: ParkFeatureLike) => (f.properties.id === selectedId ? [52, 211, 153, 190] : [16, 185, 129, 95]),
    getLineColor: [110, 231, 183, 200],
    lineWidthMinPixels: 1,
    updateTriggers: { getFillColor: [selectedId] },
  })
}
