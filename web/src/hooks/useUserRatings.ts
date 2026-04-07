import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'hanami.user-ratings'

type RatingsMap = Record<string, number>

function readStored(): RatingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: RatingsMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== 'number') continue
      const n = Number(v)
      if (!Number.isFinite(n)) continue
      out[k] = Math.max(0, Math.min(10, n))
    }
    return out
  } catch {
    return {}
  }
}

export function useUserRatings() {
  const [ratings, setRatings] = useState<RatingsMap>(readStored)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings))
  }, [ratings])

  const ratingsByMalId = useMemo(() => {
    const m = new Map<number, number>()
    for (const [k, v] of Object.entries(ratings)) {
      const id = Number(k)
      if (Number.isFinite(id)) m.set(id, v)
    }
    return m
  }, [ratings])

  const setUserRating = useCallback((malId: number, rating: number) => {
    const clamped = Math.max(0, Math.min(10, rating))
    setRatings((prev) => ({ ...prev, [String(malId)]: clamped }))
  }, [])

  const clearUserRating = useCallback((malId: number) => {
    setRatings((prev) => {
      const next = { ...prev }
      delete next[String(malId)]
      return next
    })
  }, [])

  return { ratingsByMalId, setUserRating, clearUserRating }
}