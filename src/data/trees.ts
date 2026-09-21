// 街路樹データ（public/data/trees.json）をブラウザで扱う型付き配列に変換し、絞り込み・詳細取得を行う
import type { TreesColumnar } from '../../scripts/lib/parseTrees'
import { containsPoint } from '../lib/geo'
import type { Extent } from '../lib/projection'
import { estimateAnnualCo2Kg, estimateTreeAge, type AgeEstimate } from '../lib/simulation/trees'

export type TreeData = {
  count: number
  /** lon, lat の交互配列（deck.glの倍精度座標としてそのまま渡す） */
  positions: Float64Array
  height: Float32Array
  spread: Float32Array
  girth: Float32Array
  isTall: Uint8Array
  speciesIdx: Uint16Array
  wardIdx: Uint8Array
  routeIdx: Uint16Array
  dict: TreesColumnar['dict']
}

export type TreeRecord = {
  index: number
  species: string
  kind: '高木' | '中木'
  heightM: number
  spreadM: number | null
  girthCm: number | null
  ward: string
  route: string
  lon: number
  lat: number
  /** 回帰式のない樹種・幹周欠損は null */
  estimatedAge: AgeEstimate | null
  estimatedCo2KgPerYear: number | null
}

export const TREES_URL = `${import.meta.env.BASE_URL}data/trees.json`

export function toTreeData(json: TreesColumnar): TreeData {
  return {
    count: json.count,
    positions: Float64Array.from(json.positions),
    height: Float32Array.from(json.height),
    spread: Float32Array.from(json.spread),
    girth: Float32Array.from(json.girth),
    isTall: Uint8Array.from(json.isTall),
    speciesIdx: Uint16Array.from(json.speciesIdx),
    wardIdx: Uint8Array.from(json.wardIdx),
    routeIdx: Uint16Array.from(json.routeIdx),
    dict: json.dict,
  }
}

export async function loadTrees(signal?: AbortSignal): Promise<TreeData> {
  const res = await fetch(TREES_URL, { signal })
  if (!res.ok) throw new Error(`街路樹データの読み込みに失敗しました（HTTP ${res.status}）`)
  return toTreeData((await res.json()) as TreesColumnar)
}

/** 樹種ごとの本数（多い順） */
export function countBySpecies(data: TreeData): { species: string; count: number }[] {
  const counts = new Uint32Array(data.dict.species.length)
  for (let i = 0; i < data.count; i++) counts[data.speciesIdx[i]]++
  return data.dict.species.map((species, i) => ({ species, count: counts[i] })).sort((a, b) => b.count - a.count)
}

/** 表示対象=1, 非表示=0 のマスク（DataFilterExtensionのfilterValueとして使う） */
export function buildTreeMask(data: TreeData, speciesFilter: string[], wardFilter: string | null): Float32Array {
  const mask = new Float32Array(data.count)
  const speciesAllowed = speciesFilter.length > 0 ? new Set(speciesFilter.map((s) => data.dict.species.indexOf(s))) : null
  const wardIdx = wardFilter === null ? -1 : data.dict.wards.indexOf(wardFilter)
  for (let i = 0; i < data.count; i++) {
    const speciesOk = speciesAllowed === null || speciesAllowed.has(data.speciesIdx[i])
    const wardOk = wardFilter === null || data.wardIdx[i] === wardIdx
    mask[i] = speciesOk && wardOk ? 1 : 0
  }
  return mask
}

/**
 * 表示範囲内の街路樹の本数。絞り込み（mask）に合うものだけを数えるので、
 * 「表示中の街路樹」と同じ基準になる。tall は高木の本数（CO2の算定対象）
 */
export function countTreesInExtent(data: TreeData, mask: Float32Array, extent: Extent): { total: number; tall: number } {
  let total = 0
  let tall = 0
  for (let i = 0; i < data.count; i++) {
    if (mask[i] !== 1) continue
    if (!containsPoint(extent, data.positions[i * 2], data.positions[i * 2 + 1])) continue
    total++
    if (data.isTall[i] === 1) tall++
  }
  return { total, tall }
}

const orNull = (v: number) => (v >= 0 ? v : null)

export function getTreeRecord(data: TreeData, index: number): TreeRecord {
  const species = data.dict.species[data.speciesIdx[index]]
  const girth = data.girth[index]
  const isTall = data.isTall[index] === 1
  return {
    index,
    species,
    kind: isTall ? '高木' : '中木',
    heightM: data.height[index],
    spreadM: orNull(data.spread[index]),
    girthCm: orNull(girth),
    ward: data.dict.wards[data.wardIdx[index]],
    route: data.dict.routes[data.routeIdx[index]],
    lon: data.positions[index * 2],
    lat: data.positions[index * 2 + 1],
    estimatedAge: estimateTreeAge(girth, species),
    estimatedCo2KgPerYear: estimateAnnualCo2Kg(isTall),
  }
}
