import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ContentRow } from './components/ContentRow'
import { DetailModal } from './components/DetailModal'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { useAnimeData } from './hooks/useAnimeData'
import { useSavedMalIds } from './hooks/useSavedMalIds'
import { useUserRatings } from './hooks/useUserRatings'
import type { Anime, RecEntry } from './types'

/** One row per JSON rec entry (same length/order as export); placeholder if not in catalog. */
function animeFromRecEntry(
  e: RecEntry,
  byId: Map<number, Anime>,
  posterByMalId: Map<number, string>,
): Anime {
  const found = byId.get(e.mal_id)
  if (found) return found
  const poster = posterByMalId.get(e.mal_id)
  return {
    mal_id: e.mal_id,
    name: `Anime #${e.mal_id}`,
    genres: '',
    type: 'TV',
    episodes: 0,
    score: 0,
    members: 0,
    synopsis:
      'This title appears in your recommendations export but was not found in the loaded catalog.json.',
    catalogMissing: true,
    ...(poster ? { image_url: poster } : {}),
  }
}

function animeListFromRecEntries(
  entries: RecEntry[] | undefined,
  byId: Map<number, Anime>,
  posterByMalId: Map<number, string>,
): Anime[] {
  if (!entries?.length) return []
  return entries.map((e) => animeFromRecEntry(e, byId, posterByMalId))
}

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

/** Fill up to `limit` titles not yet in `used` (mutates `used`). Preserves candidate order. */
function takeDistinctAnime(
  candidates: Anime[],
  used: Set<number>,
  limit: number,
): Anime[] {
  const out: Anime[] = []
  for (const a of candidates) {
    if (used.has(a.mal_id)) continue
    used.add(a.mal_id)
    out.push(a)
    if (out.length >= limit) break
  }
  return out
}

/** Below this count, Saved shows each title once; at or above, use the same infinite strip as other rows. */
const SAVED_INFINITE_LOOP_MIN = 5
const TAB_FX_MS = 620
/** Fallback when recommendations.json has no popular[] length yet */
const ROW_SECTION_ITEM_LIMIT = 20

