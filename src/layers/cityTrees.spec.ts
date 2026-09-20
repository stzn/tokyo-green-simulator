import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions'
import { PathLayer } from '@deck.gl/layers'
import { describe, expect, it } from 'vitest'
import type { CityTreePath } from '../data/cityTrees'
import { createCityTreesLayer } from './cityTrees'
import { speciesColor } from './trees'

const path = (species: string[], count: number | null, route = '区道A'): CityTreePath => ({
  route: { ward: '世田谷区', species, count, route, alias: '', manager: '世田谷区' },
  path: [
    [139.75, 35.68],
    [139.76, 35.69],
  ],
})

const options = { paths: [path(['イチョウ'], 30)], visible: true, selectedRoute: null, terrain: false }

describe('機能: 区道の街路樹レイヤーを作る', () => {
  it('Given 表示ON / When 作る / Then 路線の線を描き、クリックで選択できる', () => {
    const layer = createCityTreesLayer(options)
    expect(layer).toBeInstanceOf(PathLayer)
    expect(layer.props.visible).toBe(true)
    expect(layer.props.pickable).toBe(true)
  })

  it('Given 樹種の分かる路線 / When 色を決める / Then 先頭の樹種の色になる（都道の単木と同じ配色）', () => {
    const layer = createCityTreesLayer(options)
    const getColor = layer.props.getColor as unknown as (p: CityTreePath) => number[]
    const [r, g, b] = speciesColor('イチョウ')
    expect(getColor(path(['イチョウ', 'サクラ'], 10)).slice(0, 3)).toEqual([r, g, b])
  })

  it('Given 本数の多い路線と少ない路線 / When 太さを決める / Then 多いほど太くなる', () => {
    const layer = createCityTreesLayer(options)
    const getWidth = layer.props.getWidth as unknown as (p: CityTreePath) => number
    expect(getWidth(path(['イチョウ'], 500))).toBeGreaterThan(getWidth(path(['イチョウ'], 10)))
  })

  it('Given 本数が公開されていない路線 / When 太さを決める / Then 最小の太さで描く（多いように見せない）', () => {
    const layer = createCityTreesLayer(options)
    const getWidth = layer.props.getWidth as unknown as (p: CityTreePath) => number
    expect(getWidth(path(['イチョウ'], null))).toBeLessThanOrEqual(getWidth(path(['イチョウ'], 1)))
  })

  it('Given 選択中の路線 / When 色を決める / Then 選択中だけ不透明にする', () => {
    const layer = createCityTreesLayer({ ...options, selectedRoute: '区道A' })
    const getColor = layer.props.getColor as unknown as (p: CityTreePath) => number[]
    expect(getColor(path(['イチョウ'], 10, '区道A'))[3]).toBeGreaterThan(getColor(path(['イチョウ'], 10, '区道B'))[3])
  })

  it('Given 地形あり / When 作る / Then 標高ぶん持ち上げる拡張が付く', () => {
    const layer = createCityTreesLayer({ ...options, terrain: true })
    expect(layer.props.extensions.some((e) => e instanceof TerrainExtension)).toBe(true)
    expect(layer.props.terrainDrawMode).toBe('offset')
  })

  it('Given 地形なし / When 作る / Then 拡張を付けない', () => {
    expect(createCityTreesLayer(options).props.extensions.some((e) => e instanceof TerrainExtension)).toBe(false)
  })
})

describe('機能: 路線の線をそのまま描く', () => {
  it('Given 路線のパス / When パスを取り出す / Then 座標列をそのまま使う', () => {
    const layer = createCityTreesLayer(options)
    const getPath = layer.props.getPath as unknown as (p: CityTreePath) => number[][]
    expect(getPath(path(['イチョウ'], 10))).toEqual([
      [139.75, 35.68],
      [139.76, 35.69],
    ])
  })
})
