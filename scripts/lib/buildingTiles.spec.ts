import { describe, expect, it } from 'vitest'
import { localProjection } from '../../src/lib/shade'
import { toLocalBuilding } from './buildingTiles'

const proj = localProjection({ lat: 35.684, lon: 139.765 })
const square = (lon: number, lat: number, d: number) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]

describe('機能: PLATEAU 建物（MVT の地物）を遮蔽の計算用に変換する', () => {
  it('Given measuredHeight が 120m の Polygon / When 変換する / Then 高さ120m・外周1つの建物になる', () => {
    const b = toLocalBuilding({ type: 'Polygon', coordinates: [square(139.765, 35.684, 0.0001)] }, { measuredHeight: 120 }, proj)
    expect(b?.heightM).toBe(120)
    expect(b?.rings).toHaveLength(1)
    expect(b?.rings[0][0][0]).toBeCloseTo(0, 6)
  })

  it('Given 穴のある Polygon / When 変換する / Then 穴は使わず外周だけ残す', () => {
    const b = toLocalBuilding({ type: 'Polygon', coordinates: [square(139.765, 35.684, 0.001), square(139.7652, 35.6842, 0.0001)] }, { measuredHeight: 30 }, proj)
    expect(b?.rings).toHaveLength(1)
  })

  it('Given MultiPolygon / When 変換する / Then 各パートの外周を持つ', () => {
    const b = toLocalBuilding(
      { type: 'MultiPolygon', coordinates: [[square(139.765, 35.684, 0.0001)], [square(139.766, 35.684, 0.0001)]] },
      { measuredHeight: 10 },
      proj,
    )
    expect(b?.rings).toHaveLength(2)
  })

  it('Given measuredHeight が無い・0 / When 変換する / Then 地図表示と同じく平屋相当の3mとする', () => {
    expect(toLocalBuilding({ type: 'Polygon', coordinates: [square(139.765, 35.684, 0.0001)] }, {}, proj)?.heightM).toBe(3)
    expect(toLocalBuilding({ type: 'Polygon', coordinates: [square(139.765, 35.684, 0.0001)] }, { measuredHeight: 0 }, proj)?.heightM).toBe(3)
  })

  it('Given 面でない地物（点・線） / When 変換する / Then null', () => {
    expect(toLocalBuilding({ type: 'Point', coordinates: [139.765, 35.684] }, { measuredHeight: 10 }, proj)).toBeNull()
  })
})
