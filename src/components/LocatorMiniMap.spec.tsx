import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WardFeature } from '../data/wards'
import type { Extent } from '../lib/projection'
import { LocatorMiniMap } from './LocatorMiniMap'

const ward = (name: string, west: number, south: number, east: number, north: number): WardFeature => ({
  type: 'Feature',
  properties: { name },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north],
      ],
    ],
  },
})

const chiyoda = ward('千代田区', 139.74, 35.68, 139.77, 35.7)
const setagaya = ward('世田谷区', 139.6, 35.6, 139.65, 35.65)

describe('機能: 現在地ミニマップ', () => {
  it('Given 区のデータ / When 表示する / Then 区の数だけ輪郭が描かれる', () => {
    render(<LocatorMiniMap wards={[chiyoda, setagaya]} bounds={null} />)
    const map = screen.getByTestId('locator-map')
    expect(map.querySelectorAll('path')).toHaveLength(2)
  })

  it('Given 区のデータが空 / When 表示する / Then 何も表示しない', () => {
    render(<LocatorMiniMap wards={[]} bounds={null} />)
    expect(screen.queryByTestId('locator-map')).not.toBeInTheDocument()
  })

  it('Given 表示範囲がまだ分からない（bounds=null） / Then 現在地の枠は表示しない', () => {
    render(<LocatorMiniMap wards={[chiyoda, setagaya]} bounds={null} />)
    expect(screen.queryByTestId('locator-bounds')).not.toBeInTheDocument()
  })

  it('Given 表示範囲が分かっている / Then 現在地の枠を表示する', () => {
    const bounds: Extent = { west: 139.745, south: 35.685, east: 139.755, north: 35.695 }
    render(<LocatorMiniMap wards={[chiyoda, setagaya]} bounds={bounds} />)
    expect(screen.getByTestId('locator-bounds')).toBeInTheDocument()
  })

  it('Given 異なる表示範囲 / Then 現在地の枠の位置が変わる', () => {
    const boundsA: Extent = { west: 139.745, south: 35.685, east: 139.75, north: 35.69 }
    const boundsB: Extent = { west: 139.6, south: 35.6, east: 139.61, north: 35.61 }
    const { rerender } = render(<LocatorMiniMap wards={[chiyoda, setagaya]} bounds={boundsA} />)
    const xBefore = screen.getByTestId('locator-bounds').getAttribute('x')
    rerender(<LocatorMiniMap wards={[chiyoda, setagaya]} bounds={boundsB} />)
    const xAfter = screen.getByTestId('locator-bounds').getAttribute('x')
    expect(xAfter).not.toBe(xBefore)
  })
})
