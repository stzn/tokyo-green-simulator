import { describe, expect, it } from 'vitest'
import { containsPoint, distanceM, distanceToPathM, pathIntersectsExtent, pointInRing, polygonAreaM2, polygonPerimeterM, ringIntersectsExtent, scaleRing, simplifyRing, type Position } from './geo'

// 経度方向・緯度方向とも約100mの正方形（北緯35.68度付近）
const ring: Position[] = [
  [139.7, 35.68],
  [139.7011, 35.68],
  [139.7011, 35.6809],
  [139.7, 35.6809],
  [139.7, 35.68],
]

const within1pct = (actual: number, expected: number) => {
  expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01)
}

describe('機能: ポリゴンの面積と外周長を求める', () => {
  it('Given 約100m四方の正方形 / When 面積を求める / Then 約9,900m²（誤差1%以内）', () => {
    within1pct(polygonAreaM2([ring]), 99.4 * 99.5)
  })

  it('Given 約100m四方の正方形 / When 外周長を求める / Then 約398m（誤差1%以内）', () => {
    within1pct(polygonPerimeterM([ring]), 2 * (99.4 + 99.5))
  })

  it('Given 時計回りのリング / When 面積を求める / Then 向きに関係なく正の値', () => {
    within1pct(polygonAreaM2([[...ring].reverse()]), 99.4 * 99.5)
  })

  it('Given 穴のあるポリゴン / When 面積を求める / Then 穴の面積を差し引く', () => {
    const outer: Position[] = [
      [139.7, 35.68],
      [139.7022, 35.68],
      [139.7022, 35.6818],
      [139.7, 35.6818],
      [139.7, 35.68],
    ]
    const whole = polygonAreaM2([outer])
    within1pct(polygonAreaM2([outer, ring]), whole - polygonAreaM2([ring]))
  })

  it('Given 空のリング / When 求める / Then 0を返す', () => {
    expect(polygonAreaM2([])).toBe(0)
    expect(polygonPerimeterM([])).toBe(0)
  })
})

describe('機能: ポリゴンを重心まわりに拡大縮小する', () => {
  it('Given 正方形 / When 0.5倍にする / Then 面積は1/4になり重心は変わらない', () => {
    const scaled = scaleRing(ring, 0.5)
    within1pct(polygonAreaM2([scaled]), polygonAreaM2([ring]) / 4)
    expect(scaled[0][0] + scaled[2][0]).toBeCloseTo(ring[0][0] + ring[2][0], 9)
  })

  it('Given 閉じたリング / When 拡大縮小する / Then 閉じたまま（始点=終点）', () => {
    const scaled = scaleRing(ring, 1.05)
    expect(scaled[0]).toEqual(scaled[scaled.length - 1])
  })

  it('Given 高さ / When 拡大縮小する / Then 各頂点にz座標が付く', () => {
    expect(scaleRing(ring, 1, 30)[0][2]).toBe(30)
  })
})

describe('機能: リングを単純化する（Ramer-Douglas-Peucker）', () => {
  it('Given 直線上に余分な点がある折れ線 / When 単純化する / Then 余分な点は間引かれ両端だけ残る', () => {
    const line: Position[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]
    expect(simplifyRing(line, 0.01)).toEqual([
      [0, 0],
      [3, 0],
    ])
  })

  it('Given 直線から離れた尖った点がある折れ線 / When 尖りより小さい許容誤差で単純化する / Then 尖った点は残る', () => {
    const spike: Position[] = [
      [0, 0],
      [1, 1],
      [2, 0],
    ]
    expect(simplifyRing(spike, 0.5)).toEqual(spike)
  })

  it('Given 尖った点がある折れ線 / When 尖りより大きい許容誤差で単純化する / Then 両端だけになる', () => {
    const spike: Position[] = [
      [0, 0],
      [1, 1],
      [2, 0],
    ]
    expect(simplifyRing(spike, 2)).toEqual([
      [0, 0],
      [2, 0],
    ])
  })

  it('Given 2点以下の折れ線 / When 単純化する / Then そのまま返す', () => {
    expect(simplifyRing([], 1)).toEqual([])
    expect(simplifyRing([[0, 0]], 1)).toEqual([[0, 0]])
    expect(
      simplifyRing(
        [
          [0, 0],
          [1, 1],
        ],
        1,
      ),
    ).toEqual([
      [0, 0],
      [1, 1],
    ])
  })

  it('Given 閉じたリング（始点=終点）の途中に直線上の点がある / When 単純化する / Then 角は残り、直線上の点は間引かれる', () => {
    const square: Position[] = [
      [0, 0],
      [2, 0],
      [4, 0], // 下辺の途中（直線上）
      [4, 4],
      [0, 4],
      [0, 0],
    ]
    expect(simplifyRing(square, 0.01)).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ])
  })
})

