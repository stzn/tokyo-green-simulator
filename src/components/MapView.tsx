// MapLibreのベースマップの上にdeck.glのcanvasを重ねる。
// interleavedモードは deck.gl 9.4 + MapLibre 5 の組み合わせでピッキングが効かなかったため使わない（2026-09 確認）
import type { Layer, PickingInfo } from '@deck.gl/core'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map, NavigationControl, useControl } from 'react-map-gl/maplibre'
import { BASEMAP_STYLE, INITIAL_VIEW_STATE } from '../config/sources'

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

type Props = {
  layers: Layer[]
  onPick: (info: PickingInfo) => void
}

export function MapView({ layers, onPick }: Props) {
  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={BASEMAP_STYLE}
      maxPitch={75}
      minZoom={10}
      attributionControl={false}
      style={{ position: 'absolute', inset: 0 }}
    >
      <DeckOverlay
        interleaved={false}
        layers={layers}
        onClick={onPick}
        getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
      />
      <NavigationControl position="bottom-right" visualizePitch />
    </Map>
  )
}
