import { describe, expect, it } from 'vitest'
import { CONTEXT_COLUMNS, parseMeasurementLog, toCsvWithContext } from './measurementLog'

const header = 'timestamp,location,lat,lon,environment,hrv_sdnn,heart_rate,notes'

describe('機能: 計測ログCSVを読み込む', () => {
  it('Given 全列そろったCSV / When 読み込む / Then 1行が1件の計測になる', () => {
    const { records, errors } = parseMeasurementLog(`${header}\n2026-09-24 12:30,紀尾井町緑地,35.679,139.737,Green,58,68,日陰`)
    expect(errors).toEqual([])
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      timestamp: '2026-09-24 12:30',
      location: '紀尾井町緑地',
      lat: 35.679,
      lon: 139.737,
      environment: 'Green',
      hrvSdnn: 58,
      heartRate: 68,
      notes: '日陰',
    })
  })

  it('Given 列の並びが違うCSV / When 読み込む / Then ヘッダー名で判定する', () => {
    const { records } = parseMeasurementLog('lon,lat,location,timestamp\n139.737,35.679,A,2026-09-24 12:30')
    expect(records[0]).toMatchObject({ lat: 35.679, lon: 139.737, location: 'A' })
  })

  it('Given BOMとCRLFのCSV / When 読み込む / Then 正しく読める', () => {
    const { records, errors } = parseMeasurementLog(`﻿${header}\r\n2026-09-24 12:30,A,35.679,139.737,Green,58,68,\r\n`)
    expect(errors).toEqual([])
    expect(records).toHaveLength(1)
  })

  it('Given カンマと改行を含む引用符つきの値 / When 読み込む / Then 1つの値として読む', () => {
    const { records } = parseMeasurementLog(`${header}\n2026-09-24 12:30,"A, B",35.679,139.737,Green,58,68,"1行目\n2行目 ""引用"""`)
    expect(records[0].location).toBe('A, B')
    expect(records[0].notes).toBe('1行目\n2行目 "引用"')
  })

  it('Given HRVと心拍が空 / When 読み込む / Then nullになる', () => {
    const { records } = parseMeasurementLog(`${header}\n2026-09-24 12:30,A,35.679,139.737,Green,,,`)
    expect(records[0].hrvSdnn).toBeNull()
    expect(records[0].heartRate).toBeNull()
  })

  it('Given 任意列が無いCSV / When 読み込む / Then 必須列だけで読める', () => {
    const { records, errors } = parseMeasurementLog('timestamp,location,lat,lon\n2026-09-24 12:30,A,35.679,139.737')
    expect(errors).toEqual([])
    expect(records[0].environment).toBe('')
    expect(records[0].hrvSdnn).toBeNull()
  })

  it('Given lat列が無いCSV / When 読み込む / Then 必須列の不足をエラーで返す', () => {
    const { records, errors } = parseMeasurementLog('timestamp,location,lon\n2026-09-24 12:30,A,139.737')
    expect(records).toEqual([])
    expect(errors[0].message).toContain('lat')
  })

  it('Given 緯度が数値でない行 / When 読み込む / Then その行だけ行番号つきでエラーにし、ほかの行は読む', () => {
    const { records, errors } = parseMeasurementLog(`${header}\n2026-09-24 12:30,A,abc,139.737,Green,58,68,\n2026-09-24 12:40,B,35.679,139.737,Urban,40,70,`)
    expect(records.map((r) => r.location)).toEqual(['B'])
    expect(errors).toEqual([{ line: 2, message: expect.stringContaining('緯度') }])
  })

  it('Given 東京から遠く離れた座標（緯度と経度の取り違えなど） / When 読み込む / Then エラーにする', () => {
    const { records, errors } = parseMeasurementLog(`${header}\n2026-09-24 12:30,A,139.737,35.679,Green,58,68,`)
    expect(records).toEqual([])
    expect(errors[0].line).toBe(2)
  })

  it('Given 空行だけの行 / When 読み込む / Then 無視する', () => {
    const { records, errors } = parseMeasurementLog(`${header}\n\n2026-09-24 12:30,A,35.679,139.737,Green,58,68,\n\n`)
    expect(errors).toEqual([])
    expect(records).toHaveLength(1)
  })

  it('Given 空のファイル / When 読み込む / Then エラーを返す', () => {
    const { records, errors } = parseMeasurementLog('')
    expect(records).toEqual([])
    expect(errors).toHaveLength(1)
  })
})

describe('機能: 緑の文脈つきCSVを書き出す', () => {
  const context = {
    trees: { total: 12, tall: 9 },
    cityTrees: { routes: 2, count: 30 },
    parks: { count: 1, areaM2: 5000 },
    nearestParkM: 0,
    inPark: true,
  }

  it('Given 計測1件と文脈 / When 書き出す / Then 元の列の後ろに文脈の列が付く', () => {
    const { records } = parseMeasurementLog(`${header}\n2026-09-24 12:30,A,35.679,139.737,Green,58,68,メモ`)
    const [head, row] = toCsvWithContext(records, [context], 100).trim().split('\n')
    expect(head).toBe(`${header},${CONTEXT_COLUMNS.join(',')}`)
    expect(row).toBe('2026-09-24 12:30,A,35.679,139.737,Green,58,68,メモ,100,12,9,2,30,1,5000,0,true')
  })

  it('Given 元のCSVにあった余分な列 / When 書き出す / Then そのまま通す', () => {
    const { records } = parseMeasurementLog('timestamp,location,lat,lon,weather\n2026-09-24 12:30,A,35.679,139.737,晴れ')
    const [head, row] = toCsvWithContext(records, [context], 100).trim().split('\n')
    expect(head.startsWith('timestamp,location,lat,lon,weather,')).toBe(true)
    expect(row.startsWith('2026-09-24 12:30,A,35.679,139.737,晴れ,')).toBe(true)
  })

  it('Given カンマ・引用符・改行を含む値 / When 書き出す / Then CSVとして正しくエスケープする', () => {
    const { records } = parseMeasurementLog(`${header}\n2026-09-24 12:30,"A, B",35.679,139.737,Green,58,68,"引用""符"""`)
    const csv = toCsvWithContext(records, [context], 100)
    expect(parseMeasurementLog(csv.split('\n').slice(0, 2).join('\n')).records[0].location).toBe('A, B')
    expect(csv).toContain('"A, B"')
    expect(csv).toContain('"引用""符"""')
  })

  it('Given 文脈が計算できていない（データ読み込み中） / When 書き出す / Then 文脈の列は空にする', () => {
    const { records } = parseMeasurementLog(`${header}\n2026-09-24 12:30,A,35.679,139.737,Green,58,68,`)
    const [, row] = toCsvWithContext(records, [null], 100).trim().split('\n')
    expect(row).toBe('2026-09-24 12:30,A,35.679,139.737,Green,58,68,,100,,,,,,,,')
  })

  it('Given 表計算ソフトで式として解釈される値（=や+で始まる） / When 書き出す / Then 先頭にシングルクオートを付けて式にしない', () => {
    const { records } = parseMeasurementLog(`${header}\n2026-09-24 12:30,=SUM(A1),35.679,139.737,Green,58,68,+cmd`)
    const csv = toCsvWithContext(records, [context], 100)
    expect(csv).toContain("'=SUM(A1)")
    expect(csv).toContain("'+cmd")
  })
})
