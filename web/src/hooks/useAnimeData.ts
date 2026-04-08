import { useEffect, useMemo, useState } from 'react'
import type { Anime, RecommendationsFile } from '../types'

type Status = 'loading' | 'ready' | 'error'

function parsePosterOverrides(raw: unknown): Map<number, string> {
  const m = new Map<number, string>()
  if (!raw || typeof raw !== 'object') return m
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isFinite(id) || id <= 0) continue
    if (typeof v !== 'string' || !v.trim()) continue
    m.set(Math.floor(id), v.trim())
  }
  return m
}

function normalizeAnime(raw: unknown): Anime {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const mal = o.mal_id
  const mal_id =
    typeof mal === 'number' && Number.isFinite(mal)
      ? mal
      : typeof mal === 'string'
        ? Number(mal)
        : NaN
  const synopsisRaw = o.synopsis
  const synopsis =
    typeof synopsisRaw === 'string'
      ? synopsisRaw
      : synopsisRaw != null
        ? String(synopsisRaw)
        : ''
  return {
    mal_id: Number.isFinite(mal_id) ? mal_id : 0,
    name: typeof o.name === 'string' ? o.name : '',
    genres: typeof o.genres === 'string' ? o.genres : '',
    type: typeof o.type === 'string' ? o.type : '',
    episodes: typeof o.episodes === 'number' ? o.episodes : Number(o.episodes) || 0,
    score: typeof o.score === 'number' ? o.score : Number(o.score) || 0,
    members: typeof o.members === 'number' ? o.members : Number(o.members) || 0,
    synopsis,
    image_url:
      typeof o.image_url === 'string' && o.image_url.trim()
        ? o.image_url.trim()
        : undefined,
  }
}

export function useAnimeData() {
  const [status, setStatus] = useState<Status>('loading')
  const [catalog, setCatalog] = useState<Anime[]>([])
  const [recs, setRecs] = useState<RecommendationsFile | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [posterByMalId, setPosterByMalId] = useState<Map<number, string>>(
    () => new Map(),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cRes, rRes, pRes] = await Promise.all([
          fetch('/data/catalog.json'),
          fetch('/data/recommendations.json'),
          fetch('/data/posters.json'),
        ])
        if (!cRes.ok || !rRes.ok) {
          throw new Error('Failed to load data files')
        }
        const cJson = (await cRes.json()) as unknown
        const rJson = (await rRes.json()) as RecommendationsFile
        const posterMap = pRes.ok
          ? parsePosterOverrides(await pRes.json())
          : new Map<number, string>()
        const catalogArr = Array.isArray(cJson)
          ? cJson.map(normalizeAnime).map((a) => {
              const extra = posterMap.get(a.mal_id)
              if (!extra) return a
              if (a.image_url?.trim()) return a
              return { ...a, image_url: extra }
            })
          : []
        if (!cancelled) {
          setCatalog(catalogArr)
          setRecs(rJson)
          setPosterByMalId(posterMap)
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

  return { status, catalog, byId, recs, err, posterByMalId }
}
