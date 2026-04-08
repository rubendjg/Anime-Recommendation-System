import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { Anime } from '../types'
import { AnimeCard } from './AnimeCard'

function rowSlug(title: string) {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'row'
}

type LoopEntry = { anime: Anime; key: string }

/** How many recommendation cards one arrow click advances (smooth scroll). */
const ARROW_SCROLL_CARDS = 5

type Props = {
  title: string
  items: Anime[]
  userRatingByMalId?: Map<number, number>
  onOpen: (a: Anime) => void
  onRateAnime?: (a: Anime) => void
  isSaved?: (malId: number) => boolean
  onToggleSave?: (a: Anime) => void
  /** When false, each title appears once (no triple clone for infinite scroll). Use for Saved. */
  infiniteLoop?: boolean
}

/** Instant scroll position; snap is handled by loopJumpScroll when crossing clones */
function setScrollLeftNoSmooth(el: HTMLDivElement, value: number) {
  const prev = el.style.scrollBehavior
  el.style.scrollBehavior = 'auto'
  el.scrollLeft = Math.round(value)
  el.style.scrollBehavior = prev || ''
}

/**
 * Snap fights instant loop jumps (second nudge on the next frame). Turn snap off for the jump,
 * restore after layout so the transition reads as one step.
 */
function loopJumpScroll(
  el: HTMLDivElement,
  nextLeft: number,
  onSettled: () => void,
) {
  const prevSnap = el.style.scrollSnapType
  el.style.scrollSnapType = 'none'
  setScrollLeftNoSmooth(el, nextLeft)
  requestAnimationFrame(() => {
    el.style.scrollSnapType = prevSnap
    requestAnimationFrame(onSettled)
  })
}

export function ContentRow({
  title,
  items,
  userRatingByMalId,
  onOpen,
  onRateAnime,
  isSaved,
  onToggleSave,
  infiniteLoop = true,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const loopJumpingRef = useRef(false)

  const itemsSig = useMemo(
    () => items.map((x) => x.mal_id).join(','),
    [items],
  )

  const loopEntries: LoopEntry[] = useMemo(() => {
    if (items.length === 0) return []
    if (!infiniteLoop || items.length === 1) {
      return items.map((a) => ({ anime: a, key: String(a.mal_id) }))
    }
    return [...items, ...items, ...items].map((a, i) => ({
      anime: a,
      key: `${a.mal_id}-loop-${i}`,
    }))
  }, [items, infiniteLoop])

  const useInfiniteLoop = infiniteLoop && items.length > 1

  /* Start in the middle third; double rAF + delayed pass so poster/layout growth updates scrollWidth */
  useLayoutEffect(() => {
    if (!useInfiniteLoop) return
    const el = scrollerRef.current
    if (!el) return

    const centerInMiddleThird = () => {
      const w = el.scrollWidth
      if (w < 40) return
      loopJumpingRef.current = true
      loopJumpScroll(el, w / 3, () => {
        loopJumpingRef.current = false
      })
    }

    centerInMiddleThird()
    let outerId = 0
    let innerId = 0
    outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(centerInMiddleThird)
    })
    const t = window.setTimeout(centerInMiddleThird, 400)
    return () => {
      cancelAnimationFrame(outerId)
      cancelAnimationFrame(innerId)
      window.clearTimeout(t)
    }
  }, [itemsSig, useInfiniteLoop])

  /* When the user reaches the first or last clone, jump one segment without animation */
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !useInfiniteLoop) return

    const onScroll = () => {
      if (loopJumpingRef.current) return

      const w = el.scrollWidth
      const L = w / 3
      if (L < 20) return

      const card = el.querySelector('.anime-card') as HTMLElement | null
      const g = getComputedStyle(el)
      const gap = parseFloat(g.gap || '0') || 0
      const step = card ? card.offsetWidth + gap : 0
      /* Snap + smooth stop short of 0 / maxScroll; margin must exceed that gap or the wrap never fires */
      const margin = Math.max(48, step * 2, L * 0.06)

      const sl = el.scrollLeft
      const maxS = w - el.clientWidth

      if (sl <= margin) {
        loopJumpingRef.current = true
        loopJumpScroll(el, sl + L, () => {
          loopJumpingRef.current = false
        })
      } else if (sl >= maxS - margin) {
        loopJumpingRef.current = true
        loopJumpScroll(el, sl - L, () => {
          loopJumpingRef.current = false
        })
      }
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [useInfiniteLoop, loopEntries.length])

  if (items.length === 0) return null

  const rowId = `row-${rowSlug(title)}`

  const scroll = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector('.anime-card') as HTMLElement | null
    if (!card) return
    const g = getComputedStyle(el)
    const gap = parseFloat(g.gap || '0') || 0
    const step = card.offsetWidth + gap
    el.scrollBy({ left: dir * step * ARROW_SCROLL_CARDS, behavior: 'smooth' })
  }

  return (
    <section className="content-row" aria-labelledby={rowId}>
      <div className="content-row__head">
        <div className="content-row__title-wrap">
          <span className="content-row__glyph" aria-hidden />
          <h2 className="content-row__title" id={rowId}>
            {title}
          </h2>
        </div>
        <div className="content-row__arrows">
          <button
            type="button"
            className="row-arrow"
            aria-label={`Scroll ${title} left by ${ARROW_SCROLL_CARDS} titles`}
            onClick={() => scroll(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="row-arrow"
            aria-label={`Scroll ${title} right by ${ARROW_SCROLL_CARDS} titles`}
            onClick={() => scroll(1)}
          >
            ›
          </button>
        </div>
      </div>
      <div className="content-row__scroller" ref={scrollerRef}>
        {loopEntries.map(({ anime: a, key }) => (
          <AnimeCard
            key={key}
            anime={a}
            userRating={userRatingByMalId?.get(a.mal_id)}
            onOpen={onOpen}
            onRate={onRateAnime}
            saved={isSaved?.(a.mal_id)}
            onToggleSave={onToggleSave}
          />
        ))}
      </div>
    </section>
  )
}
