import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('機能: 値の変化を落ち着くまで待つ', () => {
  it('Given 初期値 / Then 待たずにそのまま返す', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 200))
    expect(result.current).toBe('a')
  })

  it('Given 値が変わった / When 待ち時間が経つ前 / Then 古い値のまま', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    act(() => void vi.advanceTimersByTime(199))
    expect(result.current).toBe('a')
  })

  it('Given 値が変わった / When 待ち時間が経つ / Then 新しい値になる', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    act(() => void vi.advanceTimersByTime(200))
    expect(result.current).toBe('b')
  })

  it('Given 待ち時間の途中で値が続けて変わる（地図をパン中） / Then 最後の値だけが反映される', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 200), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    act(() => void vi.advanceTimersByTime(150))
    rerender({ v: 'c' })
    act(() => void vi.advanceTimersByTime(150))
    expect(result.current).toBe('a')
    act(() => void vi.advanceTimersByTime(50))
    expect(result.current).toBe('c')
  })
})
