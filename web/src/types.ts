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
}

export type RecEntry = {
  mal_id: number
  predicted_rating: number
}

export type UserRecProfile = {
  displayName: string
  forYou: RecEntry[]
}

export type RecommendationsFile = {
  defaultUserId: string
  featuredMalId: number
  users: Record<string, UserRecProfile>
}
