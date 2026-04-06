export const DEFAULT_ANIME_POSTER_URL = '/default-anime-poster.svg'

/** MAL CDN standard posters use `{id}.jpg`; `{id}l.jpg` is the large variant (Jikan's large_image_url). */
const MAL_CDN_ANIME_JPG =
  /^(https?:\/\/cdn\.myanimelist\.net\/images\/anime\/\d+\/)(\d+)\.jpg$/i

export function malPosterPreferredAndFallback(
  imageUrl: string | undefined | null,
): { primary: string; fallback: string | null } {
  const t = typeof imageUrl === 'string' ? imageUrl.trim() : ''
  if (!t) return { primary: DEFAULT_ANIME_POSTER_URL, fallback: null }
  const m = t.match(MAL_CDN_ANIME_JPG)
  if (m) {
    const large = `${m[1]}${m[2]}l.jpg`
    return { primary: large, fallback: t }
  }
  return { primary: t, fallback: null }
}

export function animePosterUrl(imageUrl: string | undefined | null): string {
  return malPosterPreferredAndFallback(imageUrl).primary
}
