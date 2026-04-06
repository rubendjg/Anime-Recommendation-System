import { useEffect } from 'react'
import type { Anime } from '../types'
import { PosterImg } from './PosterImg'
import { SaveHeartButton } from './SaveHeartButton'

type Props = {
  anime: Anime | null
  predictedRating?: number
  onClose: () => void
  isSaved: (malId: number) => boolean
  onToggleSave: (anime: Anime) => void
}

export function DetailModal({
  anime,
  predictedRating,
  onClose,
  isSaved,
  onToggleSave,
}: Props) {
  useEffect(() => {
    if (!anime) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [anime, onClose])

  if (!anime) return null

  return (
    <div
      className="modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="modal-panel">
        <button type="button" className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="modal-hero">
          <PosterImg
            imageUrl={anime.image_url}
            className="modal-hero__img"
            decoding="async"
          />
          <div className="modal-hero__shade" />
          <SaveHeartButton
            saved={isSaved(anime.mal_id)}
            className="save-heart--on-modal"
            onToggle={() => onToggleSave(anime)}
          />
        </div>
        <div className="modal-body">
          <h2 id="modal-title" className="modal-title">
            {anime.name}
          </h2>
          <div className="modal-meta">
            <span>★ {anime.score.toFixed(1)}</span>
            {predictedRating != null && (
              <span className="modal-meta__pred">
                Your model: {predictedRating.toFixed(1)}
              </span>
            )}
            <span>{anime.type}</span>
            <span>{anime.episodes} episodes</span>
            <span>{(anime.members / 1e6).toFixed(2)}M members</span>
          </div>
          <p className="modal-genres">{anime.genres}</p>
          <p className="modal-synopsis">{anime.synopsis}</p>
        </div>
      </div>
    </div>
  )
}
