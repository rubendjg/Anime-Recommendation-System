import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react'
import {
  DEFAULT_ANIME_POSTER_URL,
  malPosterPreferredAndFallback,
} from '../posterUrl'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'alt'> & {
  imageUrl: string | undefined | null
}

export function PosterImg({ imageUrl, ...rest }: Props) {
  const { primary, fallback } = useMemo(
    () => malPosterPreferredAndFallback(imageUrl),
    [imageUrl],
  )
  const [src, setSrc] = useState(primary)

  useEffect(() => {
    setSrc(primary)
  }, [primary])

  return (
    <img
      {...rest}
      src={src}
      alt=""
      onError={() => {
        if (fallback && src !== fallback) setSrc(fallback)
        else setSrc(DEFAULT_ANIME_POSTER_URL)
      }}
    />
  )
}
