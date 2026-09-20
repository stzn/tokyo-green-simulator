import { describe, expect, it } from 'vitest'
import { ELEVATION_DECODER, MAX_HEIGHT_M, MIN_HEIGHT_M, decodeGsiPixel, decodeHeight, encodeHeight } from './dem'

describe('機能: 地理院標高タイルの画素を標高に読む', () => {
  it('Given 標高0mの画素 / When 読む / Then 0を返す', () => {
    expect(decodeGsiPixel(0, 0, 0)).toBe(0)
  })

  it('Given 正の標高の画素（丸の内あたりの21.6m相当） / When 読む / Then 0.01m単位の標高を返す', () => {
    // 21.6m → x = 2160 → G=8, B=112
    expect(decodeGsiPixel(0, 8, 112)).toBeCloseTo(21.6, 6)
  })

  it('Given 負の標高の画素（亀戸あたりの-2.8m相当） / When 読む / Then 2の補数のラップを戻して負の標高を返す', () => {
    // -2.8m → x = 2^24 - 280 = 16776936 → R=255, G=254, B=232
    expect(decodeGsiPixel(255, 254, 232)).toBeCloseTo(-2.8, 6)
  })

  it('Given 無効値(128,0,0)の画素（海域や範囲外） / When 読む / Then nullを返す', () => {
    expect(decodeGsiPixel(128, 0, 0)).toBeNull()
  })
})

describe('機能: 配信用タイルの標高エンコード', () => {
  it('Given 標高 / When エンコードして復号する / Then 0.05m以内で元の値に戻る', () => {
    for (const h of [0, 0.1, 2.3, 21.6, -2.8, -0.9, 58.4, 599.95]) {
      const [r, g, b] = encodeHeight(h)
      expect(decodeHeight(r, g, b)).toBeCloseTo(h, 1)
      expect(Math.abs(decodeHeight(r, g, b) - h)).toBeLessThanOrEqual(0.05)
    }
  })

  it('Given エンコードした画素 / When deck.glのelevationDecoderと同じ線形式で復号する / Then 同じ標高になる', () => {
    const [r, g, b] = encodeHeight(37.2)
    const { rScaler, gScaler, bScaler, offset } = ELEVATION_DECODER
    expect(r * rScaler + g * gScaler + b * bScaler + offset).toBeCloseTo(37.2, 5)
  })

  it('Given どの標高 / When エンコードする / Then 青チャンネルは常に0（PNGを小さく保つため）', () => {
    expect(encodeHeight(0)[2]).toBe(0)
    expect(encodeHeight(-500)[2]).toBe(0)
    expect(encodeHeight(3776)[2]).toBe(0)
  })

  it('Given 表現できる範囲を外れた標高 / When エンコードする / Then 範囲の端に丸める', () => {
    expect(decodeHeight(...encodeHeight(MIN_HEIGHT_M - 100))).toBe(MIN_HEIGHT_M)
    expect(decodeHeight(...encodeHeight(MAX_HEIGHT_M + 100))).toBe(MAX_HEIGHT_M)
  })
})