describe('機能: 表示範囲との重なりを判定する', () => {
  const extent = { west: 139.7, south: 35.6, east: 139.8, north: 35.7 }

  it('Given 範囲内の点 / When 判定する / Then 含まれる', () => {
    expect(containsPoint(extent, 139.75, 35.65)).toBe(true)
  })

  it('Given 範囲の外の点 / When 判定する / Then 含まれない', () => {
    expect(containsPoint(extent, 139.9, 35.65)).toBe(false)
    expect(containsPoint(extent, 139.75, 35.8)).toBe(false)
  })

  it('Given 範囲の縁ちょうどの点 / When 判定する / Then 含まれる', () => {
    expect(containsPoint(extent, 139.7, 35.6)).toBe(true)
    expect(containsPoint(extent, 139.8, 35.7)).toBe(true)
  })

  it('Given 頂点のどれかが範囲内の線 / When 判定する / Then 重なる', () => {
    expect(pathIntersectsExtent(extent, [[139.5, 35.65], [139.75, 35.65], [139.9, 35.65]])).toBe(true)
  })

  it('Given 頂点がすべて範囲の外の線 / When 判定する / Then 重ならない', () => {
    expect(pathIntersectsExtent(extent, [[139.5, 35.5], [139.6, 35.55]])).toBe(false)
  })

  it('Given 範囲を横切るが頂点は範囲の外にある長い線 / When 判定する / Then 重なる（頂点だけで判定すると見落とす）', () => {
    expect(pathIntersectsExtent(extent, [[139.6, 35.65], [139.9, 35.65]])).toBe(true)
  })

  it('Given 範囲を囲む大きなポリゴン / When 判定する / Then 重なる（範囲が公園の内側にある場合）', () => {
    const ring = [[139.0, 35.0], [140.5, 35.0], [140.5, 36.5], [139.0, 36.5], [139.0, 35.0]]
    expect(ringIntersectsExtent(extent, ring)).toBe(true)
  })

  it('Given 範囲と離れたポリゴン / When 判定する / Then 重ならない', () => {
    const ring = [[139.0, 35.0], [139.1, 35.0], [139.1, 35.1], [139.0, 35.0]]
    expect(ringIntersectsExtent(extent, ring)).toBe(false)
  })
})

describe('機能: 地点まわりの距離を測る（計測地点の緑の文脈用）', () => {
  it('Given 緯度が0.001度違う2点 / When 距離を測る / Then 約111m', () => {
    within1pct(distanceM([139.7, 35.68], [139.7, 35.681]), 111.2)
  })

  it('Given 東西に延びる線分の真北約100mの点 / When 線までの距離を測る / Then 約100m', () => {
    const path: Position[] = [
      [139.7, 35.68],
      [139.702, 35.68],
    ]
    within1pct(distanceToPathM([139.701, 35.6809], path), 100.1)
  })

  it('Given 線分の端より外側の点 / When 線までの距離を測る / Then 近い方の端までの距離', () => {
    const path: Position[] = [
      [139.7, 35.68],
      [139.701, 35.68],
    ]
    within1pct(distanceToPathM([139.7, 35.681], path), 111.2)
  })

  it('Given 1点だけの線 / When 距離を測る / Then その点までの距離', () => {
    within1pct(distanceToPathM([139.7, 35.681], [[139.7, 35.68]]), 111.2)
  })
})

describe('機能: 点がリングの内側にあるかを判定する', () => {
  it('Given 正方形の中心 / When 判定する / Then 内側', () => {
    expect(pointInRing(ring, 139.70055, 35.68045)).toBe(true)
  })

  it('Given 正方形の外の点 / When 判定する / Then 外側', () => {
    expect(pointInRing(ring, 139.702, 35.68045)).toBe(false)
  })
})
