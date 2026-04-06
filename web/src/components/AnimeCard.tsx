import type { Anime } from '../types'
import { PosterImg } from './PosterImg'

type Props = {
  anime: Anime
  predictedRating?: number
  onOpen: (a: Anime) => void
}

export function AnimeCard({ anime, predictedRating, onOpen }: Props) {
  return (
    <button
      type="button"
      className="anime-card"
      onClick={() => onOpen(anime)}
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
      </div>
      <div className="anime-card__caption">
        <span className="anime-card__title">{anime.name}</span>
        <span className="anime-card__sub">
          {anime.type} · ★ {anime.score.toFixed(1)}
        </span>
      </div>
    </button>
  )
}
