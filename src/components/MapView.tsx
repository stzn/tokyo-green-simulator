// deck.glのレイヤーをMapLibreのレンダリングに挿し込む（interleaved）。
// 地形（TerrainExtension）はdeck.glのcanvasを重ねるだけのオーバーレイ方式では効かず、
// 建物や街路樹が地形に乗らないため、interleavedにしている。
// 以前はこの組み合わせでピッキングが効かず見送っていたが、deck.gl 9.4 + MapLibre 5 の現行版では動く（2026-09 再確認）
import type { Layer, PickingInfo } from '@deck.gl/core'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Map, NavigationControl, useControl } from 'react-map-gl/maplibre'
import { BASEMAP_STYLE, INITIAL_VIEW_STATE } from '../config/sources'
import type { Extent } from '../lib/projection'

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

const boundsOf = (map: MapLibreMap): Extent => {
  const b = map.getBounds()
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
}

/**
 * OpenFreeMapのdarkスタイルは地名ラベルがほぼ全レイヤーで薄いグレー（rgb(101,101,101)相当）＋黒フチになっており、
 * このアプリの真っ黒に近い背景や緑のポリゴンの上では読みにくい。アプリの配色（bg-slate-950 / text-slate-200相当）に
 * 合わせて明るくする。BASEMAP_STYLEを別のスタイルに変える場合はこの処理も見直すこと
 */
function brightenBasemapLabels(map: MapLibreMap): void {
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
      map.setPaintProperty(layer.id, 'text-color', '#e2e8f0')
      map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(2,6,23,0.9)')
      map.setPaintProperty(layer.id, 'text-halo-width', 1.4)
      map.setPaintProperty(layer.id, 'text-halo-blur', 0)
    }
  }
}

/**
 * 地形はdeck.gl側（layers/terrain.ts + TerrainExtension）だけで扱う。
 * MapLibreのsetTerrainでベースマップ自体も起伏させようとすると、ベースマップもdeck.glのレイヤーも
 * 描画されなくなる（deck.gl 9.4 + MapLibre 5 で確認）。地面の起伏はdeck.glの地形メッシュで見せる
 */

type Props = {
  layers: Layer[]
  /**
   * deck.glのレイヤーをMapLibreのレンダリングに挿し込むか（挿し込まないときは地図の上にcanvasを重ねる）。
   * 地形に乗せるにはinterleavedが要るが、画面上で集計するヒートマップはinterleavedでは描けないため切り替える
   */
  interleaved: boolean
  onPick: (info: PickingInfo) => void
  /** 現在の表示範囲が変わるたびに呼ばれる（現在地ミニマップ用） */
  onViewportChange?: (bounds: Extent) => void
}

export function MapView({ layers, interleaved, onPick, onViewportChange }: Props) {
  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={BASEMAP_STYLE}
      maxPitch={75}
      minZoom={10}
      attributionControl={false}
      style={{ position: 'absolute', inset: 0 }}
      onLoad={(evt) => {
        brightenBasemapLabels(evt.target)
        onViewportChange?.(boundsOf(evt.target))
      }}
      onMove={(evt) => onViewportChange?.(boundsOf(evt.target))}
    >
      <DeckOverlay
        // 方式を変えるにはオーバーレイを作り直す必要がある
        key={interleaved ? 'interleaved' : 'overlay'}
        interleaved={interleaved}
        layers={layers}
        onClick={onPick}
        getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
      />
      <NavigationControl position="bottom-right" visualizePitch />
    </Map>
  )
}
