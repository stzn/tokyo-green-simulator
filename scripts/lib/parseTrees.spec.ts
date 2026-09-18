import { describe, expect, it } from 'vitest'
import { parseTreesCsv } from './parseTrees'

const HEADER = '樹種,区分,樹高(m),枝張(m),幹周(cm）,行政区,種別,整理番号,路線名,通称道路名,経度,緯度'

describe('機能: 街路樹CSVを列指向データに変換する', () => {
  describe('シナリオ: 正常な行を変換する', () => {
    const csv = [
      HEADER,
      'アオギリ,高木,6.5,2,78,港区,主要地方道,316,日本橋芝浦大森線,旧海岸通り,139.7450724,35.6238681',
      'トキワマンサク,中木,2,,,港区,主要地方道,316,日本橋芝浦大森線,旧海岸通り,139.745301,35.623872',
      'イチョウ,高木,12,5,150,千代田区,一般都道,1,内堀通り,,139.75,35.68',
    ].join('\n')

    it('Given 3行のCSV / When 変換する / Then 3本の樹木が得られる', () => {
      const result = parseTreesCsv(csv)
      expect(result.count).toBe(3)
    })

    it('Given 経度・緯度 / When 変換する / Then 小数6桁に丸めてlon,lat交互の配列に入る', () => {
      const result = parseTreesCsv(csv)
      expect(result.positions.slice(0, 2)).toEqual([139.745072, 35.623868])
    })

    it('Given 樹種・区・路線名 / When 変換する / Then 重複のない辞書と辞書インデックスで表される', () => {
      const result = parseTreesCsv(csv)
      expect(result.dict.species).toEqual(['アオギリ', 'トキワマンサク', 'イチョウ'])
      expect(result.dict.wards).toEqual(['港区', '千代田区'])
      expect(result.dict.routes).toEqual(['日本橋芝浦大森線', '内堀通り'])
      expect(result.speciesIdx).toEqual([0, 1, 2])
      expect(result.wardIdx).toEqual([0, 0, 1])
      expect(result.routeIdx).toEqual([0, 0, 1])
    })

    it('Given 高木・中木の区分 / When 変換する / Then 高木=1, 中木=0 で表される', () => {
      expect(parseTreesCsv(csv).isTall).toEqual([1, 0, 1])
    })

    it('Given 枝張・幹周が空欄 / When 変換する / Then 欠損値は-1になる', () => {
      const result = parseTreesCsv(csv)
      expect(result.height).toEqual([6.5, 2, 12])
      expect(result.spread).toEqual([2, -1, 5])
      expect(result.girth).toEqual([78, -1, 150])
    })
  })

  describe('シナリオ: 不正な行を除外する', () => {
    it('Given 緯度経度が空の行 / When 変換する / Then その行は除外される', () => {
      const csv = [HEADER, 'ケヤキ,高木,10,4,100,新宿区,一般都道,2,青梅街道,,,', 'ケヤキ,高木,10,4,100,新宿区,一般都道,2,青梅街道,,139.7,35.69'].join('\n')
      const result = parseTreesCsv(csv)
      expect(result.count).toBe(1)
      expect(result.positions).toEqual([139.7, 35.69])
    })

    it('Given 末尾の空行やCRLF改行 / When 変換する / Then 問題なく読める', () => {
      const csv = [HEADER, 'ケヤキ,高木,10,4,100,新宿区,一般都道,2,青梅街道,,139.7,35.69', ''].join('\r\n')
      expect(parseTreesCsv(csv).count).toBe(1)
    })
  })
})
