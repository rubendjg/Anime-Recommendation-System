import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react'
import { isResolvableMalId, resolveJikanLargeImage } from '../jikanPoster'
import {
  DEFAULT_ANIME_POSTER_URL,
  malPosterPreferredAndFallback,
} from '../posterUrl'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'alt'> & {
  imageUrl: string | undefined | null
  malId?: number
}

export function PosterImg({ imageUrl, malId, ...rest }: Props) {
  const { primary, fallback } = useMemo(
    () => malPosterPreferredAndFallback(imageUrl),
    [imageUrl],
  )
  const [src, setSrc] = useState(primary)

  useEffect(() => {
    setSrc(primary)
  }, [primary])

  useEffect(() => {
    if (!isResolvableMalId(malId)) return
    if (primary !== DEFAULT_ANIME_POSTER_URL) return
    let cancelled = false
    resolveJikanLargeImage(malId).then((u) => {
      if (!cancelled && u) setSrc(u)
    })
    return () => {
      cancelled = true
    }
  }, [primary, malId])

  return (
    <img
      {...rest}
      src={src}
      alt=""
      onError={() => {
        if (fallback && src !== fallback) {
          setSrc(fallback)
          return
        }
        setSrc(DEFAULT_ANIME_POSTER_URL)
        if (isResolvableMalId(malId) && primary !== DEFAULT_ANIME_POSTER_URL) {
          resolveJikanLargeImage(malId).then((u) => {
            if (u) setSrc(u)
          })
        }
      }}
    />
  )
}
