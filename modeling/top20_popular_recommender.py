"""
Top-K items using the same *logic* as PopularRecommender in modeling.ipynb, without Surprise:
- explicit_ratings.csv, SEED=42, N_USERS=5000, MIN_ITEM_RATINGS=500
- ~80% train sample of rating rows (random_state=SEED); same spirit as notebook split
- Items with count >= MIN_ITEM_RATINGS ranked by mean training rating

Note: Uses pandas sample(frac=0.8) instead of Surprise's split; tie order may differ slightly.
Titles come from web/public/data/catalog.json (mal_id -> name).

Run from repo root:
  python modeling/top20_popular_recommender.py
  python modeling/top20_popular_recommender.py --k 30
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
MIN_ITEM_RATINGS = 500
N_USERS = 5000


def load_mal_id_to_name(catalog_path: Path) -> dict[int, str]:
    if not catalog_path.is_file():
        return {}
    with catalog_path.open(encoding="utf-8") as f:
        data = json.load(f)
    out: dict[int, str] = {}
    for entry in data:
        if not isinstance(entry, dict):
            continue
        mid = entry.get("mal_id")
        name = entry.get("name")
        if mid is None or name is None:
            continue
        out[int(mid)] = str(name)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Top-K popular items (PopularRecommender logic, no Surprise).")
    parser.add_argument("--k", type=int, default=20, help="Number of items to show (default: 20)")
    parser.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="catalog.json path (default: web/public/data/catalog.json under repo root)",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    ratings_path = root / "processed_data" / "explicit_ratings.csv"
    if not ratings_path.is_file():
        raise SystemExit(f"Missing ratings file: {ratings_path}")

    catalog_path = args.catalog if args.catalog is not None else root / "web" / "public" / "data" / "catalog.json"
    id_to_name = load_mal_id_to_name(catalog_path)

    np.random.seed(SEED)
    ratings_df = pd.read_csv(ratings_path)
    all_users = ratings_df["user_id"].unique()
    np.random.shuffle(all_users)
    sample = ratings_df[ratings_df["user_id"].isin(all_users[:N_USERS])][
        ["user_id", "anime_id", "rating"]
    ].copy()

    train_df = sample.sample(frac=0.8, random_state=SEED, replace=False)

    stats = train_df.groupby("anime_id").agg(
        count=("rating", "count"),
        mean=("rating", "mean"),
    )
    item_means = stats.loc[stats["count"] >= MIN_ITEM_RATINGS, "mean"]
    top = item_means.nlargest(args.k)

    rows = []
    for rank, (aid, mean_rating) in enumerate(top.items(), start=1):
        iid = int(aid)
        rows.append(
            {
                "rank": rank,
                "anime_id": iid,
                "name": id_to_name.get(iid, "(not in catalog)"),
                "url": f"https://myanimelist.net/anime/{iid}",
                "mean_rating": float(mean_rating),
            }
        )

    out = pd.DataFrame(rows)
    pd.set_option("display.max_rows", None)
    pd.set_option("display.max_colwidth", None)
    pd.set_option("display.width", None)
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
