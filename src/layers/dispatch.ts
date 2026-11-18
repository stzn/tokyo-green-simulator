// 配車（dispatch.json）のレイヤー。地点の PET（または需要）を区分の色の円で、その上にポッドを行動ごとの色の点で描く
// deck.gl 9.4では実験扱いのため _TerrainExtension という名前でエクスポートされている
import { _TerrainExtension as TerrainExtension, type TerrainExtensionProps } from '@deck.gl/extensions'
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import {
  demandClass,
  petCategory,
  POD_ACTIONS,
  type ComfortMarker,
  type DemandMarker,
  type DispatchSnapshot,
  type PodAction,
  type PodMarker,
} from '../lib/dispatch'
import { interventionColor, zoneDiffColor, type ZoneCell, type ZoneDiff } from '../lib/jitai'

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
  snapshot: DispatchSnapshot | null
  /** JITAI の集計の、選んだ時刻の区画（無ければ空） */
  zones?: ZoneCell[]
  /** 選んだ時刻の全地点の需要（地点の色が需要のときに使う） */
  demand?: DemandMarker[]
  /** 地点の円を何で塗るか（既定は PET） */
  spotColor?: 'pet' | 'demand'
  /** 方式の比較中の、選んだ時刻の区画の件数の差（あれば zones の代わりに塗る） */
  zoneDiffs?: ZoneDiff[]
  /** 方式の比較中の、比較側のポッド（塗りの無い輪で描く） */
  comparisonPods?: PodMarker[]
  visible: boolean
  terrain: boolean
}

export function createDispatchLayers({
  snapshot,
  zones = [],
  demand = [],
  spotColor = 'pet',
  zoneDiffs = [],
  comparisonPods = [],
  visible,
  terrain,
}: Options) {
  const extensions = terrain ? [terrainExtension] : []
  const layers = []
  // 区画は地点・ポッドの下に塗る。比較中は件数の差の色、そうでなければ介入率の色
  if (zoneDiffs.length > 0) {
    layers.push(
      new PolygonLayer<ZoneDiff, TerrainExtensionProps>({
        id: 'jitai-zone-diff',
        data: zoneDiffs,
        visible,
        pickable: false,
        getPolygon: (z) => z.polygon,
        getFillColor: (z) => zoneDiffColor(z.diff),
        getLineColor: [226, 232, 240, 160],
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        extensions,
        terrainDrawMode: 'drape',
      }),
    )
  } else if (zones.length > 0) {
    layers.push(
      new PolygonLayer<ZoneCell, TerrainExtensionProps>({
        id: 'jitai-zones',
        data: zones,
        visible,
        pickable: false,
        getPolygon: (z) => z.polygon,
        getFillColor: (z) => interventionColor(z.rate),
        getLineColor: [226, 232, 240, 160],
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        extensions,
        terrainDrawMode: 'drape',
      }),
    )
  }
  if (!snapshot) return layers
  // データが無いレイヤーは作らない（空のまま地形の仕組みに乗せると、初回描画でdeck.glがエラーを出す）
  // 地点の円は、PET か需要のどちらかで塗る（2 重にすると密な地点で読めない）
  const spotCircle = {
    visible,
    pickable: false,
    getLineColor: [15, 23, 42, 200] as Color,
    radiusUnits: 'meters' as const,
    getRadius: COMFORT_RADIUS_M,
    // ズームアウトしても見失わない大きさは保つ
    radiusMinPixels: 6,
    stroked: true,
    lineWidthUnits: 'pixels' as const,
    getLineWidth: 1,
    extensions,
    terrainDrawMode: 'offset' as const,
    parameters: ALWAYS_ON_TOP,
  }
  if (spotColor === 'demand') {
    if (demand.length > 0) {
      layers.push(
        new ScatterplotLayer<DemandMarker, TerrainExtensionProps>({
          ...spotCircle,
          id: 'dispatch-demand',
          data: demand,
          getPosition: (d) => [d.lon, d.lat],
          getFillColor: (d) => demandClass(d.share).color,
        }),
      )
    }
  } else if (snapshot.comfort.length > 0) {
    layers.push(
      new ScatterplotLayer<ComfortMarker, TerrainExtensionProps>({
        ...spotCircle,
        id: 'dispatch-comfort',
        data: snapshot.comfort,
        getPosition: (c) => [c.lon, c.lat],
        getFillColor: (c) => petCategory(c.petC).color,
      }),
    )
  }
  // 比較側のポッドは白い輪だけで、主の点より下に、少し西へずらして描く（同じ地点にいても両方見える）
  if (comparisonPods.length > 0) {
    layers.push(
      new ScatterplotLayer<PodMarker, TerrainExtensionProps>({
        id: 'dispatch-pods-compare',
        data: comparisonPods,
        visible,
        pickable: false,
        getPosition: (p) => [p.lon - (p.slot + 1) * SLOT_OFFSET_DEG, p.lat],
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        radiusUnits: 'pixels',
        getRadius: 7,
        lineWidthUnits: 'pixels',
        getLineWidth: 3,
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
