// PLATEAU建物（MVT）の3D押し出しレイヤー
// deck.gl 9.4では実験扱いのため _TerrainExtension という名前でエクスポートされている
import { _TerrainExtension as TerrainExtension, type TerrainExtensionProps } from '@deck.gl/extensions'
import { MVTLayer } from '@deck.gl/geo-layers'
import { PLATEAU_BUILDINGS_TILES } from '../config/sources'
import { polygonAreaM2, polygonPerimeterM, type PolygonRings } from '../lib/geo'
import type { BuildingInfo } from '../store/appStore'

export type BuildingFeature = {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: PolygonRings } | { type: 'MultiPolygon'; coordinates: PolygonRings[] }
  properties: { 建物ID?: string; measuredHeight?: number; buildingRoofEdgeArea?: number; [key: string]: unknown }
}

type RGBA = [number, number, number, number]
export const BUILDING_COLORS: Record<'default' | 'selected' | 'greened', RGBA> = {
  default: [148, 163, 184, 235],
  selected: [56, 189, 248, 255],
  // 本体は控えめな色にして、屋上・壁面の緑化演出（greening.ts）を際立たせる
  greened: [104, 132, 118, 255],
}

// 地形（terrain.ts）の標高ぶん建物を持ち上げる。
// 地形を出していないときは付けない（付けたままだと街路樹のヒートマップが描画されない）
const terrainExtension = new TerrainExtension()

/** measuredHeight が未設定（0）の建物に使う高さ（平屋相当） */
const FALLBACK_HEIGHT_M = 3

// アクセサはdeck.gl側のFeature型で呼ばれるため、使うpropertiesだけを要求する
type WithProps = { properties: BuildingFeature['properties'] }

const idOf = (f: WithProps) => f.properties.建物ID
const heightOf = (f: WithProps) => {
  const h = Number(f.properties.measuredHeight)
  return h > 0 ? h : FALLBACK_HEIGHT_M
}

export function buildingFromFeature(feature: BuildingFeature): BuildingInfo | null {
  const id = idOf(feature)
  if (!id) return null
  const g = feature.geometry
  // MultiPolygonは最大のポリゴンを代表とする
  const polygon =
    g.type === 'Polygon' ? g.coordinates : g.coordinates.reduce((a, b) => (polygonAreaM2(b) > polygonAreaM2(a) ? b : a))
  const roofEdge = Number(feature.properties.buildingRoofEdgeArea)
  return {
    id,
    heightM: heightOf(feature),
    // 屋根面積はPLATEAUの属性を優先。無ければフットプリント面積で代用
    roofAreaM2: roofEdge > 0 ? roofEdge : polygonAreaM2(polygon),
    perimeterM: polygonPerimeterM(polygon),
    polygon,
  }
}

type Options = { visible: boolean; selectedId: string | null; greenedIds: Set<string>; terrain: boolean }

export function createBuildingsLayer({ visible, selectedId, greenedIds, terrain }: Options) {
  return new MVTLayer<BuildingFeature['properties'], TerrainExtensionProps>({
    id: 'buildings',
    data: PLATEAU_BUILDINGS_TILES,
    minZoom: 10,
    maxZoom: 16,
    visible,
    extruded: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    // 同じ建物がタイル境界で分割されても、IDで同じ色になるようにする
    uniqueIdProperty: '建物ID',
    getElevation: (f: WithProps) => heightOf(f),
    getFillColor: (f: WithProps) => {
      const id = idOf(f)
      // 緑化の結果を見せるため、緑化済みを選択中より優先する
      if (id && greenedIds.has(id)) return BUILDING_COLORS.greened
      if (id && id === selectedId) return BUILDING_COLORS.selected
      return BUILDING_COLORS.default
    },
    extensions: terrain ? [terrainExtension] : [],
    terrainDrawMode: 'offset',
    material: { ambient: 0.35, diffuse: 0.6, shininess: 32, specularColor: [60, 64, 70] },
    updateTriggers: { getFillColor: [selectedId, [...greenedIds].join(',')] },
  })
}
