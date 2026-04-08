#!/usr/bin/env python3
"""
Build web/public/data/catalog.json from processed_data/anime_processed.csv.

Genres are reconstructed from one-hot columns (between `drop_rate` and `Source_grouped`).

Posters: raw Kaggle anime.csv has no image URLs. Optional `--jikan-posters` fetches
CDN URLs via the Jikan API (rate-limited) and stores a cache in
processed_data/poster_cache.json for reuse.

Synopsis: merged from, in order:
  - `processed_data/anime_with_synopsis.csv` if present (see build_anime_with_synopsis.py)
  - Project root `anime with synopsis.csv` or `anime_with_synopsis.csv` if present
  - `--synopsis-source PATH` (full anime CSV with a synopsis column)

Run from repo root: `python scripts/build_web_catalog.py`
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from synopsis_io import (
    load_filtered_synopsis_csv,
    load_processed_ids,
    merge_synopsis_from_full_csv,
)


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def genre_columns(fieldnames: list[str]) -> list[str]:
    try:
        i0 = fieldnames.index("drop_rate") + 1
        i1 = fieldnames.index("Source_grouped")
    except ValueError as e:
        raise SystemExit(
            "Unexpected CSV schema: need columns 'drop_rate' and 'Source_grouped'. "
            "Regenerate anime_processed.csv from EDA.ipynb."
        ) from e
    return fieldnames[i0:i1]


def truthy_cell(raw: str) -> bool:
    t = raw.strip().lower()
    return t in ("1", "1.0", "true", "yes")


def safe_float(s: str, default: float = 0.0) -> float:
    try:
        v = float(s)
        if v != v:  # NaN
            return default
        return v
    except ValueError:
        return default


def safe_int(s: str, default: int = 0) -> int:
    try:
        return int(float(s))
    except ValueError:
        return default


def load_poster_cache(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if isinstance(data, dict):
        return {str(k): str(v) for k, v in data.items() if v}
    return {}


def save_poster_cache(path: Path, cache: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")


def jikan_poster_url(mal_id: int, timeout: float = 20.0) -> str | None:
    url = f"https://api.jikan.moe/v4/anime/{mal_id}/pictures"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "HanamiReco-catalog-builder/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    pics = payload.get("data") or []
    if not pics:
        return None
    jpg = pics[0].get("jpg") or {}
    return jpg.get("large_image_url") or jpg.get("image_url")


def build_rows(
    csv_path: Path,
    genre_cols: list[str],
    poster_by_id: dict[str, str],
    synopsis_by_id: dict[int, str],
    fetch_jikan: bool,
    jikan_delay: float,
    jikan_max_new: int,
    cache_path: Path,
) -> tuple[list[dict], int]:
    """Returns (catalog_rows, jikan_fetched_count)."""
    fetched = 0
    cache_dirty = False

    out: list[dict] = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise SystemExit("Empty CSV")
        for row in reader:
            mid_raw = (row.get("MAL_ID") or "").strip()
            if not mid_raw:
                continue
            try:
                mal_id = int(float(mid_raw))
            except ValueError:
                continue

            genres = ", ".join(c for c in genre_cols if truthy_cell(row.get(c, "") or ""))

            image_url = poster_by_id.get(str(mal_id), "").strip()
            if fetch_jikan and not image_url and fetched < jikan_max_new:
                url = jikan_poster_url(mal_id)
                time.sleep(jikan_delay)
                if url:
                    poster_by_id[str(mal_id)] = url
                    image_url = url
                    cache_dirty = True
                fetched += 1
                if fetched % 25 == 0 and cache_dirty:
                    save_poster_cache(cache_path, poster_by_id)
                    cache_dirty = False

            score = safe_float(row.get("Score") or "0")
            members = safe_int(row.get("Members") or "0")
            episodes = safe_int(row.get("Episodes") or "0")

            synopsis = synopsis_by_id.get(mal_id, "")

            out.append(
                {
                    "mal_id": mal_id,
                    "name": (row.get("Name") or "").strip() or f"Anime {mal_id}",
                    "genres": genres,
                    "type": (row.get("Type") or "").strip() or "Unknown",
                    "episodes": episodes,
                    "score": round(score, 2),
                    "members": members,
                    "synopsis": synopsis,
                    **({"image_url": image_url} if image_url else {}),
                }
            )

    if cache_dirty:
        save_poster_cache(cache_path, poster_by_id)

    return out, fetched


def main() -> None:
    root = project_root()
    parser = argparse.ArgumentParser(description="Build web catalog from anime_processed.csv")
    parser.add_argument(
        "--input",
        type=Path,
        default=root / "processed_data" / "anime_processed.csv",
        help="Path to anime_processed.csv",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "web" / "public" / "data" / "catalog.json",
        help="Output catalog.json for the Vite app",
    )
    parser.add_argument(
        "--jikan-posters",
        action="store_true",
        help="Fetch poster URLs via Jikan (slow; uses poster_cache.json)",
    )
    parser.add_argument(
        "--jikan-delay",
        type=float,
        default=0.35,
        help="Seconds between Jikan requests (default ~3/sec)",
    )
    parser.add_argument(
        "--jikan-max-new",
        type=int,
        default=400,
        help="Max Jikan requests for IDs not in cache per run. "
        "Use 0 to only merge existing poster_cache.json (no API). "
        "Use -1 to fetch all missing (very slow for a full catalog).",
    )
    parser.add_argument(
        "--poster-cache",
        type=Path,
        default=root / "processed_data" / "poster_cache.json",
        help="JSON map of MAL_ID string -> image URL",
    )
    parser.add_argument(
        "--synopsis-csv",
        type=Path,
        default=root / "processed_data" / "anime_with_synopsis.csv",
        help="MAL_ID + Synopsis (from build_anime_with_synopsis.py); omit if missing",
    )
    parser.add_argument(
        "--synopsis-source",
        type=Path,
        default=None,
        help="Optional full anime CSV with synopsis; merged for MAL_IDs in anime_processed",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"Input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    with args.input.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
    gcols = genre_columns(fieldnames)

    allowed_ids = load_processed_ids(args.input)
    synopsis_by_id: dict[int, str] = {}

    if args.synopsis_csv.is_file():
        synopsis_by_id.update(load_filtered_synopsis_csv(args.synopsis_csv))
        print(
            f"Loaded {len(synopsis_by_id)} synopsis rows from {args.synopsis_csv}",
        )
    else:
        print(f"No filtered synopsis file at {args.synopsis_csv}")

    def try_merge_synopsis_file(path: Path, *, strict: bool) -> None:
        if not path.is_file():
            if strict:
                print(f"Synopsis source not found: {path}", file=sys.stderr)
                sys.exit(1)
            return
        if (
            args.synopsis_csv.is_file()
            and path.resolve() == args.synopsis_csv.resolve()
        ):
            return
        try:
            m = merge_synopsis_from_full_csv(path, allowed_ids)
        except ValueError as e:
            if strict:
                print(e, file=sys.stderr)
                sys.exit(1)
            print(f"Skipping synopsis file {path}: {e}", file=sys.stderr)
            return
        synopsis_by_id.update(m)
        if m:
            print(f"Merged {len(m)} synopses from {path}")

    if args.synopsis_source:
        try_merge_synopsis_file(args.synopsis_source, strict=True)
    for name in ("anime with synopsis.csv", "anime_with_synopsis.csv"):
        try_merge_synopsis_file(root / name, strict=False)

    n_syn = len([1 for v in synopsis_by_id.values() if v.strip()])
    if n_syn == 0:
        print(
            "Warning: no synopsis text loaded. "
            "Place your download as `anime with synopsis.csv` in the project root, "
            "or run: python scripts/build_anime_with_synopsis.py --source <file.csv>",
            file=sys.stderr,
        )
    else:
        print(f"Synopsis lookup: {n_syn} non-empty entries for catalog merge")

    poster_by_id = load_poster_cache(args.poster_cache)
    if args.jikan_posters:
        if args.jikan_max_new < 0:
            jikan_max = 10**9
        else:
            jikan_max = args.jikan_max_new
    else:
        jikan_max = 0

    rows, n_fetch = build_rows(
        args.input,
        gcols,
        poster_by_id,
        synopsis_by_id,
        fetch_jikan=args.jikan_posters,
        jikan_delay=max(args.jikan_delay, 0.1),
        jikan_max_new=jikan_max,
        cache_path=args.poster_cache,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    with_urls = sum(1 for r in rows if r.get("image_url"))
    with_syn = sum(1 for r in rows if (r.get("synopsis") or "").strip())
    print(
        f"Wrote {len(rows)} titles to {args.output} "
        f"({with_urls} with image_url, {with_syn} with synopsis)",
    )
    if args.jikan_posters:
        print(f"Jikan requests this run: {n_fetch} (cache: {args.poster_cache})")


if __name__ == "__main__":
    main()
