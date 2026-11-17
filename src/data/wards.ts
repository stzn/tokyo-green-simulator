// 区の境界データ（public/data/wards.geojson）の読み込み。現在地ミニマップの表示専用
import { BASE_URL } from '../config/baseUrl'
import type { Geometry } from '../lib/geo'

export type WardFeature = {
  type: 'Feature'
  geometry: Geometry
  properties: { name: string }
}

export const WARDS_URL = `${BASE_URL}data/wards.geojson`

export async function loadWards(signal?: AbortSignal): Promise<WardFeature[]> {
  const res = await fetch(WARDS_URL, { signal })
  if (!res.ok) throw new Error(`区境界データの読み込みに失敗しました（HTTP ${res.status}）`)
  const json = (await res.json()) as { features: WardFeature[] }
  return json.features
}
