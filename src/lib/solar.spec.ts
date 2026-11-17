import { describe, expect, it } from 'vitest'
import { jstDate, solarPosition } from './solar'

// 大手町・丸の内のおよその中心
const OTEMACHI = { lat: 35.684, lon: 139.765 }

describe('機能: 太陽位置（方位・高度）', () => {
  describe('シナリオ: 日本時間の日時', () => {
    it('Given 2025-08-30 と 12時30分 / When 日時にする / Then UTC の 03:30 になる', () => {
      expect(jstDate('2025-08-30', 12, 30).toISOString()).toBe('2025-08-30T03:30:00.000Z')
    })
  })

  describe('シナリオ: 南中', () => {
    it('Given 2025-08-30 の大手町 / When 1日のうち最も高い太陽高度を求める / Then 90−緯度+赤緯（約+9°）の約63.5°になる', () => {
      let max = -90
      for (let minute = 0; minute < 24 * 60; minute += 1) {
        max = Math.max(max, solarPosition(jstDate('2025-08-30', 0, minute), OTEMACHI.lat, OTEMACHI.lon).altitudeDeg)
      }
      expect(max).toBeGreaterThan(62.8)
      expect(max).toBeLessThan(64.2)
    })

    it('Given 2025-08-30 の大手町 / When 南中（経度差で約11時42分）に求める / Then 方位はほぼ真南（180°）', () => {
      const { azimuthDeg } = solarPosition(jstDate('2025-08-30', 11, 42), OTEMACHI.lat, OTEMACHI.lon)
      expect(azimuthDeg).toBeGreaterThan(178)
      expect(azimuthDeg).toBeLessThan(182)
    })

    it('Given 2025-06-21（夏至）の大手町 / When 南中に求める / Then 90−緯度+23.4° の約77.8°になる', () => {
      const { altitudeDeg } = solarPosition(jstDate('2025-06-21', 11, 43), OTEMACHI.lat, OTEMACHI.lon)
      expect(altitudeDeg).toBeGreaterThan(77.2)
      expect(altitudeDeg).toBeLessThan(78.3)
    })
  })

  describe('シナリオ: 朝・夕・夜', () => {
    it('Given 2025-08-30 の9時 / When 求める / Then 太陽は東寄り（方位60〜150°）で地平線の上', () => {
      const p = solarPosition(jstDate('2025-08-30', 9, 0), OTEMACHI.lat, OTEMACHI.lon)
      expect(p.azimuthDeg).toBeGreaterThan(60)
      expect(p.azimuthDeg).toBeLessThan(150)
      expect(p.altitudeDeg).toBeGreaterThan(0)
    })

    it('Given 2025-08-30 の15時 / When 求める / Then 太陽は西寄り（方位210〜300°）', () => {
      const { azimuthDeg } = solarPosition(jstDate('2025-08-30', 15, 0), OTEMACHI.lat, OTEMACHI.lon)
      expect(azimuthDeg).toBeGreaterThan(210)
      expect(azimuthDeg).toBeLessThan(300)
    })

    it('Given 2025-08-30 の0時 / When 求める / Then 地平線の下（高度が負）', () => {
      expect(solarPosition(jstDate('2025-08-30', 0, 0), OTEMACHI.lat, OTEMACHI.lon).altitudeDeg).toBeLessThan(0)
    })

    it('Given 2025-08-30（東京の日の出は5時13分ごろ） / When 5時と5時30分に求める / Then 5時は地平線の下、5時30分は上', () => {
      expect(solarPosition(jstDate('2025-08-30', 5, 0), OTEMACHI.lat, OTEMACHI.lon).altitudeDeg).toBeLessThan(0)
      expect(solarPosition(jstDate('2025-08-30', 5, 30), OTEMACHI.lat, OTEMACHI.lon).altitudeDeg).toBeGreaterThan(0)
    })
  })
})
