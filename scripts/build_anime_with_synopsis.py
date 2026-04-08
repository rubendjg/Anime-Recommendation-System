#!/usr/bin/env python3
"""
Filter a full anime CSV (with synopsis) down to rows whose MAL_ID appears in
processed_data/anime_processed.csv.

Writes processed_data/anime_with_synopsis.csv with columns MAL_ID, Synopsis
for use by scripts/build_web_catalog.py.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from synopsis_io import load_processed_ids, merge_synopsis_from_full_csv


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def main() -> None:
    root = project_root()
    parser = argparse.ArgumentParser(
        description="Filter synopsis CSV to MAL_IDs in anime_processed.csv",
    )
    parser.add_argument(
        "--source",
        type=Path,
        required=True,
        help="Downloaded CSV that includes MAL_ID (or equivalent) and synopsis text",
    )
    parser.add_argument(
        "--processed",
        type=Path,
        default=root / "processed_data" / "anime_processed.csv",
        help="Reference list of MAL_IDs to keep",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "processed_data" / "anime_with_synopsis.csv",
        help="Filtered CSV: MAL_ID, Synopsis",
    )
    args = parser.parse_args()

    if not args.source.is_file():
        print(f"Source not found: {args.source}", file=sys.stderr)
        sys.exit(1)
    if not args.processed.is_file():
        print(f"Processed anime not found: {args.processed}", file=sys.stderr)
        sys.exit(1)

    allowed = load_processed_ids(args.processed)
    if not allowed:
        print("No MAL_IDs loaded from processed file.", file=sys.stderr)
        sys.exit(1)

    try:
        rows_map = merge_synopsis_from_full_csv(args.source, allowed)
    except ValueError as e:
        print(e, file=sys.stderr)
        sys.exit(1)
    rows_out = sorted(rows_map.items(), key=lambda x: x[0])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as out:
        w = csv.DictWriter(out, fieldnames=["MAL_ID", "Synopsis"])
        w.writeheader()
        for mid, syn in rows_out:
            w.writerow({"MAL_ID": mid, "Synopsis": syn})

    print(
        f"Wrote {len(rows_out)} rows to {args.output} "
        f"(from {len(allowed)} processed IDs; matched {len(rows_map)})",
    )
    if len(rows_map) < len(allowed):
        print(
            f"Note: {len(allowed) - len(rows_map)} processed IDs had no synopsis row in source.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
