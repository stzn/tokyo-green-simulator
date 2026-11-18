import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dispatchHours, parseDispatch, parseJson, parseStage, petCategory, snapshotAt, type Dispatch, type Stage } from './dispatch'

// jsdom では import.meta.url が使えないため、リポジトリ直下（テストの実行場所）から読む
const read = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(process.cwd(), 'contracts', 'fixtures', name), 'utf-8')) as Record<string, unknown>

type DispatchLike = {
  stage_ref: { area_id: string; date: string }
  pods: { id: string; timeline: { hour: number; spot_id: string; action: string; plant_health: number }[] }[]
  comfort: { spot_id: string; hour: number; pet_c: number; pods_present: number }[]
} & Record<string, unknown>
type StageLike = { spots: { id: string; capacity_pods: number; hourly: { hour: number }[] }[] } & Record<string, unknown>

const rawStage = () => read('stage.sample.json') as StageLike
const rawDispatch = () => read('dispatch.sample.json') as DispatchLike

const sampleStage = (): Stage => {
  const r = parseStage(rawStage())
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.value
}
const sampleDispatch = (): Dispatch => {
  const r = parseDispatch(rawDispatch(), sampleStage())
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.value
}

describe('機能: JSON の文字列を読む', () => {
  it('Given 正しい JSON / When 読む / Then 値を返す', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('Given 壊れた JSON / When 読む / Then 例外にせず、理由を返す', () => {
    const r = parseJson('{"a":')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch('JSON として読めません')
  })
})

describe('機能: 地点データ（stage.json）を読み込む', () => {
  it('Given 契約確認用のサンプル / When 読み込む / Then 3 地点の地点データになる', () => {
    const r = parseStage(rawStage())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.spots.map((s) => s.id)).toEqual(['OTM-001', 'OTM-002', 'OTM-003'])
  })

  it('Given 形が契約に合わない（知らないキー） / When 読み込む / Then 例外にせず、場所つきの理由を返す', () => {
    const data = rawStage()
    data.spotz = []
    const r = parseStage(data)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch('spotz')
  })

  it('Given オブジェクトでない値 / When 読み込む / Then 理由を返す', () => {
    expect(parseStage(null).ok).toBe(false)
    expect(parseStage('stage').ok).toBe(false)
  })

  it('Given 地点 ID が重複 / When 読み込む / Then 重複を理由に不合格', () => {
    const data = rawStage()
    data.spots[1].id = 'OTM-001'
    const r = parseStage(data)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch(/地点 ID が重複.*OTM-001/)
  })

  it('Given 地点の hourly の時刻が重複 / When 読み込む / Then 不合格', () => {
    const data = rawStage()
    data.spots[0].hourly[1].hour = 0
    const r = parseStage(data)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch(/OTM-001.*時刻が重複/)
  })
})

describe('機能: 配車（dispatch.json）を読み込む', () => {
  describe('シナリオ: 契約に合う配車', () => {
    it('Given サンプルの地点データと配車 / When 読み込む / Then 2 台のポッドの配車になる', () => {
      const r = parseDispatch(rawDispatch(), sampleStage())
      expect(r.ok, r.ok ? '' : r.errors.join('\n')).toBe(true)
      if (r.ok) expect(r.value.pods.map((p) => p.id)).toEqual(['P1', 'P2'])
    })

    it('Given comfort を省いた配車 / When 読み込む / Then 空の快適度として読む', () => {
      const data = rawDispatch()
      delete (data as Record<string, unknown>).comfort
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.comfort).toEqual([])
    })
  })

  describe('シナリオ: JSON Schema で弾く', () => {
    it('Given 未知の版 / When 読み込む / Then 不合格', () => {
      const data = rawDispatch()
      data.schema_version = '2'
      expect(parseDispatch(data, sampleStage()).ok).toBe(false)
    })

    it('Given 知らない行動 / When 読み込む / Then 不合格', () => {
      const data = rawDispatch()
      data.pods[0].timeline[0].action = 'fly'
      expect(parseDispatch(data, sampleStage()).ok).toBe(false)
    })

    it('Given 日付の形でない date / When 読み込む / Then 不合格', () => {
      const data = rawDispatch()
      data.stage_ref.date = '2025/08/30'
      expect(parseDispatch(data, sampleStage()).ok).toBe(false)
    })
  })

  describe('シナリオ: 地点データと食い違う（JSON Schema では表せない）', () => {
    it('Given 区域が違う / When 読み込む / Then 区域の食い違いを理由に不合格', () => {
      const data = rawDispatch()
      data.stage_ref.area_id = 'shinjuku'
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch(/区域が違う.*shinjuku.*otemachi/)
    })

    it('Given 日付が違う / When 読み込む / Then 日付の食い違いを理由に不合格', () => {
      const data = rawDispatch()
      data.stage_ref.date = '2025-08-31'
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch('日付が違う')
    })

    it('Given 地点データにない地点へのポッド / When 読み込む / Then ポッドと時刻つきで不合格', () => {
      const data = rawDispatch()
      data.pods[0].timeline[0].spot_id = 'OTM-999'
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch(/地点データにない地点.*P1.*11 時.*OTM-999/)
    })

    it('Given 地点データにない地点の快適度 / When 読み込む / Then 不合格', () => {
      const data = rawDispatch()
      data.comfort[0].spot_id = 'OTM-999'
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch(/地点データにない地点の快適度.*OTM-999/)
    })

    it('Given 容量 1 の地点に同じ時刻 2 台 / When 読み込む / Then 容量超過を理由に不合格', () => {
      const data = rawDispatch()
      // OTM-003 の容量は 1。11 時に P1 が居るところへ P2 も置く
      data.pods[1].timeline[0].spot_id = 'OTM-003'
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch(/容量超過.*OTM-003.*11 時.*2 台.*容量 1/)
    })

    it('Given 容量ちょうど（容量 2 の地点に 2 台） / When 読み込む / Then 合格', () => {
      const data = rawDispatch()
      // OTM-001 の容量は 2。12 時に P1 が居るところへ P2 も置く
      data.pods[1].timeline[1].spot_id = 'OTM-001'
      expect(parseDispatch(data, sampleStage()).ok).toBe(true)
    })

    it('Given ポッド ID が重複 / When 読み込む / Then 不合格', () => {
      const data = rawDispatch()
      data.pods[1].id = 'P1'
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch(/ポッド ID が重複.*P1/)
    })

    it('Given 1 台のポッドで時刻が重複 / When 読み込む / Then 不合格', () => {
      const data = rawDispatch()
      data.pods[0].timeline[1].hour = 11
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch(/ポッド P1 の時刻が重複.*11/)
    })

    it('Given 同じ地点・時刻の快適度が 2 件 / When 読み込む / Then どちらを描くか決められないので不合格', () => {
      const data = rawDispatch()
      data.comfort[1].spot_id = 'OTM-001'
      const r = parseDispatch(data, sampleStage())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join()).toMatch(/快適度が重複.*OTM-001.*12 時/)
    })
  })
})

