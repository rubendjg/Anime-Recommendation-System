import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UserRatingEntry } from '../types'

const STORAGE_PREFIX = 'hanami.user-ratings'

type RatingsMap = Record<string, number>

function clampRating(n: number) {
  return Math.max(0, Math.min(10, n))
}

function readStored(storageKey: string): RatingsMap {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: RatingsMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== 'number') continue
      const n = Number(v)
      if (!Number.isFinite(n)) continue
      out[k] = clampRating(n)
    }
    return out
  } catch {
    return {}
  }
}

function mapFromSeed(seed: UserRatingEntry[]): RatingsMap {
  const out: RatingsMap = {}
  for (const r of seed) {
    out[String(r.mal_id)] = clampRating(r.rating)
  }
  return out
}

/**
 * Per-profile ratings persisted under `hanami.user-ratings.<profileKey>`.
 * When storage is empty for that key, initializes from `seedRatings` (export from DB).
 */
export function useUserRatings(
  profileKey: string,
  seedRatings: UserRatingEntry[] | undefined,
) {
  const storageKey = `${STORAGE_PREFIX}.${profileKey}`
  const seedRef = useRef(seedRatings)
  seedRef.current = seedRatings

  const [ratings, setRatings] = useState<RatingsMap>(() => {
    const stored = readStored(storageKey)
    if (Object.keys(stored).length > 0) return stored
    if (seedRatings?.length) return mapFromSeed(seedRatings)
    return {}
  })

  useEffect(() => {
    const stored = readStored(storageKey)
    if (Object.keys(stored).length > 0) {
      setRatings(stored)
      return
    }
    const seed = seedRef.current
    if (seed?.length) {
      setRatings(mapFromSeed(seed))
    } else {
      setRatings({})
    }
  }, [profileKey, storageKey])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(ratings))
  }, [ratings, storageKey])

  const ratingsByMalId = useMemo(() => {
    const m = new Map<number, number>()
    for (const [k, v] of Object.entries(ratings)) {
      const id = Number(k)
      if (Number.isFinite(id)) m.set(id, v)
    }
    return m
  }, [ratings])

  const setUserRating = useCallback((malId: number, rating: number) => {
    const clamped = clampRating(rating)
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
