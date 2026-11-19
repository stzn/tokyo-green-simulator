import { describe, expect, it } from 'vitest'
import { contractValidator, readJson } from '../test/contracts'
import type { GreenContext } from './measurementLog'
import { spotLabel, STAGE_OUTPUT_PATH, stageIntegrityErrors, toStageGreen, type Stage } from './stage'

const sample = () => readJson('contracts', 'fixtures', 'stage.sample.json') as Stage
const sampleV2 = () => readJson('contracts', 'fixtures', 'stage.v2.sample.json') as Stage

describe('機能: 地点データ（stage.json）の整合性', () => {
  describe('シナリオ: 地点 ID と時刻の重複', () => {
    it('Given 契約確認用のサンプル / When 確かめる / Then 問題なし', () => {
      expect(stageIntegrityErrors(sample())).toEqual([])
    })

    it('Given 同じ ID の地点が2つ / When 確かめる / Then 重複した ID を知らせる', () => {
      const stage = sample()
      stage.spots[1].id = stage.spots[0].id
      expect(stageIntegrityErrors(stage)).toEqual([`地点 ID が重複しています: ${stage.spots[0].id}`])
    })

    it('Given ある地点で12時が2回ある / When 確かめる / Then 地点と時刻を知らせる', () => {
      const stage = sample()
      stage.spots[0].hourly[13].hour = 12
      expect(stageIntegrityErrors(stage)).toEqual([`${stage.spots[0].id}: 時刻 12 が重複しています`])
    })
  })

  describe('シナリオ: 屋根付きの地点（版 2）', () => {
    it('Given 版 2 のサンプル / When 確かめる / Then 問題なし', () => {
      expect(stageIntegrityErrors(sampleV2())).toEqual([])
    })

    it('Given 版 1 に屋根付きの地点 / When 確かめる / Then 版を上げるよう知らせる', () => {
      const stage = sample()
      Object.assign(stage.spots[0], { shelter: 'covered', shelter_network: 'N1' })
      expect(stageIntegrityErrors(stage)).toEqual([`${stage.spots[0].id}: 版 1 の地点データは屋根付きの地点を持てません（版 2 にする）`])
    })

    it('Given 網の番号の無い屋根付きの地点と、網の番号のある屋根なしの地点 / When 確かめる / Then 両方を知らせる', () => {
      const stage = sampleV2()
      delete stage.spots[0].shelter_network
      stage.spots[1].shelter_network = 'N1'
      expect(stageIntegrityErrors(stage)).toEqual([
        `${stage.spots[0].id}: 屋根付きの地点だけが網の番号（shelter_network）を持ちます`,
        `${stage.spots[1].id}: 屋根付きの地点だけが網の番号（shelter_network）を持ちます`,
      ])
    })

    it('Given 屋根付きの地点と屋根なしの地点 / When 説明の名前を作る / Then 屋根付きには網の番号を添える', () => {
      const [covered, open] = sampleV2().spots
      expect(spotLabel(covered)).toBe(`${covered.name}・屋根付き（網 N1）`)
      expect(spotLabel(open)).toBe(open.name)
    })
  })

  describe('シナリオ: 緑の文脈を契約の形にする', () => {
    it('Given 計測ログと同じ数え方の緑の文脈 / When 契約の形にする / Then CSV の列と同じ名前・値になる', () => {
      const context: GreenContext = {
        trees: { total: 18, tall: 12 },
        cityTrees: { routes: 2, count: 30 },
        parks: { count: 1, areaM2: 1800.4 },
        nearestParkM: 0,
        inPark: true,
      }
      expect(toStageGreen(context, 100)).toEqual({
        radius_m: 100,
        trees_all: 18,
        trees_tall: 12,
        parks_count: 1,
        parks_area_m2: 1800,
        nearest_park_m: 0,
      })
    })
  })
})

describe('機能: 書き出した大手町・丸の内の地点データ', () => {
  // npm run stage:export の出力（リポジトリに含める）
  it('Given 生成済みの stage.json / When 契約のスキーマと整合性を確かめる / Then 合格し、全地点が0〜23時を1回ずつ持つ', () => {
    const stage = readJson(STAGE_OUTPUT_PATH) as Stage
    const validate = contractValidator('stage.schema.json')
    expect(validate(stage), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true)
    expect(stageIntegrityErrors(stage)).toEqual([])
    expect(stage.area.id).toBe('otemachi')
    for (const spot of stage.spots) expect(spot.hourly.map((h) => h.hour)).toEqual([...Array(24).keys()])
  })
})
