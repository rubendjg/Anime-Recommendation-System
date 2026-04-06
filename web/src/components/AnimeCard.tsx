import type { Anime } from '../types'
import { PosterImg } from './PosterImg'
import { SaveHeartButton } from './SaveHeartButton'

type Props = {
  anime: Anime
  predictedRating?: number
  onOpen: (a: Anime) => void
  saved?: boolean
  onToggleSave?: (a: Anime) => void
}

export function AnimeCard({
  anime,
  predictedRating,
  onOpen,
  saved = false,
  onToggleSave,
}: Props) {
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
          className="anime-card__img"
          loading="lazy"
          decoding="async"
        />
        {predictedRating != null && (
          <span className="anime-card__badge">{predictedRating.toFixed(1)}</span>
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
          {anime.type} · ★ {anime.score.toFixed(1)}
        </span>
      </div>
    </div>
  )
}
