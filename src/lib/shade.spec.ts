import { describe, expect, it } from 'vitest'
import {
  CANOPY_TRANSMITTANCE,
  canopyShadeForSun,
  combineShade,
  createBuildingIndex,
  createTreeIndex,
  crownOf,
  estimateCrownSpreadM,
  horizonProfile,
  isInsideBuilding,
  localProjection,
  nearbyCrowns,
  nearestWallDistanceM,
  shadeFractionForHour,
  skyViewFactor,
  type LocalBuilding,
  type LocalTree,
} from './shade'

// 地点は原点。x=東[m]、y=北[m]
const ORIGIN = { lat: 35.684, lon: 139.765 }
const DATE = '2025-08-30'
const box = (x0: number, y0: number, x1: number, y1: number, heightM: number): LocalBuilding => ({
  rings: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  heightM,
})
const profileOf = (buildings: LocalBuilding[]) => horizonProfile(createBuildingIndex(buildings), [0, 0])
const shadeAt = (buildings: LocalBuilding[], hour: number) =>
  shadeFractionForHour(profileOf(buildings), DATE, hour, ORIGIN.lat, ORIGIN.lon)

describe('機能: 建物による日射の遮蔽', () => {
  describe('シナリオ: 周りに建物が無い', () => {
    it('Given 建物なし / When 12時の遮蔽率を求める / Then 0（日向）', () => {
      expect(shadeAt([], 12)).toBe(0)
    })

    it('Given 建物なし / When 0時と22時の遮蔽率を求める / Then 夜なので1.0', () => {
      expect(shadeAt([], 0)).toBe(1)
      expect(shadeAt([], 22)).toBe(1)
    })

    it('Given 建物なし / When 日の出（5時13分ごろ）を含む5時台を求める / Then 0と1の間（夜の部分だけ遮蔽）', () => {
      const shade = shadeAt([], 5)
      expect(shade).toBeGreaterThan(0)
      expect(shade).toBeLessThan(1)
    })
  })

  describe('シナリオ: 高い建物の向き', () => {
    it('Given 北側20mに高さ100mの建物 / When 11〜13時を求める / Then 太陽は南にあるので遮蔽されない', () => {
      const north = [box(-20, 20, 20, 30, 100)]
      for (const hour of [11, 12, 13]) expect(shadeAt(north, hour)).toBe(0)
    })

    it('Given 南側20mに高さ100mの建物 / When 12時を求める / Then 完全に日影（1.0）', () => {
      expect(shadeAt([box(-20, -30, 20, -20, 100)], 12)).toBe(1)
    })

    it('Given 東側30mに高さ60mの建物 / When 8時と15時を求める / Then 朝は日影、午後は日向', () => {
      const east = [box(30, -40, 40, 40, 60)]
      expect(shadeAt(east, 8)).toBe(1)
      expect(shadeAt(east, 15)).toBe(0)
    })
  })

  describe('シナリオ: 地平線の仰角', () => {
    it('Given 真南20mに高さ20mの壁 / When 真南（180°）の仰角を求める / Then 約45°', () => {
      const profile = profileOf([box(-50, -21, 50, -20, 20)])
      expect(profile[180]).toBeCloseTo(45, 0)
      // 北側は開けている
      expect(profile[0]).toBe(0)
    })

    it('Given 遮蔽を数える距離（既定500m）より遠い建物 / When 仰角を求める / Then 数えない', () => {
      const profile = profileOf([box(-50, -610, 50, -600, 300)])
      expect(profile[180]).toBe(0)
    })
  })
})

describe('機能: 天空率', () => {
  it('Given 建物なし / When 天空率を求める / Then 1', () => {
    expect(skyViewFactor(profileOf([]))).toBe(1)
  })

  it('Given 半径10mの円周に高さ10mの壁が全周を囲む / When 天空率を求める / Then 1−sin²45° = 0.5 に近い', () => {
    // 5°ごとに少し重なる短い壁を並べて円筒を近似する
    const walls: LocalBuilding[] = []
    for (let deg = 0; deg < 360; deg += 5) {
      const a0 = ((deg - 3) * Math.PI) / 180
      const a1 = ((deg + 3) * Math.PI) / 180
      const p = (a: number, r: number): [number, number] => [r * Math.sin(a), r * Math.cos(a)]
      walls.push({ rings: [[p(a0, 10), p(a1, 10), p(a1, 10.5), p(a0, 10.5), p(a0, 10)]], heightM: 10 })
    }
    expect(skyViewFactor(profileOf(walls))).toBeCloseTo(0.5, 1)
  })

  it('Given 同じ配置で建物が高い / When 天空率を比べる / Then 高いほど小さい', () => {
    const low = skyViewFactor(profileOf([box(-50, -21, 50, -20, 10)]))
    const high = skyViewFactor(profileOf([box(-50, -21, 50, -20, 80)]))
    expect(high).toBeLessThan(low)
    expect(low).toBeLessThan(1)
  })
})

