import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ContentRow } from './components/ContentRow'
import { DetailModal } from './components/DetailModal'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { useAnimeData } from './hooks/useAnimeData'
import { useSavedMalIds } from './hooks/useSavedMalIds'
import { useUserRatings } from './hooks/useUserRatings'
import type { Anime, ModelKey } from './types'

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
const FALLBACK_MODEL_ORDER: ModelKey[] = ['hybrid', 'cf', 'content', 'popular', 'random']

function prettyModelName(k: ModelKey) {
  if (k === 'cf') return 'Collaborative Filtering'
  if (k === 'content') return 'Content-Based'
  if (k === 'hybrid') return 'Hybrid'
  if (k === 'popular') return 'Popular'
  return 'Random'
}

export default function App() {
  const { status, catalog, byId, recs, err } = useAnimeData()
  const { savedMalIds, isSaved, toggleSave } = useSavedMalIds()
  const { ratingsByMalId, setUserRating, clearUserRating } = useUserRatings()
  const [userId, setUserId] = useState<string | null>(null)
  const [modelId, setModelId] = useState<ModelKey | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'discover' | 'saved' | 'rated'>(
    'discover',
  )
  const [tabFx, setTabFx] = useState<'discover' | 'saved' | 'rated' | null>(null)
  const [selected, setSelected] = useState<Anime | null>(null)
  const [ratingAnime, setRatingAnime] = useState<Anime | null>(null)
  const [ratingDraft, setRatingDraft] = useState('')

  const onToggleSaveAnime = useCallback(
    (a: Anime) => {
      toggleSave(a.mal_id)
    },
    [toggleSave],
  )

  const onRateAnime = useCallback(
    (a: Anime) => {
      const current = ratingsByMalId.get(a.mal_id)
      setRatingAnime(a)
      setRatingDraft(current != null ? current.toFixed(1) : '')
    },
    [ratingsByMalId],
  )

  const submitRating = useCallback(() => {
    if (!ratingAnime) return
    const raw = ratingDraft.trim()
    if (!raw) return
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      window.alert('Please enter a number between 0 and 10.')
      return
    }
    setUserRating(ratingAnime.mal_id, Math.round(n * 10) / 10)
    setRatingAnime(null)
    setRatingDraft('')
  }, [ratingAnime, ratingDraft, setUserRating])

  const clearRatingFromPopup = useCallback(() => {
    if (!ratingAnime) return
    clearUserRating(ratingAnime.mal_id)
    setRatingAnime(null)
    setRatingDraft('')
  }, [ratingAnime, clearUserRating])

  useEffect(() => {
    if (!ratingAnime) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setRatingAnime(null)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        submitRating()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        setRatingDraft((prev) => prev.slice(0, -1))
        return
      }
      if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',') {
        e.preventDefault()
        setRatingDraft((prev) => {
          const next = `${prev}${e.key === ',' ? '.' : e.key}`
          if (!/^\d{0,2}(\.\d{0,1})?$/.test(next)) return prev
          const n = Number(next)
          if (!Number.isFinite(n)) return next
          if (n < 0 || n > 10) return prev
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ratingAnime, submitRating])

  const savedList = useMemo(() => {
    const out: Anime[] = []
    for (const id of savedMalIds) {
      const a = byId.get(id)
      if (a) out.push(a)
    }
    return out
  }, [savedMalIds, byId])

  const ratedList = useMemo(() => {
    const out: Anime[] = []
    for (const id of ratingsByMalId.keys()) {
      const a = byId.get(id)
      if (a) out.push(a)
    }
    return out
  }, [ratingsByMalId, byId])

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
      if (activeTab === 'rated' && !ratingsByMalId.has(a.mal_id)) return false
      return true
    },
    [query, typeFilter, genreFilter, activeTab, isSaved, ratingsByMalId],
  )

  const effectiveUserId =
    userId ??
    recs?.defaultUserId ??
    (recs ? Object.keys(recs.users)[0] : null)

  const profile = effectiveUserId ? recs?.users[effectiveUserId] : undefined
  const modelOrder = recs?.modelOrder?.length ? recs.modelOrder : FALLBACK_MODEL_ORDER

  const availableModelIds = useMemo(() => {
    if (!profile) return [] as ModelKey[]
    const fromOrder = modelOrder.filter((k) => {
      const entries = profile.models[k]?.forYou
      return Array.isArray(entries) && entries.length > 0
    })
    const extra = (Object.keys(profile.models) as ModelKey[]).filter(
      (k) => !fromOrder.includes(k),
    )
    return [...fromOrder, ...extra]
  }, [profile, modelOrder])

  const effectiveModelId =
    (modelId && availableModelIds.includes(modelId) ? modelId : null) ??
    (recs?.defaultModelKey && availableModelIds.includes(recs.defaultModelKey)
      ? recs.defaultModelKey
      : null) ??
    availableModelIds[0] ??
    'hybrid'

  useEffect(() => {
    if (!availableModelIds.length) return
    if (!modelId || !availableModelIds.includes(modelId)) {
      setModelId(effectiveModelId)
    }
  }, [availableModelIds, modelId, effectiveModelId])

  const activeModel = profile?.models[effectiveModelId]

  const predictedMap = useMemo(() => {
    const m = new Map<number, number>()
    const entries = activeModel?.forYou ?? []
    for (const e of entries) m.set(e.mal_id, e.predicted_rating)
    return m
  }, [activeModel])

  const forYouList = useMemo(() => {
    const entries = activeModel?.forYou ?? []
    const out: Anime[] = []
    for (const e of entries) {
      const a = byId.get(e.mal_id)
      if (a) out.push(a)
    }
    return out
  }, [activeModel, byId])

  const historyRatingMap = useMemo(() => {
    const m = new Map<number, number>()
    const entries = profile?.history ?? []
    for (const e of entries) m.set(e.mal_id, e.rating)
    return m
  }, [profile])

  const historyList = useMemo(() => {
    const entries = profile?.history ?? []
    const out: Anime[] = []
    for (const e of entries) {
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
    query.trim() || typeFilter || genreFilter || activeTab !== 'discover',
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
  const filteredRated = useMemo(
    () => ratedList.filter(applyFilters),
    [ratedList, applyFilters],
  )

  const onTabChangeWithFx = useCallback((next: 'discover' | 'saved' | 'rated') => {
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
  const modelOptions = availableModelIds.map((k) => ({
    id: k,
    label: profile?.models[k]?.label ?? prettyModelName(k),
  }))

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
  const sliderRatingValue = (() => {
    const n = Number(ratingDraft.replace(',', '.'))
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(10, n))
  })()

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
        models={modelOptions}
        modelId={effectiveModelId}
        onModelId={(id) => setModelId(id as ModelKey)}
      />
      <main className="app-main">
        {!hasSearchQuery && activeTab === 'discover' && (
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
              userRatingByMalId={ratingsByMalId}
              onOpen={setSelected}
              onRateAnime={onRateAnime}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
              infiniteLoop={filteredSaved.length >= SAVED_INFINITE_LOOP_MIN}
            />
          )}
          {activeTab === 'rated' && filteredRated.length > 0 && (
            <ContentRow
              title="Rated"
              items={filteredRated}
              predictedByMalId={predictedMap}
              userRatingByMalId={ratingsByMalId}
              onOpen={setSelected}
              onRateAnime={onRateAnime}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
              infiniteLoop={filteredRated.length >= SAVED_INFINITE_LOOP_MIN}
            />
          )}
          {!isFilteringActive && (
            <ContentRow
              title={`Matched to your taste (${activeModel?.label ?? prettyModelName(effectiveModelId)})`}
              items={forYouList}
              predictedByMalId={predictedMap}
              userRatingByMalId={ratingsByMalId}
              onOpen={setSelected}
              onRateAnime={onRateAnime}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
            />
          )}
          {!isFilteringActive && activeTab === 'discover' && historyList.length > 0 && (
            <ContentRow
              title={`${profile?.displayName ?? 'Viewer'} liked history`}
              items={historyList}
              predictedByMalId={historyRatingMap}
              onOpen={setSelected}
              onRateAnime={onRateAnime}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
            />
          )}
          {activeTab === 'discover' && searchHits.length > 0 && (
            <ContentRow
              title={query.trim() ? `Results for “${query.trim()}”` : 'Filtered results'}
              items={searchHits}
              predictedByMalId={predictedMap}
              userRatingByMalId={ratingsByMalId}
              onOpen={setSelected}
              onRateAnime={onRateAnime}
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
                userRatingByMalId={ratingsByMalId}
                onRateAnime={onRateAnime}
                isSaved={isSaved}
                onToggleSave={onToggleSaveAnime}
              />
              <ContentRow
                title="Highest scores"
                items={topRated}
                onOpen={setSelected}
                userRatingByMalId={ratingsByMalId}
                onRateAnime={onRateAnime}
                isSaved={isSaved}
                onToggleSave={onToggleSaveAnime}
              />
              <ContentRow
                title="Action & spectacle"
                items={actionPicks}
                onOpen={setSelected}
                userRatingByMalId={ratingsByMalId}
                onRateAnime={onRateAnime}
                isSaved={isSaved}
                onToggleSave={onToggleSaveAnime}
              />
              <ContentRow
                title="Drama & heart"
                items={dramaPicks}
                onOpen={setSelected}
                userRatingByMalId={ratingsByMalId}
                onRateAnime={onRateAnime}
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
      {ratingAnime && (
        <div className="rate-pop-root" role="dialog" aria-modal="true" aria-labelledby="rate-pop-title">
          <button
            type="button"
            className="rate-pop-backdrop"
            aria-label="Close rating popup"
            onClick={() => setRatingAnime(null)}
          />
          <div className="rate-pop-panel">
            <h3 id="rate-pop-title" className="rate-pop-title">
              Rate "{ratingAnime.name}"
            </h3>
            <p className="rate-pop-help">
              Drag the bar or type a number (0-10). Press Enter to save.
            </p>
            <div className="rate-pop-controls">
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                className="rate-pop-slider"
                value={sliderRatingValue}
                onChange={(e) => setRatingDraft(e.target.value)}
                aria-label="Adjust rating with slider"
                style={
                  {
                    '--rate-pct': `${(sliderRatingValue / 10) * 100}%`,
                  } as CSSProperties
                }
                autoFocus
              />
              <div className="rate-pop-value">{sliderRatingValue.toFixed(1)}</div>
            </div>
            <div className="rate-pop-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setRatingAnime(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn--ghost" onClick={clearRatingFromPopup}>
                Clear
              </button>
              <button type="button" className="btn btn--primary" onClick={submitRating}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
