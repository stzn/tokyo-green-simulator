// 配車（dispatch.json）のレイヤー。地点の PET を快適度の色の円で、その上にポッドを行動ごとの色の点で描く
// deck.gl 9.4では実験扱いのため _TerrainExtension という名前でエクスポートされている
import { _TerrainExtension as TerrainExtension, type TerrainExtensionProps } from '@deck.gl/extensions'
import { ScatterplotLayer } from '@deck.gl/layers'
import { petCategory, POD_ACTIONS, type ComfortMarker, type DispatchSnapshot, type PodAction, type PodMarker } from '../lib/dispatch'

type Color = [number, number, number, number]

const ACTION_COLORS = new Map(POD_ACTIONS.map((a) => [a.action, a.color]))

export function actionColor(action: PodAction): Color {
  return ACTION_COLORS.get(action) ?? [255, 255, 255, 255]
}

/** 同じ地点に複数台いるとき、2 台目以降を東へずらす幅（度）。約 9 m で、地点の円（半径 25 m）の内側に収まる */
const SLOT_OFFSET_DEG = 0.0001
/** 地点の快適度を描く円の半径（m） */
const COMFORT_RADIUS_M = 25

const terrainExtension = new TerrainExtension()

// 地点が建物の敷地に重なっていても屋根に隠れないよう、深度を比べずに常に手前へ描く
const ALWAYS_ON_TOP = { depthCompare: 'always' } as const

type Options = {
  snapshot: DispatchSnapshot
  visible: boolean
  terrain: boolean
}

export function createDispatchLayers({ snapshot, visible, terrain }: Options) {
  const extensions = terrain ? [terrainExtension] : []
  const layers = []
  // データが無いレイヤーは作らない（空のまま地形の仕組みに乗せると、初回描画でdeck.glがエラーを出す）
  if (snapshot.comfort.length > 0) {
    layers.push(
      new ScatterplotLayer<ComfortMarker, TerrainExtensionProps>({
        id: 'dispatch-comfort',
        data: snapshot.comfort,
        visible,
        pickable: false,
        getPosition: (c) => [c.lon, c.lat],
        getFillColor: (c) => petCategory(c.petC).color,
        getLineColor: [15, 23, 42, 200],
        radiusUnits: 'meters',
        getRadius: COMFORT_RADIUS_M,
        // ズームアウトしても見失わない大きさは保つ
        radiusMinPixels: 6,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        extensions,
        terrainDrawMode: 'offset',
        parameters: ALWAYS_ON_TOP,
      }),
    )
  }
  if (snapshot.pods.length > 0) {
    layers.push(
      new ScatterplotLayer<PodMarker, TerrainExtensionProps>({
        id: 'dispatch-pods',
        data: snapshot.pods,
        visible,
        pickable: false,
        getPosition: (p) => [p.lon + p.slot * SLOT_OFFSET_DEG, p.lat],
        getFillColor: (p) => actionColor(p.action),
        getLineColor: [255, 255, 255, 255],
        radiusUnits: 'pixels',
        getRadius: 7,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        extensions,
        terrainDrawMode: 'offset',
        parameters: ALWAYS_ON_TOP,
      }),
    )
  }
  return layers
}
