// 緑化した建物に「緑が付着する」演出レイヤー（屋上スラブ＋壁面スキン）
import { PolygonLayer } from '@deck.gl/layers'
import { scaleRing, type Position } from '../lib/geo'
import type { GreenedBuilding } from '../store/appStore'

type RoofShape = { polygon: Position[]; thicknessM: number }
type WallShape = { polygon: Position[]; heightM: number }
export type GreeningShape = { id: string; roof: RoofShape | null; wall: WallShape | null }

const ROOF_THICKNESS_M = 1.5
/** 壁面の緑を建物より少し外側に描いて、壁に張り付いて見えるようにする */
const WALL_OFFSET_FACTOR = 1.03

export function toGreeningShapes(greened: GreenedBuilding[]): GreeningShape[] {
  return greened.map(({ building, plan }) => {
    const outer = building.polygon[0]
    return {
      id: building.id,
      // 面積比が緑化率になるよう、辺の長さは√倍
      roof: plan.roofRatio > 0 ? { polygon: scaleRing(outer, Math.sqrt(plan.roofRatio), building.heightM), thicknessM: ROOF_THICKNESS_M } : null,
      wall: plan.wallRatio > 0 ? { polygon: scaleRing(outer, WALL_OFFSET_FACTOR), heightM: building.heightM * plan.wallRatio } : null,
    }
  })
}

// 追加された建物は高さ0から伸びる
const growTransition = { duration: 1400, enter: () => [0] }

export function createGreeningLayers(greened: GreenedBuilding[]) {
  const shapes = toGreeningShapes(greened)
  return [
    new PolygonLayer<GreeningShape>({
      id: 'greening-roof',
      data: shapes.filter((s) => s.roof),
      getPolygon: (s) => s.roof!.polygon,
      getElevation: (s) => s.roof!.thicknessM,
      extruded: true,
      getFillColor: [134, 239, 172, 255],
      getLineColor: [187, 247, 208, 255],
      transitions: { getElevation: growTransition },
    }),
    new PolygonLayer<GreeningShape>({
      id: 'greening-wall',
      data: shapes.filter((s) => s.wall),
      getPolygon: (s) => s.wall!.polygon,
      getElevation: (s) => s.wall!.heightM,
      extruded: true,
      getFillColor: [74, 222, 128, 215],
      transitions: { getElevation: growTransition },
    }),
  ]
}
