"""Shared helpers for reading MAL_ID + synopsis from CSV files."""

from __future__ import annotations

import csv
from pathlib import Path


def norm_key(s: str) -> str:
    return s.strip().lower().replace(" ", "_")


def pick_id_column(fieldnames: list[str]) -> str | None:
    norm_map = {norm_key(f): f for f in fieldnames}
    for key in ("mal_id", "anime_id", "animeid", "anime_mal_id"):
        if key in norm_map:
            return norm_map[key]
    for f in fieldnames:
        nk = norm_key(f)
        if "mal" in nk and "id" in nk:
            return f
    return None


def pick_synopsis_column(fieldnames: list[str]) -> str | None:
    norm_map = {norm_key(f): f for f in fieldnames}
    for key in ("synopsis", "sypnopsis", "description", "overview", "plot", "summary"):
        if key in norm_map:
            return norm_map[key]
    for f in fieldnames:
        nk = norm_key(f)
        if "synopsis" in nk or "description" in nk:
            return f
    return None


def load_processed_ids(processed_csv: Path) -> set[int]:
    ids: set[int] = set()
    with processed_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw = (row.get("MAL_ID") or row.get("mal_id") or "").strip()
            if not raw:
                continue
            try:
                ids.add(int(float(raw)))
            except ValueError:
                continue
    return ids


def _clean_synopsis_cell(syn: object) -> str:
    if syn is None:
        return ""
    if isinstance(syn, str):
        return " ".join(syn.split())
    return " ".join(str(syn).split())


def load_filtered_synopsis_csv(path: Path) -> dict[int, str]:
    """Read MAL_ID + Synopsis file (output of build_anime_with_synopsis.py)."""
    out: dict[int, str] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw = (row.get("MAL_ID") or row.get("mal_id") or "").strip()
            if not raw:
                continue
            try:
                mid = int(float(raw))
            except ValueError:
                continue
            syn = row.get("Synopsis") or row.get("synopsis") or ""
            out[mid] = _clean_synopsis_cell(syn)
    return out


def merge_synopsis_from_full_csv(path: Path, allowed: set[int]) -> dict[int, str]:
    """Read a wide anime CSV; keep rows whose id is in allowed."""
    out: dict[int, str] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        id_col = pick_id_column(fieldnames)
        syn_col = pick_synopsis_column(fieldnames)
        if not id_col or not syn_col:
            raise ValueError(
                f"Missing id and/or synopsis column in {path.name}. "
                f"Columns: {fieldnames}",
            )
        seen: set[int] = set()
        for row in reader:
            raw_id = (row.get(id_col) or "").strip()
            if not raw_id:
                continue
            try:
                mid = int(float(raw_id))
            except ValueError:
                continue
            if mid not in allowed or mid in seen:
                continue
            seen.add(mid)
            out[mid] = _clean_synopsis_cell(row.get(syn_col))
    return out
