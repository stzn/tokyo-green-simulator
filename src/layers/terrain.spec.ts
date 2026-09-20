import { TerrainLayer } from '@deck.gl/geo-layers'
import { describe, expect, it } from 'vitest'
import { DEM_MAX_ZOOM, DEM_MIN_ZOOM } from '../config/sources'
import { DEM_BBOX, ELEVATION_DECODER } from '../lib/dem'
import { createTerrainLayer } from './terrain'

describe('機能: 地形レイヤーを作る', () => {
  it('Given 地形レイヤー / When 作る / Then 配信形式のデコーダを持つ地形レイヤーになる', () => {
    const layer = createTerrainLayer()
    expect(layer).toBeInstanceOf(TerrainLayer)
    expect(layer.props.elevationDecoder).toEqual(ELEVATION_DECODER)
  })

  it('Given 地形レイヤー / Then 他レイヤーを乗せるための地形として扱われる', () => {
    expect(createTerrainLayer().props.operation).toBe('terrain')
  })

  it('Given 用意したタイルはz=10〜13 / Then そのズーム範囲で読み、ズームインでは13を使い回す', () => {
    const layer = createTerrainLayer()
    expect(layer.props.minZoom).toBe(DEM_MIN_ZOOM)
    expect(layer.props.maxZoom).toBe(DEM_MAX_ZOOM)
  })

  it('Given 23区の外 / Then タイルを用意していないので読みに行かない', () => {
    const { west, south, east, north } = DEM_BBOX
    expect(createTerrainLayer().props.extent).toEqual([west, south, east, north])
  })

  it('Given 範囲外のタイル（404） / When 読み込みに失敗する / Then 例外にせず地形なしとして続ける', () => {
    const layer = createTerrainLayer()
    expect(() => layer.props.onTileError(new Error('404'))).not.toThrow()
  })
})
