import { useCallback, useMemo, useState } from 'react'
import { ContentRow } from './components/ContentRow'
import { DetailModal } from './components/DetailModal'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { useAnimeData } from './hooks/useAnimeData'
import { useSavedMalIds } from './hooks/useSavedMalIds'
import type { Anime } from './types'

function norm(s: string) {
  return s.toLowerCase().trim()
}

function matchesQuery(anime: Anime, q: string) {
  if (!q) return true
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

/** Below this count, Saved shows each title once; at or above, use the same infinite strip as other rows. */
const SAVED_INFINITE_LOOP_MIN = 5
const TAB_FX_MS = 620

export default function App() {
  const { status, catalog, byId, recs, err } = useAnimeData()
  const { savedMalIds, isSaved, toggleSave } = useSavedMalIds()
  const [userId, setUserId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'discover' | 'saved'>('discover')
  const [tabFx, setTabFx] = useState<'discover' | 'saved' | null>(null)
  const [selected, setSelected] = useState<Anime | null>(null)

  const onToggleSaveAnime = useCallback(
    (a: Anime) => {
      toggleSave(a.mal_id)
    },
    [toggleSave],
  )

  const savedList = useMemo(() => {
    const out: Anime[] = []
    for (const id of savedMalIds) {
      const a = byId.get(id)
      if (a) out.push(a)
    }
    return out
  }, [savedMalIds, byId])

  const typeOptions = useMemo(
    () => Array.from(new Set(catalog.map((a) => a.type))).sort(),
    [catalog],
  )

  const genreOptions = useMemo(() => {
    const s = new Set<string>()
    for (const a of catalog) {
      for (const g of a.genres.split(',')) {
        const t = g.trim()
        if (t) s.add(t)
      }
    }
    return Array.from(s).sort()
  }, [catalog])

  const applyFilters = useCallback(
    (a: Anime) => {
      if (!matchesQuery(a, query)) return false
      if (typeFilter && norm(a.type) !== norm(typeFilter)) return false
      if (genreFilter && !genreHas(a, genreFilter)) return false
      if (activeTab === 'saved' && !isSaved(a.mal_id)) return false
      return true
    },
    [query, typeFilter, genreFilter, activeTab, isSaved],
  )

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

  const searchHits = useMemo(() => catalog.filter(applyFilters), [catalog, applyFilters])
  const hasSearchQuery = Boolean(query.trim())
  const isFilteringActive = Boolean(
    query.trim() || typeFilter || genreFilter || activeTab === 'saved',
  )

  const trending = useMemo(
    () =>
      [...catalog]
        .sort((a, b) => b.members - a.members)
        .filter(applyFilters)
        .slice(0, 16),
    [catalog, applyFilters],
  )

  const topRated = useMemo(
    () =>
      [...catalog]
        .sort((a, b) => b.score - a.score)
        .filter(applyFilters)
        .slice(0, 16),
    [catalog, applyFilters],
  )

  const actionPicks = useMemo(
    () => catalog.filter((a) => genreHas(a, 'action')).filter(applyFilters).slice(0, 16),
    [catalog, applyFilters],
  )

  const dramaPicks = useMemo(
    () => catalog.filter((a) => genreHas(a, 'drama')).filter(applyFilters).slice(0, 16),
    [catalog, applyFilters],
  )
  const filteredSaved = useMemo(
    () => savedList.filter(applyFilters),
    [savedList, applyFilters],
  )

  const onTabChangeWithFx = useCallback((next: 'discover' | 'saved') => {
    setActiveTab(next)
    setTabFx(next)
    window.setTimeout(() => setTabFx(null), TAB_FX_MS)
  }, [])

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
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        genreFilter={genreFilter}
        onGenreFilter={setGenreFilter}
        activeTab={activeTab}
        onTabChange={onTabChangeWithFx}
        onResetFilters={() => {
          setQuery('')
          setTypeFilter('')
          setGenreFilter('')
        }}
        typeOptions={typeOptions}
        genreOptions={genreOptions}
        profiles={profileOptions}
        userId={effectiveUserId ?? profileOptions[0]?.id ?? ''}
        onUserId={setUserId}
        userLabel={profile?.displayName ?? effectiveUserId ?? 'Profile'}
      />
      <main className="app-main">
        {!hasSearchQuery && activeTab !== 'saved' && (
          <div key={`hero-${activeTab}`} className="tab-fade-in">
            <Hero
              slides={spotlightSlides}
              onOpenDetails={(anime) => setSelected(anime)}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
            />
          </div>
        )}
        <div
          key={`rows-${activeTab}-${hasSearchQuery ? 'search' : 'base'}`}
          className={`rows-wrap tab-fade-in${hasSearchQuery ? ' rows-wrap--search' : ''}`}
        >
          {isFilteringActive && (
            <section className="results-header" aria-live="polite">
              <p className="results-header__eyebrow">Search</p>
              <h2 className="results-header__title">
                {hasSearchQuery ? `Results for "${query.trim()}"` : 'Filtered results'}
              </h2>
              <p className="results-header__meta">{searchHits.length} matches</p>
            </section>
          )}
          {activeTab === 'saved' && filteredSaved.length > 0 && (
            <ContentRow
              title="Saved"
              items={filteredSaved}
              predictedByMalId={predictedMap}
              onOpen={setSelected}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
              infiniteLoop={filteredSaved.length >= SAVED_INFINITE_LOOP_MIN}
            />
          )}
          {!isFilteringActive && (
            <ContentRow
              title="Matched to your taste"
              items={forYouList}
              predictedByMalId={predictedMap}
              onOpen={setSelected}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
            />
          )}
          {activeTab !== 'saved' && searchHits.length > 0 && (
            <ContentRow
              title={query.trim() ? `Results for “${query.trim()}”` : 'Filtered results'}
              items={searchHits}
              predictedByMalId={predictedMap}
              onOpen={setSelected}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
              infiniteLoop={false}
            />
          )}
          {!isFilteringActive && (
            <>
              <ContentRow
                title="Crowd favorites"
                items={trending}
                onOpen={setSelected}
                isSaved={isSaved}
                onToggleSave={onToggleSaveAnime}
              />
              <ContentRow
                title="Highest scores"
                items={topRated}
                onOpen={setSelected}
                isSaved={isSaved}
                onToggleSave={onToggleSaveAnime}
              />
              <ContentRow
                title="Action & spectacle"
                items={actionPicks}
                onOpen={setSelected}
                isSaved={isSaved}
                onToggleSave={onToggleSaveAnime}
              />
              <ContentRow
                title="Drama & heart"
                items={dramaPicks}
                onOpen={setSelected}
                isSaved={isSaved}
                onToggleSave={onToggleSaveAnime}
              />
            </>
          )}
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
        isSaved={isSaved}
        onToggleSave={onToggleSaveAnime}
      />
      {tabFx && (
        <div className={`tab-fx tab-fx--${tabFx}`} aria-hidden>
          <div className="tab-fx__core" />
          {tabFx === 'saved' && <div className="tab-fx__heart">♥</div>}
        </div>
      )}
    </div>
  )
}