describe('機能: 地点と建物の位置関係', () => {
  const index = createBuildingIndex([box(10, -5, 30, 5, 20)])

  it('Given 建物の内側の点 / When 判定する / Then 内側', () => {
    expect(isInsideBuilding(index, [20, 0])).toBe(true)
    expect(isInsideBuilding(index, [0, 0])).toBe(false)
  })

  it('Given 建物の西の壁から10mの点 / When 最寄りの壁までの距離を求める / Then 10m', () => {
    expect(nearestWallDistanceM(index, [0, 0], 50)).toBeCloseTo(10, 5)
  })

  it('Given 探す範囲に壁が無い / When 距離を求める / Then Infinity', () => {
    expect(nearestWallDistanceM(index, [-200, 0], 50)).toBe(Infinity)
  })
})

describe('機能: 局所の平面座標', () => {
  it('Given 原点から北へ緯度0.001°・東へ経度0.001° / When 平面座標にして戻す / Then 北に約111m・東に約90mで、元の緯度経度に戻る', () => {
    const proj = localProjection(ORIGIN)
    const [x, y] = proj.toXY([ORIGIN.lon + 0.001, ORIGIN.lat + 0.001])
    expect(y).toBeCloseTo(111.2, 0)
    expect(x).toBeCloseTo(90.3, 0)
    const [lon, lat] = proj.toLonLat([x, y])
    expect(lon).toBeCloseTo(ORIGIN.lon + 0.001, 9)
    expect(lat).toBeCloseTo(ORIGIN.lat + 0.001, 9)
  })
})

// 樹高 heightM・樹冠の半径 crownRadiusM の木を (x, y) に置く
const tree = (x: number, y: number, heightM: number, crownRadiusM: number): LocalTree => ({ x, y, heightM, crownRadiusM })

describe('機能: 建物と樹冠の遮蔽の合成', () => {
  it('Given 建物0.5・樹冠0.8 / When 合成する / Then 1−(1−0.5)(1−0.8) = 0.9', () => {
    expect(combineShade(0.5, 0.8)).toBeCloseTo(0.9, 10)
  })

  it('Given 建物で完全に日影 / When 樹冠と合成する / Then 1のまま', () => {
    expect(combineShade(1, 0.8)).toBe(1)
  })

  it('Given どちらも遮蔽なし / When 合成する / Then 0', () => {
    expect(combineShade(0, 0)).toBe(0)
  })
})

describe('機能: 街路樹の樹冠による日射の遮蔽', () => {
  it('Given 透過率 / When 値を見る / Then 0.2（夏の葉の茂った樹冠を仮定）', () => {
    expect(CANOPY_TRANSMITTANCE).toBe(0.2)
  })

  describe('シナリオ: 真上の太陽', () => {
    it('Given 樹冠（半径3m）の真下の地点 / When 太陽高度90°で遮蔽を求める / Then 0.8', () => {
      expect(canopyShadeForSun([tree(1, 1, 10, 3)], 180, 90)).toBeCloseTo(0.8, 10)
    })

    it('Given 樹冠の外（幹から10m）の地点 / When 太陽高度90°で遮蔽を求める / Then 0', () => {
      expect(canopyShadeForSun([tree(10, 0, 10, 3)], 180, 90)).toBe(0)
    })
  })

  describe('シナリオ: 斜めの太陽（高度45°）', () => {
    it('Given 南8mに樹高10mの木（樹冠は高さ6〜10m） / When 南の太陽で求める / Then 太陽への線が樹冠を通るので0.8', () => {
      expect(canopyShadeForSun([tree(0, -8, 10, 1)], 180, 45)).toBeCloseTo(0.8, 10)
    })

    it('Given 北8mに同じ木 / When 南の太陽で求める / Then 0', () => {
      expect(canopyShadeForSun([tree(0, 8, 10, 1)], 180, 45)).toBe(0)
    })

    it('Given 南20mに樹高10mの木（樹冠の半径1m） / When 南の太陽で求める / Then 線は樹冠の上を抜けるので0', () => {
      expect(canopyShadeForSun([tree(0, -20, 10, 1)], 180, 45)).toBe(0)
    })

    it('Given 南3mに樹高10mの木（樹冠の半径1m） / When 南の太陽で求める / Then 線は樹冠の下（幹の高さ）を抜けるので0', () => {
      expect(canopyShadeForSun([tree(0, -3, 10, 1)], 180, 45)).toBe(0)
    })
  })

  it('Given 太陽への線が2本の樹冠を通る / When 遮蔽を求める / Then 重ねず0.8（並木の連なった樹冠を1枚の葉群とみなす）', () => {
    expect(canopyShadeForSun([tree(0, 0, 10, 3), tree(0.5, 0, 10, 3)], 180, 90)).toBeCloseTo(0.8, 10)
  })

  it('Given 夜（太陽高度0°以下） / When 遮蔽を求める / Then 樹冠は数えない（0）', () => {
    expect(canopyShadeForSun([tree(0, 0, 10, 3)], 180, -5)).toBe(0)
  })
})

