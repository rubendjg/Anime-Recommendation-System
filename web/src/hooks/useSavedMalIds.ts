import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_PREFIX = 'hanami.saved-mal-ids'
/** Pre–per-profile builds used this single key for everyone. */
const LEGACY_GLOBAL_KEY = 'hanami.saved-mal-ids'

function parseStored(raw: string | null): number[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is number => typeof x === 'number')
  } catch {
    return []
  }
}

function readStored(storageKey: string): number[] {
  const fromKey = parseStored(localStorage.getItem(storageKey))
  if (fromKey.length > 0) return fromKey
  const legacy = parseStored(localStorage.getItem(LEGACY_GLOBAL_KEY))
  if (legacy.length > 0) {
    localStorage.setItem(storageKey, JSON.stringify(legacy))
    localStorage.removeItem(LEGACY_GLOBAL_KEY)
    return legacy
  }
  return []
}

/**
 * Ordered list of saved anime (MAL ids), persisted per profile under
 * `hanami.saved-mal-ids.<profileKey>` (same idea as `useUserRatings`).
 */
export function useSavedMalIds(profileKey: string) {
  const storageKey = `${STORAGE_PREFIX}.${profileKey}`
  const [order, setOrder] = useState<number[]>(() => readStored(storageKey))

  useEffect(() => {
    setOrder(readStored(storageKey))
  }, [storageKey])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(order))
  }, [order, storageKey])

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
