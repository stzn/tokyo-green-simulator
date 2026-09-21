import { useEffect, useState } from 'react'

/** 値の変化が delayMs 止まってから反映する（地図をパン・ズーム中に毎フレーム集計しないため） */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
