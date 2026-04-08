export type Anime = {
  mal_id: number
  name: string
  genres: string
  type: string
  episodes: number
  score: number
  members: number
  synopsis: string
  /** Poster URL; empty or missing uses bundled default */
  image_url?: string
  /** Synthetic row: mal_id from recommendations.json but not in loaded catalog */
  catalogMissing?: boolean
}

export type RecEntry = {
  mal_id: number
  predicted_rating: number
}

/** Historical ratings from the interaction export (shown in Rated tab per profile). */
export type UserRatingEntry = {
  mal_id: number
  rating: number
}

export type UserRecProfile = {
  displayName: string
  /** Original MAL user_id from explicit_ratings (set by export script). */
  malUserId?: number
  /** Historical ratings for this profile (Rated tab; seeded from export). */
  ratings?: UserRatingEntry[]
  /** Hybrid SVD + Popular (primary “for you” row). */
  forYou: RecEntry[]
  /** Pure collaborative filtering (SVD / biased MF), same as modeling.ipynb SVD section. */
  svd?: RecEntry[]
  /** Random baseline (fixed seed in export). */
  random?: RecEntry[]
}

export type RecommendationsFile = {
  defaultUserId: string
  featuredMalId: number
  /** Global Popular recommender top picks (non-personalized). */
  popular?: RecEntry[]
  users: Record<string, UserRecProfile>
}
