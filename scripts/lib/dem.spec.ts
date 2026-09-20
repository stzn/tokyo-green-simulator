import { describe, expect, it } from 'vitest'
import { decodeHeight, encodeHeight } from '../../src/lib/dem'
import { TOKYO_23KU_BBOX, convertGsiPixels, lonLatToTile, mergeChildTiles, parentTile, tileRange } from './dem'

describe('機能: 緯度経度をタイル座標に直す', () => {
  it('Given 丸の内（139.7645, 35.6795）とズーム13 / When タイル座標を求める / Then 地理院タイルと同じ 7276/3225 になる', () => {
    expect(lonLatToTile(139.7645, 35.6795, 13)).toEqual({ x: 7276, y: 3225 })
  })

  it('Given 同じ地点でズームを1段上げる / When タイル座標を求める / Then 座標が倍になる', () => {
    expect(lonLatToTile(139.7645, 35.6795, 14)).toEqual({ x: 14552, y: 6451 })
  })
})

describe('機能: 範囲に重なるタイルを列挙する', () => {
  it('Given 23区のbboxとズーム13 / When タイルを列挙する / Then 10×10の100枚になり、丸の内のタイルを含む', () => {
    const tiles = tileRange(TOKYO_23KU_BBOX, 13)
    expect(tiles).toHaveLength(100)
    expect(tiles).toContainEqual({ x: 7276, y: 3225 })
  })

  it('Given 1タイルに収まる狭い範囲 / When タイルを列挙する / Then そのタイル1枚だけを返す', () => {
    const bbox = { west: 139.764, south: 35.679, east: 139.765, north: 35.68 }
    expect(tileRange(bbox, 13)).toEqual([{ x: 7276, y: 3225 }])
  })

  it('Given 23区のbbox / Then 23区をすべて含む（練馬の北西端と江戸川の南東端）', () => {
    const { west, south, east, north } = TOKYO_23KU_BBOX
    expect(west).toBeLessThan(139.58) // 練馬区の西端あたり
    expect(north).toBeGreaterThan(35.81) // 足立区・練馬区の北端あたり
    expect(east).toBeGreaterThan(139.91) // 江戸川区の東端あたり
    expect(south).toBeLessThan(35.53) // 大田区の南端あたり
  })
})

describe('機能: 地理院タイルの画素を配信形式に詰め替える', () => {
  const rgba = (px: number[][]) => new Uint8Array(px.flatMap(([r, g, b]) => [r, g, b, 255]))

  it('Given 標高2.3mの画素 / When 詰め替える / Then 配信形式で読み戻すと同じ標高になる', () => {
    const out = convertGsiPixels(rgba([[0, 0, 230]]))
    expect(decodeHeight(out[0], out[1], out[2])).toBeCloseTo(2.3, 1)
    expect(out[3]).toBe(255)
  })

  it('Given 負の標高(-2.8m)の画素 / When 詰め替える / Then 負のまま読み戻せる', () => {
    const out = convertGsiPixels(rgba([[255, 254, 232]]))
    expect(decodeHeight(out[0], out[1], out[2])).toBeCloseTo(-2.8, 1)
  })

  it('Given 無効値(128,0,0)の画素（海域） / When 詰め替える / Then 標高0mとして扱う', () => {
    const out = convertGsiPixels(rgba([[128, 0, 0]]))
    expect(decodeHeight(out[0], out[1], out[2])).toBeCloseTo(0, 6)
  })

  it('Given 複数画素 / When 詰め替える / Then 画素数はそのままで、すべて不透明になる', () => {
    const out = convertGsiPixels(rgba([[0, 0, 0], [0, 8, 112], [128, 0, 0]]))
    expect(out).toHaveLength(12)
    expect([out[3], out[7], out[11]]).toEqual([255, 255, 255])
  })
})

describe('機能: 低ズーム用のタイルを作る', () => {
  const tile = (fill: number) => {
    const rgba = new Uint8Array(4 * 4 * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      const [r, g, b] = encodeHeight(fill)
      rgba.set([r, g, b, 255], i)
    }
    return rgba
  }

  it('Given 標高の異なる子タイル4枚 / When 1枚にまとめる / Then 4画素の平均標高になる', () => {
    const parent = mergeChildTiles({ nw: tile(10), ne: tile(20), sw: tile(30), se: tile(40) }, 4)
    // 左上の画素は北西タイルの縮小、右下の画素は南東タイルの縮小
    expect(decodeHeight(parent[0], parent[1], parent[2])).toBeCloseTo(10, 1)
    const last = parent.length - 4
    expect(decodeHeight(parent[last], parent[last + 1], parent[last + 2])).toBeCloseTo(40, 1)
  })

  it('Given 欠けている子タイル / When 1枚にまとめる / Then その範囲は標高0mになる', () => {
    const parent = mergeChildTiles({ nw: null, ne: tile(20), sw: null, se: null }, 4)
    expect(decodeHeight(parent[0], parent[1], parent[2])).toBeCloseTo(0, 1)
    expect(parent[3]).toBe(255)
  })

  it('Given 子タイル / When 1枚にまとめる / Then タイルの画素数は変わらない', () => {
    expect(mergeChildTiles({ nw: tile(5), ne: null, sw: null, se: null }, 4)).toHaveLength(4 * 4 * 4)
  })
})

describe('機能: 親タイルの座標', () => {
  it('Given z=13のタイル / When 1段上の親を求める / Then 座標が半分になる', () => {
    expect(parentTile({ x: 7276, y: 3225 })).toEqual({ x: 3638, y: 1612 })
    expect(parentTile({ x: 7277, y: 3225 })).toEqual({ x: 3638, y: 1612 })
  })
})
