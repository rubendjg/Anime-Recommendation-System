import { useMemo, useState } from 'react'
import { ContentRow } from './components/ContentRow'
import { DetailModal } from './components/DetailModal'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { useAnimeData } from './hooks/useAnimeData'
import type { Anime } from './types'

function norm(s: string) {
  return s.toLowerCase().trim()
}

function matchesQuery(anime: Anime, q: string) {
  if (!q) return false
  const n = norm(q)
  return (
    norm(anime.name).includes(n) ||
    norm(anime.genres).includes(n) ||
    norm(anime.type).includes(n)
  )
}

function genreHas(anime: Anime, g: string) {
  return norm(anime.genres).includes(norm(g))
}

export default function App() {
  const { status, catalog, byId, recs, err } = useAnimeData()
  const [userId, setUserId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Anime | null>(null)

  const effectiveUserId =
    userId ??
    recs?.defaultUserId ??
    (recs ? Object.keys(recs.users)[0] : null)

  const profile = effectiveUserId ? recs?.users[effectiveUserId] : undefined

  const predictedMap = useMemo(() => {
    const m = new Map<number, number>()
    if (!profile) return m
    for (const e of profile.forYou) m.set(e.mal_id, e.predicted_rating)
    return m
  }, [profile])

  const forYouList = useMemo(() => {
    if (!profile) return []
    const out: Anime[] = []
    for (const e of profile.forYou) {
      const a = byId.get(e.mal_id)
      if (a) out.push(a)
    }
    return out
  }, [profile, byId])

  const spotlightSlides = useMemo(() => {
    if (catalog.length === 0) return []
    const seen = new Set<number>()
    const out: { anime: Anime; predictedRating?: number }[] = []
    const push = (a: (typeof catalog)[0] | undefined) => {
      if (!a || seen.has(a.mal_id)) return
      seen.add(a.mal_id)
      out.push({
        anime: a,
        predictedRating: predictedMap.get(a.mal_id),
      })
    }
    if (recs) {
      const featured = byId.get(recs.featuredMalId)
      push(featured)
    }
    for (const a of forYouList) push(a)
    if (out.length === 0) push(catalog[0])
    return out.slice(0, 10)
  }, [recs, byId, forYouList, catalog, predictedMap])

  const searchHits = useMemo(() => {
    if (!query.trim()) return []
    return catalog.filter((a) => matchesQuery(a, query)).slice(0, 24)
  }, [catalog, query])

  const trending = useMemo(() => {
    return [...catalog].sort((a, b) => b.members - a.members).slice(0, 16)
  }, [catalog])

  const topRated = useMemo(() => {
    return [...catalog].sort((a, b) => b.score - a.score).slice(0, 16)
  }, [catalog])

  const actionPicks = useMemo(() => {
    return catalog.filter((a) => genreHas(a, 'action')).slice(0, 16)
  }, [catalog])

  const dramaPicks = useMemo(() => {
    return catalog.filter((a) => genreHas(a, 'drama')).slice(0, 16)
  }, [catalog])

  const profileOptions = recs
    ? Object.entries(recs.users).map(([id, u]) => ({
        id,
        label: u.displayName,
      }))
    : []

  if (status === 'loading') {
    return (
      <div className="app-shell app-shell--center">
        <p className="muted">Loading your queue…</p>
      </div>
    )
  }

  if (status === 'error' || !recs) {
    return (
      <div className="app-shell app-shell--center">
        <p className="error-msg">{err ?? 'Could not load app data.'}</p>
      </div>
    )
  }

  const openSelectedPred =
    selected && predictedMap.has(selected.mal_id)
      ? predictedMap.get(selected.mal_id)
      : undefined

  return (
    <div className="app-shell" id="home">
      <Header
        query={query}
        onQuery={setQuery}
        profiles={profileOptions}
        userId={effectiveUserId ?? profileOptions[0]?.id ?? ''}
        onUserId={setUserId}
        userLabel={profile?.displayName ?? effectiveUserId ?? 'Profile'}
      />
      <main className="app-main">
        <Hero
          slides={spotlightSlides}
          onOpenDetails={(anime) => setSelected(anime)}
        />
        <div className="rows-wrap">
          <ContentRow
            title="Matched to your taste"
            items={forYouList}
            predictedByMalId={predictedMap}
            onOpen={setSelected}
          />
          {searchHits.length > 0 && (
            <ContentRow
              title={`Results for “${query.trim()}”`}
              items={searchHits}
              predictedByMalId={predictedMap}
              onOpen={setSelected}
            />
          )}
          <ContentRow
            title="Crowd favorites"
            items={trending}
            onOpen={setSelected}
          />
          <ContentRow
            title="Highest scores"
            items={topRated}
            onOpen={setSelected}
          />
          <ContentRow
            title="Action & spectacle"
            items={actionPicks}
            onOpen={setSelected}
          />
          <ContentRow title="Drama & heart" items={dramaPicks} onOpen={setSelected} />
        </div>
      </main>
      <footer className="app-footer">
        <p>
          Demo UI — replace <code>public/data/*.json</code> with exports from
          your modeling pipeline.
        </p>
      </footer>
      <DetailModal
        anime={selected}
        predictedRating={openSelectedPred}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
