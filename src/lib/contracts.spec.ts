import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'

// シミュレーター（virtual-greening-sim）とのデータ契約 v1。正本はシミュレーター側の src/vmgs/contracts.py で、
// contracts/ 一式（スキーマとサンプル）をそのまま写している。jsdom では import.meta.url が使えないため、
// リポジトリ直下（テストの実行場所）から読む
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), 'contracts', name), 'utf-8'))

// スキーマの format: "date"（YYYY-MM-DD）を Ajv に教える（ajv-formats を足さずに済ませる）
const validatorOf = (schemaFile: string) =>
  new Ajv2020({ allErrors: true, formats: { date: /^\d{4}-\d{2}-\d{2}$/ } }).compile(read(schemaFile) as object)

describe('機能: シミュレーターとのデータ契約 v1', () => {
  describe('シナリオ: 契約確認用のサンプル', () => {
    it('Given 地点データのサンプル / When stage のスキーマで検証する / Then 合格する', () => {
      const validate = validatorOf('stage.schema.json')
      expect(validate(read('fixtures/stage.sample.json')), JSON.stringify(validate.errors)).toBe(true)
    })

    it('Given 配車のサンプル / When dispatch のスキーマで検証する / Then 合格する', () => {
      const validate = validatorOf('dispatch.schema.json')
      expect(validate(read('fixtures/dispatch.sample.json')), JSON.stringify(validate.errors)).toBe(true)
    })

    it('Given JITAI の集計のサンプル / When jitai-summary のスキーマで検証する / Then 合格する', () => {
      const validate = validatorOf('jitai-summary.schema.json')
      expect(validate(read('fixtures/jitai-summary.sample.json')), JSON.stringify(validate.errors)).toBe(true)
    })
  })

  describe('シナリオ: 契約に反するデータ', () => {
    type StageLike = { schema_version: string; spots: { hourly: { shade_fraction: number }[] }[] } & Record<string, unknown>
    const stage = () => read('fixtures/stage.sample.json') as StageLike

    it('Given 日射遮蔽率が 1.2 の地点 / When 検証する / Then 不合格になる', () => {
      const data = stage()
      data.spots[0].hourly[12].shade_fraction = 1.2
      expect(validatorOf('stage.schema.json')(data)).toBe(false)
    })

    it('Given 知らないキーを含む / When 検証する / Then 不合格になる（綴りの誤りを読み飛ばさない）', () => {
      const data = stage()
      data.shade_fractoin = 0.5
      expect(validatorOf('stage.schema.json')(data)).toBe(false)
    })

    it('Given 未知の版 / When 検証する / Then 不合格になる', () => {
      const data = stage()
      data.schema_version = '2'
      expect(validatorOf('stage.schema.json')(data)).toBe(false)
    })
  })
})
