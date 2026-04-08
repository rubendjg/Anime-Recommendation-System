import { useEffect, useMemo, useState } from 'react'
import type { Anime, RecommendationsFile } from '../types'

type Status = 'loading' | 'ready' | 'error'

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
        const rJson = (await rRes.json()) as RecommendationsFile
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
