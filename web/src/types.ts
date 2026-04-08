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

export type HistoryEntry = {
  mal_id: number
  rating: number
}

export type ModelKey = 'hybrid' | 'cf' | 'content' | 'popular' | 'random'

export type ModelRecommendations = {
  label: string
  forYou: RecEntry[]
}

export type UserRecProfile = {
  displayName: string
  sourceUserId?: number
  history?: HistoryEntry[]
  models: Partial<Record<ModelKey, ModelRecommendations>>
}

export type RecommendationsFile = {
  defaultUserId: string
  defaultModelKey: ModelKey
  featuredMalId: number
  modelOrder: ModelKey[]
  users: Record<string, UserRecProfile>
}