describe('機能: 時刻ごとの表示データ', () => {
  it('Given サンプルの配車 / When 時刻の一覧を取る / Then データのある時刻を昇順で返す', () => {
    expect(dispatchHours(sampleDispatch())).toEqual([11, 12, 13, 14])
  })

  it('Given 12 時 / When 表示データにする / Then 各ポッドを地点データの地点の座標に置き、行動と健康度を添える', () => {
    const { pods } = snapshotAt(sampleStage(), sampleDispatch(), 12)
    expect(pods).toEqual([
      { podId: 'P1', spotId: 'OTM-001', spotName: '大手町 仲通り北の歩道', lon: 139.7652, lat: 35.6872, action: 'move', plantHealth: 95.5, slot: 0 },
      expect.objectContaining({ podId: 'P2', spotId: 'OTM-002', lon: 139.7651, lat: 35.6812, action: 'stay', slot: 0 }),
    ])
  })

  it('Given 12 時 / When 表示データにする / Then 地点ごとの PET を座標つきで返す', () => {
    const { comfort } = snapshotAt(sampleStage(), sampleDispatch(), 12)
    expect(comfort).toHaveLength(3)
    expect(comfort[0]).toEqual({ spotId: 'OTM-001', spotName: '大手町 仲通り北の歩道', lon: 139.7652, lat: 35.6872, petC: 38.5, podsPresent: 1 })
  })

  it('Given データの無い時刻（3 時） / When 表示データにする / Then ポッドも快適度も空', () => {
    expect(snapshotAt(sampleStage(), sampleDispatch(), 3)).toEqual({ pods: [], comfort: [] })
  })

  it('Given 同じ地点・時刻に 2 台 / When 表示データにする / Then 重ならないよう 0, 1 と順番（slot）を振る', () => {
    const data = rawDispatch()
    data.pods[1].timeline[1].spot_id = 'OTM-001'
    const r = parseDispatch(data, sampleStage())
    if (!r.ok) throw new Error(r.errors.join())
    const { pods } = snapshotAt(sampleStage(), r.value, 12)
    expect(pods.map((p) => [p.podId, p.spotId, p.slot])).toEqual([
      ['P1', 'OTM-001', 0],
      ['P2', 'OTM-001', 1],
    ])
  })
})

describe('機能: PET の快適度の区分', () => {
  it.each([
    [21, 'comfortable'],
    [23, 'comfortable'],
    [26, 'slightlyWarm'],
    [31.2, 'warm'],
    [38.5, 'hot'],
    [45, 'veryHot'],
    [10, 'cool'],
  ])('Given PET %s ℃ / When 区分する / Then %s', (petC, key) => {
    expect(petCategory(petC).key).toBe(key)
  })

  it('Given 暑さの段階が違う PET / When 区分する / Then 色が違う', () => {
    expect(petCategory(31).color).not.toEqual(petCategory(38).color)
  })
})
