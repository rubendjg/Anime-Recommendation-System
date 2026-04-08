/** Resolve MAL poster URLs via Jikan when the catalog has no image (rate-limited + cached). */

const CACHE_PREFIX = 'hanami:jikan-poster:'

const successMem = new Map<number, string>()
const notFound = new Set<number>()
const inFlight = new Map<number, Promise<string | null>>()

let mutex: Promise<void> = Promise.resolve()
let nextAllowed = 0
const GAP_MS = 350

async function withJikanThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(async () => {
    const now = Date.now()
    const wait = Math.max(0, nextAllowed - now)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    nextAllowed = Date.now() + GAP_MS
    return fn()
  })
  mutex = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function loadSession(malId: number): string | null {
  try {
    const s = sessionStorage.getItem(CACHE_PREFIX + malId)
    return s?.trim() || null
  } catch {
    return null
  }
}

function saveSession(malId: number, url: string) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + malId, url)
  } catch {
    /* ignore */
  }
}

function pickFromImagesBlock(images: unknown): string | null {
  if (!images || typeof images !== 'object') return null
  const im = images as Record<string, { large_image_url?: string; image_url?: string }>
  for (const fmt of ['jpg', 'webp'] as const) {
    const b = im[fmt]
    if (!b) continue
    const u = b.large_image_url || b.image_url
    if (typeof u === 'string' && u.trim()) return u.trim()
  }
  return null
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetries(url: string): Promise<Response | null> {
  let last: Response | null = null
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url)
    last = res
    if (res.ok) return res
    if (res.status === 404) return res
    if (res.status === 429 || res.status >= 500) {
      const ra = res.headers.get('Retry-After')
      let sec = ra ? parseInt(ra, 10) : NaN
      if (!Number.isFinite(sec) || sec < 1) sec = Math.min(2 + i * 2, 20)
      await sleep(Math.min(sec * 1000, 20_000))
      continue
    }
    return res
  }
  return last
}

type FetchPosterResult = { url: string | null; notFound: boolean }

async function fetchPosterForMal(malId: number): Promise<FetchPosterResult> {
  const mainRes = await fetchWithRetries(
    `https://api.jikan.moe/v4/anime/${malId}`,
  )
  if (mainRes?.ok) {
    try {
      const json: unknown = await mainRes.json()
      const data = json as { data?: { images?: unknown } }
      const u = pickFromImagesBlock(data?.data?.images)
      if (u) return { url: u, notFound: false }
    } catch {
      /* malformed JSON */
    }
  } else if (mainRes?.status === 404) {
    return { url: null, notFound: true }
  }

  const picsRes = await fetchWithRetries(
    `https://api.jikan.moe/v4/anime/${malId}/pictures`,
  )
  if (picsRes?.ok) {
    try {
      const json: unknown = await picsRes.json()
      const data = json as { data?: unknown[] }
      const first = Array.isArray(data?.data) ? data.data[0] : null
      const u = pickFromImagesBlock(first)
      if (u) return { url: u, notFound: false }
    } catch {
      /* ignore */
    }
  } else if (picsRes?.status === 404) {
    return { url: null, notFound: true }
  }

  return { url: null, notFound: false }
}

export function isResolvableMalId(malId: number | undefined | null): malId is number {
  return (
    malId != null &&
    Number.isFinite(malId) &&
    malId > 0 &&
    Math.floor(malId) === malId
  )
}

export function resolveJikanLargeImage(malId: number): Promise<string | null> {
  if (!isResolvableMalId(malId)) return Promise.resolve(null)
  if (notFound.has(malId)) return Promise.resolve(null)

  const cached = successMem.get(malId)
  if (cached) return Promise.resolve(cached)

  const fromSess = loadSession(malId)
  if (fromSess) {
    successMem.set(malId, fromSess)
    return Promise.resolve(fromSess)
  }

  const existing = inFlight.get(malId)
  if (existing) return existing

  const p = withJikanThrottle(() => fetchPosterForMal(malId)).then(
    ({ url, notFound: nf }) => {
      inFlight.delete(malId)
      if (url) {
        successMem.set(malId, url)
        saveSession(malId, url)
        return url
      }
      if (nf) notFound.add(malId)
      return null
    },
  )

  inFlight.set(malId, p)
  return p
}
