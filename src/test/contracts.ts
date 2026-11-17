// テスト用：データ契約 v1 のスキーマ（contracts/）で JSON を検証する。
// jsdom では import.meta.url が使えないため、リポジトリ直下（テストの実行場所）から読む
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'

export const readJson = (...path: string[]): unknown => JSON.parse(readFileSync(join(process.cwd(), ...path), 'utf-8'))

/** スキーマの format: "date"（YYYY-MM-DD）を Ajv に教える（ajv-formats を足さずに済ませる） */
export const contractValidator = (schemaFile: 'stage.schema.json' | 'dispatch.schema.json') =>
  new Ajv2020({ allErrors: true, formats: { date: /^\d{4}-\d{2}-\d{2}$/ } }).compile(readJson('contracts', schemaFile) as object)