export default function App() {
  const { status, catalog, byId, recs, err, posterByMalId } = useAnimeData()
  const [userId, setUserId] = useState<string | null>(null)
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

  const effectiveUserId = useMemo(
    () =>
      userId ??
      recs?.defaultUserId ??
      (recs ? Object.keys(recs.users)[0] : null),
    [userId, recs],
  )

  const { savedMalIds, isSaved, toggleSave } = useSavedMalIds(
    effectiveUserId ?? 'default',
  )

  const profile = useMemo(
    () => (effectiveUserId ? recs?.users[effectiveUserId] : undefined),
    [effectiveUserId, recs],
  )

  const { ratingsByMalId, setUserRating, clearUserRating } = useUserRatings(
    effectiveUserId ?? 'default',
    profile?.ratings,
  )

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

  const popularList = useMemo(
    () => animeListFromRecEntries(recs?.popular, byId, posterByMalId),
    [recs, byId, posterByMalId],
  )
  const randomList = useMemo(
    () => animeListFromRecEntries(profile?.random, byId, posterByMalId),
    [profile, byId, posterByMalId],
  )

  /** Match export TOP_K: same count as popular / forYou / random in JSON */
  const catalogRowLimit = useMemo(() => {
    const n = recs?.popular?.length
    if (typeof n === 'number' && n > 0) return n
    return ROW_SECTION_ITEM_LIMIT
  }, [recs])

  /** Plain SVD/MF picks only; excludes anything that appears in the hybrid (`forYou`) row. */
  const spotlightSlides = useMemo(() => {
    const hybridIds = new Set(
      (profile?.forYou ?? []).map((e) => e.mal_id),
    )
    if (profile?.svd?.length) {
      const onlySvd = profile.svd.filter((e) => !hybridIds.has(e.mal_id))
      if (onlySvd.length > 0) {
        return onlySvd.map((e) => ({
          anime: animeFromRecEntry(e, byId, posterByMalId),
        }))
      }
    }
    if (catalog.length === 0) return []
    return [{ anime: catalog[0] }]
  }, [profile?.svd, profile?.forYou, byId, posterByMalId, catalog])

  /** SVD + popular hybrid scores (export `forYou`). */
  const hybridList = useMemo(
    () => animeListFromRecEntries(profile?.forYou, byId, posterByMalId),
    [profile?.forYou, byId, posterByMalId],
  )

  const searchHits = useMemo(() => catalog.filter(applyFilters), [catalog, applyFilters])
  const hasSearchQuery = Boolean(query.trim())
  const hasTextOrMetaFilters = Boolean(
    query.trim() || typeFilter || genreFilter,
  )
  /** Discover home: no search / type / genre filters (tab alone is not a “filter”). */
  const isDiscoverBrowse = activeTab === 'discover' && !hasTextOrMetaFilters
  const showSearchResultsHeader =
    activeTab === 'discover' && hasTextOrMetaFilters

  /**
   * Crowd-pleasers = global popular from JSON (same for every profile).
   * Other rows skip titles already shown in spotlight, hybrid row, then popular + earlier rows.
   */
  const discoverRowLists = useMemo(() => {
    const limit = catalogRowLimit
    const used = new Set<number>()
    for (const e of profile?.svd ?? []) {
      used.add(e.mal_id)
    }
    for (const e of profile?.forYou ?? []) {
      used.add(e.mal_id)
    }

    const popularDisplay = popularList.slice(0, limit)
    for (const a of popularDisplay) {
      used.add(a.mal_id)
    }

    const randomDisplay = takeDistinctAnime(randomList, used, limit)

    const filtered = catalog.filter(applyFilters)
    const byMembers = [...filtered].sort((a, b) => b.members - a.members)
    const trendingDisplay = takeDistinctAnime(byMembers, used, limit)

    const byScore = [...filtered].sort((a, b) => b.score - a.score)
    const topRatedDisplay = takeDistinctAnime(byScore, used, limit)

    return {
      popularDisplay,
      randomDisplay,
      trendingDisplay,
      topRatedDisplay,
    }
  }, [
    profile?.svd,
    profile?.forYou,
    popularList,
    randomList,
    catalog,
    applyFilters,
    catalogRowLimit,
  ])

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

  const selectedUserRating =
    selected != null ? ratingsByMalId.get(selected.mal_id) : undefined
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
        userLabel={
          profile
            ? `${profile.displayName} · ${ratingsByMalId.size} rated`
            : (effectiveUserId ?? 'Profile')
        }
      />
      <main className="app-main">
        {!hasSearchQuery && activeTab === 'discover' && (
          <div key={`hero-${activeTab}`} className="tab-fade-in">
            <Hero
              slides={spotlightSlides}
              userRatingByMalId={ratingsByMalId}
              onOpenDetails={(anime) => setSelected(anime)}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
            />
            {hybridList.length > 0 && (
              <div style={{ marginTop: '2.5rem' }}>
                <ContentRow
                  title="Recommended for you"
                  items={hybridList}
                  userRatingByMalId={ratingsByMalId}
                  onOpen={setSelected}
                  onRateAnime={onRateAnime}
                  isSaved={isSaved}
                  onToggleSave={onToggleSaveAnime}
                />
              </div>
            )}
          </div>
        )}
        <div
          key={`rows-${activeTab}-${hasSearchQuery ? 'search' : 'base'}`}
          className={`rows-wrap tab-fade-in${
            hasSearchQuery
              ? ' rows-wrap--search'
              : activeTab === 'saved' || activeTab === 'rated'
                ? ' rows-wrap--below-header'
                : ''
          }`}
        >
          {showSearchResultsHeader && (
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
              userRatingByMalId={ratingsByMalId}
              onOpen={setSelected}
              onRateAnime={onRateAnime}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
              infiniteLoop={filteredRated.length >= SAVED_INFINITE_LOOP_MIN}
            />
          )}
          {isDiscoverBrowse && (
            <>
              {discoverRowLists.popularDisplay.length > 0 && (
                <ContentRow
                  title="Crowd-pleasers"
                  items={discoverRowLists.popularDisplay}
                  userRatingByMalId={ratingsByMalId}
                  onOpen={setSelected}
                  onRateAnime={onRateAnime}
                  isSaved={isSaved}
                  onToggleSave={onToggleSaveAnime}
                />
              )}
              {discoverRowLists.randomDisplay.length > 0 && (
                <ContentRow
                  title="Surprise picks"
                  items={discoverRowLists.randomDisplay}
                  userRatingByMalId={ratingsByMalId}
                  onOpen={setSelected}
                  onRateAnime={onRateAnime}
                  isSaved={isSaved}
                  onToggleSave={onToggleSaveAnime}
                />
              )}
              {discoverRowLists.trendingDisplay.length > 0 && (
                <ContentRow
                  title="What everyone's watching"
                  items={discoverRowLists.trendingDisplay}
                  onOpen={setSelected}
                  userRatingByMalId={ratingsByMalId}
                  onRateAnime={onRateAnime}
                  isSaved={isSaved}
                  onToggleSave={onToggleSaveAnime}
                />
              )}
              {discoverRowLists.topRatedDisplay.length > 0 && (
                <ContentRow
                  title="Highest rated"
                  items={discoverRowLists.topRatedDisplay}
                  onOpen={setSelected}
                  userRatingByMalId={ratingsByMalId}
                  onRateAnime={onRateAnime}
                  isSaved={isSaved}
                  onToggleSave={onToggleSaveAnime}
                />
              )}
            </>
          )}
          {activeTab === 'discover' &&
            hasTextOrMetaFilters &&
            searchHits.length > 0 && (
            <ContentRow
              title={query.trim() ? `Results for “${query.trim()}”` : 'Filtered results'}
              items={searchHits}
              userRatingByMalId={ratingsByMalId}
              onOpen={setSelected}
              onRateAnime={onRateAnime}
              isSaved={isSaved}
              onToggleSave={onToggleSaveAnime}
              infiniteLoop={false}
            />
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
        userRating={selectedUserRating}
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
