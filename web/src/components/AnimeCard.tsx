import type { Anime } from '../types'
import { PosterImg } from './PosterImg'
import { SaveHeartButton } from './SaveHeartButton'

type Props = {
  anime: Anime
  userRating?: number
  onOpen: (a: Anime) => void
  onRate?: (a: Anime) => void
  saved?: boolean
  onToggleSave?: (a: Anime) => void
}

export function AnimeCard({
  anime,
  userRating,
  onOpen,
  onRate,
  saved = false,
  onToggleSave,
}: Props) {
  const malOk = Number.isFinite(anime.score) && !anime.catalogMissing
  const showScores = malOk || userRating != null

  return (
    <div
      className="anime-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(anime)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if ((e.target as HTMLElement).closest('.save-heart')) return
        e.preventDefault()
        onOpen(anime)
      }}
      aria-label={`${anime.name}, open details`}
    >
      <div className="anime-card__poster">
        <PosterImg
          imageUrl={anime.image_url}
          malId={anime.mal_id}
          className="anime-card__img"
          loading="lazy"
          decoding="async"
        />
        {onRate && (
          <button
            type="button"
            className="anime-card__rate-btn anime-card__rate-btn--overlay"
            onClick={(e) => {
              e.stopPropagation()
              onRate(anime)
            }}
            aria-label={`Rate ${anime.name}`}
          >
            Rate
          </button>
        )}
        {showScores && (
          <div
            className="anime-card__scores-inline"
            title="Community average score (catalog) and your rating"
          >
            {malOk && (
              <span className="anime-card__scores-community">
                Community {anime.score.toFixed(1)}
              </span>
            )}
            {malOk && userRating != null && (
              <span className="anime-card__scores-sep" aria-hidden>
                ·
              </span>
            )}
            {userRating != null && (
              <span className="anime-card__scores-you">You {userRating.toFixed(1)}</span>
            )}
          </div>
        )}
        {onToggleSave && (
          <SaveHeartButton
            saved={saved}
            className="save-heart--on-card"
            onToggle={() => onToggleSave(anime)}
          />
        )}
      </div>
      <div className="anime-card__caption">
        <span className="anime-card__title">{anime.name}</span>
        <span className="anime-card__sub">
          {anime.catalogMissing
            ? `MAL #${anime.mal_id} · not in catalog`
            : `${anime.type} · Community ${anime.score.toFixed(1)}`}
        </span>
      </div>
    </div>
  )
}
