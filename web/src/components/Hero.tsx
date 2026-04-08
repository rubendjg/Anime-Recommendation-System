import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  extractHeroPaletteFromImageUrl,
  type HeroPaletteCss,
} from '../heroPalette'
import { resolveJikanLargeImage } from '../jikanPoster'
import {
  animePosterUrl,
  DEFAULT_ANIME_POSTER_URL,
} from '../posterUrl'
import type { Anime } from '../types'
import { PosterImg } from './PosterImg'
import { SaveHeartButton } from './SaveHeartButton'

export type SpotlightSlide = {
  anime: Anime
}

type Props = {
  slides: SpotlightSlide[]
  userRatingByMalId: Map<number, number>
  onOpenDetails: (anime: Anime) => void
  isSaved: (malId: number) => boolean
  onToggleSave: (anime: Anime) => void
}

function PeekPoster({
  slide,
  tier,
}: {
  slide: SpotlightSlide | undefined
  tier: 'near' | 'far'
}) {
  if (!slide) {
    return (
      <div
        className={`hero__peek hero__peek--empty hero__peek--${tier}`}
        aria-hidden
      />
    )
  }
  return (
    <div className={`hero__peek hero__peek--${tier}`}>
      <PosterImg
        imageUrl={slide.anime.image_url}
        malId={slide.anime.mal_id}
        className="hero__peek-img"
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}

export function Hero({
  slides,
  userRatingByMalId,
  onOpenDetails,
  isSaved,
  onToggleSave,
}: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [loadedBackdrop, setLoadedBackdrop] = useState<{
    malId: number
    palette: HeroPaletteCss
  } | null>(null)

  const slideKey = useMemo(
    () => slides.map((s) => s.anime.mal_id).join(','),
    [slides],
  )

  useEffect(() => {
    setActiveIdx(0)
  }, [slideKey])

  const goNext = () =>
    setActiveIdx((i) => {
      const len = slides.length
      return len ? (i + 1) % len : i
    })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const len = slides.length
      if (len <= 1) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + len) % len)
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % len)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length])

  if (slides.length === 0) {
    return (
      <section className="hero hero--empty" aria-label="Featured">
        <div className="hero__mesh" aria-hidden />
        <div className="hero__layout hero__layout--empty">
          <div className="hero__frame hero__frame--placeholder" aria-hidden />
          <div className="hero__content">
            <p className="hero__eyebrow">Spotlight</p>
            <h1 className="hero__title">Loading picks…</h1>
          </div>
        </div>
      </section>
    )
  }

  const n = slides.length
  const active = slides[activeIdx]
  const { anime } = active
  const userRating = userRatingByMalId.get(anime.mal_id)
  const multi = n > 1

  useEffect(() => {
    let cancelled = false
    const id = anime.mal_id
    ;(async () => {
      let poster: string
      const trimmed = anime.image_url?.trim() ?? ''
      if (trimmed) {
        poster = animePosterUrl(anime.image_url)
        if (poster === DEFAULT_ANIME_POSTER_URL) {
          const j = await resolveJikanLargeImage(id)
          if (cancelled) return
          if (!j) {
            setLoadedBackdrop(null)
            return
          }
          poster = animePosterUrl(j)
        }
      } else {
        const j = await resolveJikanLargeImage(id)
        if (cancelled) return
        if (!j) {
          setLoadedBackdrop(null)
          return
        }
        poster = animePosterUrl(j)
      }
      const p = await extractHeroPaletteFromImageUrl(poster)
      if (cancelled) return
      if (p) setLoadedBackdrop({ malId: id, palette: p })
      else setLoadedBackdrop(null)
    })()
    return () => {
      cancelled = true
    }
  }, [anime.mal_id, anime.image_url])

  const backdropPalette =
    loadedBackdrop?.malId === anime.mal_id ? loadedBackdrop.palette : null

  const rightNear = multi ? slides[(activeIdx + 1) % n] : undefined
  const rightFar = multi ? slides[(activeIdx + 2) % n] : undefined

  const chromaticStyle =
    backdropPalette != null
      ? ({
          '--hero-glow': backdropPalette.glow,
          '--hero-mid': backdropPalette.mid,
          '--hero-deep': backdropPalette.deep,
        } as CSSProperties)
      : undefined

  return (
    <section
      className={backdropPalette ? 'hero hero--palette' : 'hero'}
      aria-label="Tonight's spotlight"
      aria-roledescription="carousel"
    >
      <div
        key={anime.mal_id}
        className="hero__chromatic"
        aria-hidden
        style={chromaticStyle}
      />
      <div className="hero__mesh" aria-hidden />
      <div className="hero__bg-blur" aria-hidden>
        <PosterImg
          key={anime.mal_id}
          imageUrl={anime.image_url}
          malId={anime.mal_id}
          className="hero__bg-blur-img"
          decoding="async"
        />
      </div>

      <div
        className={
          multi ? 'hero__spotlight' : 'hero__spotlight hero__spotlight--single'
        }
      >
        <div
          className="hero__center"
          aria-live="polite"
          aria-label={`${activeIdx + 1} of ${slides.length}: ${anime.name}`}
        >
          <div
            key={anime.mal_id}
            className="hero__spotlight-pane"
          >
            <div className="hero__layout hero__layout--spotlight">
              <div className="hero__visual">
                <div className="hero__frame">
                  <PosterImg
                    imageUrl={anime.image_url}
                    malId={anime.mal_id}
                    className="hero__poster"
                    decoding="async"
                  />
                  <SaveHeartButton
                    saved={isSaved(anime.mal_id)}
                    className="save-heart--on-hero"
                    onToggle={() => onToggleSave(anime)}
                  />
                </div>
              </div>
              <div className="hero__content">
                <p className="hero__eyebrow">Tonight&apos;s spotlight</p>
                <h1 className="hero__title">{anime.name}</h1>
                <div className="hero__meta">
                  {!anime.catalogMissing && Number.isFinite(anime.score) && (
                    <span
                      className="hero__pill hero__pill--score"
                      title="Average score from the community (catalog)"
                    >
                      Community {anime.score.toFixed(1)}
                    </span>
                  )}
                  {userRating != null && (
                    <span className="hero__pill hero__pill--user" title="Your rating">
                      You {userRating.toFixed(1)}
                    </span>
                  )}
                  <span className="hero__pill">{anime.type}</span>
                  <span className="hero__pill">{anime.episodes} eps</span>
                </div>
                <p className="hero__synopsis">{anime.synopsis}</p>
                <div className="hero__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => onOpenDetails(anime)}
                  >
                    Open details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {multi && (
          <button
            type="button"
            className="hero__side hero__side--right"
            onClick={goNext}
            aria-label="Next recommendation (wraps)"
          >
            <div className="hero__peek-pair hero__peek-pair--right">
              <PeekPoster slide={rightNear} tier="near" />
              <PeekPoster slide={rightFar} tier="far" />
            </div>
            <span className="hero__side-hint" aria-hidden>
              →
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
