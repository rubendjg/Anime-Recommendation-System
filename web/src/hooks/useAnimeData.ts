import { useEffect, useMemo, useState } from 'react'
import type { Anime, ModelKey, RecommendationsFile } from '../types'

type Status = 'loading' | 'ready' | 'error'
const FALLBACK_MODEL_ORDER: ModelKey[] = ['hybrid', 'cf', 'content', 'popular', 'random']

function prettyModelName(k: ModelKey) {
  if (k === 'cf') return 'Collaborative Filtering'
  if (k === 'content') return 'Content-Based'
  if (k === 'hybrid') return 'Hybrid'
  if (k === 'popular') return 'Popular'
  return 'Random'
}

function normalizeRecommendations(raw: unknown, catalog: Anime[]): RecommendationsFile {
  const validIds = new Set(catalog.map((a) => a.mal_id))
  const catalogFallback = catalog.slice(0, 10).map((a, i) => ({
    mal_id: a.mal_id,
    predicted_rating: Math.max(0, 8.5 - i * 0.1),
  }))
  const fallbackByModel = Object.fromEntries(
    FALLBACK_MODEL_ORDER.map((k) => [k, { label: prettyModelName(k), forYou: catalogFallback }]),
  ) as RecommendationsFile['users'][string]['models']

  const input = (raw ?? {}) as Partial<RecommendationsFile> & {
    users?: Record<string, unknown>
  }
  const sourceUsers = input.users ?? {}
  const users: RecommendationsFile['users'] = {}

  for (const [userKey, userValue] of Object.entries(sourceUsers)) {
    const sourceProfile = (userValue ?? {}) as {
      displayName?: string
      sourceUserId?: number
      history?: unknown[]
      models?: Record<string, { label?: string; forYou?: unknown[] }>
    }

    const models = { ...fallbackByModel }
    const sourceModels = sourceProfile.models ?? {}
    const seenHistory = new Set<number>()
    const cleanedHistory = (Array.isArray(sourceProfile.history) ? sourceProfile.history : [])
      .map((entry) => {
        const v = (entry ?? {}) as { mal_id?: number; rating?: number }
        const mal_id = Number(v.mal_id)
        const rating = Number(v.rating)
        if (!Number.isFinite(mal_id) || !validIds.has(mal_id) || seenHistory.has(mal_id)) {
          return null
        }
        seenHistory.add(mal_id)
        return {
          mal_id,
          rating: Number.isFinite(rating) ? rating : 0,
        }
      })
      .filter((x): x is { mal_id: number; rating: number } => Boolean(x))

    for (const k of FALLBACK_MODEL_ORDER) {
      const sourceModel = sourceModels[k]
      const sourceList = Array.isArray(sourceModel?.forYou) ? sourceModel.forYou : []
      const seen = new Set<number>()
      const cleaned = sourceList
        .map((entry) => {
          const v = (entry ?? {}) as { mal_id?: number; predicted_rating?: number }
          const mal_id = Number(v.mal_id)
          const predicted_rating = Number(v.predicted_rating)
          if (!Number.isFinite(mal_id) || !validIds.has(mal_id) || seen.has(mal_id)) return null
          seen.add(mal_id)
          return {
            mal_id,
            predicted_rating: Number.isFinite(predicted_rating) ? predicted_rating : 0,
          }
        })
        .filter((x): x is { mal_id: number; predicted_rating: number } => Boolean(x))

      if (cleaned.length > 0) {
        models[k] = {
          label: sourceModel?.label?.trim() || prettyModelName(k),
          forYou: cleaned,
        }
      }
    }

    users[userKey] = {
      displayName: sourceProfile.displayName?.trim() || userKey,
      sourceUserId: sourceProfile.sourceUserId,
      history: cleanedHistory,
      models,
    }
  }

  if (Object.keys(users).length === 0) {
    users['viewer-a'] = {
      displayName: 'Viewer A',
      models: { ...fallbackByModel },
    }
  }

  const userIds = Object.keys(users)
  const defaultUserId = input.defaultUserId && users[input.defaultUserId] ? input.defaultUserId : userIds[0]
  const modelOrder =
    input.modelOrder && input.modelOrder.length > 0 ? input.modelOrder : FALLBACK_MODEL_ORDER
  const defaultModelKey =
    input.defaultModelKey && modelOrder.includes(input.defaultModelKey)
      ? input.defaultModelKey
      : modelOrder[0]
  const featuredMalId =
    input.featuredMalId && validIds.has(input.featuredMalId)
      ? input.featuredMalId
      : users[defaultUserId].models[defaultModelKey]?.forYou[0]?.mal_id ?? catalog[0]?.mal_id ?? 1

  return {
    defaultUserId,
    defaultModelKey,
    featuredMalId,
    modelOrder,
    users,
  }
}

export function useAnimeData() {
  const [status, setStatus] = useState<Status>('loading')
  const [catalog, setCatalog] = useState<Anime[]>([])
  const [recs, setRecs] = useState<RecommendationsFile | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cRes, rRes] = await Promise.all([
          fetch('/data/catalog.json'),
          fetch('/data/recommendations.json'),
        ])
        if (!cRes.ok || !rRes.ok) {
          throw new Error('Failed to load data files')
        }
        const cJson = (await cRes.json()) as Anime[]
        const rJsonRaw = await rRes.json()
        const rJson = normalizeRecommendations(rJsonRaw, cJson)
        if (!cancelled) {
          setCatalog(cJson)
          setRecs(rJson)
          setStatus('ready')
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Unknown error')
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const byId = useMemo(() => {
    const m = new Map<number, Anime>()
    for (const a of catalog) m.set(a.mal_id, a)
    return m
  }, [catalog])

  return { status, catalog, byId, recs, err }
}
