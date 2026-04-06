import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'hanami.saved-mal-ids'

function readStored(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is number => typeof x === 'number')
  } catch {
    return []
  }
}

/**
 * Ordered list of saved anime (MAL ids), persisted in localStorage.
 */
export function useSavedMalIds() {
  const [order, setOrder] = useState<number[]>(readStored)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  }, [order])

  const savedSet = useMemo(() => new Set(order), [order])

  const isSaved = useCallback((malId: number) => savedSet.has(malId), [savedSet])

  const toggleSave = useCallback((malId: number) => {
    setOrder((prev) => {
      const i = prev.indexOf(malId)
      if (i >= 0) return prev.filter((id) => id !== malId)
      return [malId, ...prev]
    })
  }, [])

  return { savedMalIds: order, savedSet, isSaved, toggleSave }
}