describe('機能: 街路樹の樹冠の大きさ', () => {
  it('Given 樹高10m / When 枝張りを高さから近似する / Then 0.40×10+0.36 = 4.36m', () => {
    expect(estimateCrownSpreadM(10)).toBeCloseTo(4.36, 10)
  })

  it('Given 樹高8m・枝張り5m / When 樹冠にする / Then 半径は枝張りの半分の2.5m', () => {
    expect(crownOf(8, 5)).toEqual({ heightM: 8, crownRadiusM: 2.5 })
  })

  it('Given 枝張りが欠損（−1） / When 樹冠にする / Then 高さからの近似の半分を半径にする', () => {
    expect(crownOf(10, -1)?.crownRadiusM).toBeCloseTo(2.18, 10)
  })

  it('Given 樹高が欠損（0以下） / When 樹冠にする / Then null（数えない）', () => {
    expect(crownOf(-1, 5)).toBeNull()
    expect(crownOf(0, 5)).toBeNull()
  })
})

describe('機能: 地点の近くの樹冠', () => {
  const index = createTreeIndex([tree(100, 0, 10, 2), tree(5, 5, 8, 2), tree(-600, 0, 20, 5)])

  it('Given 地点 (100, 0) / When 近くの樹冠を集める / Then 地点を原点にした座標で、遠い木は除く', () => {
    const crowns = nearbyCrowns(index, [100, 0], 200)
    expect(crowns).toHaveLength(2)
    expect(crowns).toContainEqual(tree(0, 0, 10, 2))
    expect(crowns).toContainEqual(tree(-95, 5, 8, 2))
  })
})

describe('機能: 建物と樹冠を合わせた時間ごとの遮蔽率', () => {
  // 地点の真上を覆う大きな樹冠（半径20m、高さ6〜10m）
  const canopy = [tree(0, 0, 10, 20)]

  it('Given 建物なし・地点が大きな樹冠の下 / When 12時を求める / Then 0.8', () => {
    expect(shadeFractionForHour(profileOf([]), DATE, 12, ORIGIN.lat, ORIGIN.lon, { crowns: canopy })).toBeCloseTo(0.8, 10)
  })

  it('Given 南に高い建物・地点が樹冠の下 / When 12時を求める / Then 建物で完全に日影なので1.0', () => {
    expect(shadeFractionForHour(profileOf([box(-20, -30, 20, -20, 100)]), DATE, 12, ORIGIN.lat, ORIGIN.lon, { crowns: canopy })).toBe(1)
  })

  it('Given 樹冠なし / When 12時を求める / Then 建物だけの結果（0）と同じ', () => {
    expect(shadeFractionForHour(profileOf([]), DATE, 12, ORIGIN.lat, ORIGIN.lon, { crowns: [] })).toBe(0)
  })

  it('Given 樹冠の下 / When 0時を求める / Then 夜なので1.0', () => {
    expect(shadeFractionForHour(profileOf([]), DATE, 0, ORIGIN.lat, ORIGIN.lon, { crowns: canopy })).toBe(1)
  })
})
