# Hanami Reco — Anime Recommendation Web UI

A Netflix-style web interface for browsing and exploring anime recommendations. Built with React 19, TypeScript, and Vite.

## Overview

This frontend serves as a proof of concept for the recommendation system, displaying pre-computed recommendations from the modeling pipeline. It demonstrates how different recommendation strategies (collaborative filtering, hybrid, popular, random) would appear to end users.

## Features

- **Hero Spotlight** — Large carousel showcasing SVD collaborative filtering recommendations with dynamic color gradients extracted from poster art
- **Recommended for You** — Personalized hybrid recommendations (SVD + Popular weighted blend)
- **Crowd-pleasers** — Non-personalized popular recommendations baseline
- **Surprise Picks** — Random recommendations for exploration/serendipity
- **Trending / Highest Rated** — Catalog-sorted rows by community engagement and score
- **Profile Switching** — Toggle between pre-computed user profiles to see how recommendations differ per user
- **Search & Filters** — Text search across titles/genres, type dropdown, genre dropdown
- **Save & Rate** — Bookmark anime and rate on a 0-10 scale (persisted per profile in localStorage)
- **Detail Modal** — Full anime details with synopsis, scores, genres, and metadata

## Data Files

The app consumes three JSON files from `public/data/`:

| File | Source | Description |
|------|--------|-------------|
| `catalog.json` | `scripts/build_web_catalog.py` | Full anime catalog with metadata and synopsis |
| `recommendations.json` | `modeling/export_static_recommendations.py` | Per-user recommendations (forYou, SVD, random) and global popular |
| `posters.json` | Export script `--fetch-posters` | MAL poster URL overrides (optional) |

Poster images fall back through: catalog URL → posters.json → Jikan API (rate-limited) → default SVG.

## Development

```bash
npm install
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

## Tech Stack

- **React 19** + **TypeScript 6**
- **Vite 8** with Oxc compiler
- No UI library — all components and styles are hand-built
- No routing library — single-page app with tab navigation
- No state management library — React hooks only
