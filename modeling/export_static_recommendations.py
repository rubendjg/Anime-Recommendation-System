"""
Build web/public/data/recommendations.json using the same setup as modeling.ipynb:
- Sample: first N_USERS shuffled users from explicit_ratings (SEED=42), ratings in [1, 10].
- PopularRecommender(MIN_ITEM_RATINGS) — same logic as the notebook class.
- SVD-style collaborative filtering: Surprise SVD when `surprise` is importable; otherwise a
  NumPy SGD biased matrix factorization with n_factors=50, n_epochs=10, lr=0.005, reg=0.02
  (Surprise SVD defaults, matching the notebook hyperparameters).

Hybrid score for **forYou** (SVD + Popular only; notebook also uses TF-IDF + metadata — those are
omitted here): same relative weights as `modeling.ipynb` `build_hybrid_scores` for the parts we
export: w_svd=0.50 and w_pop=0.10 renormalized over (0.50+0.10) → **5/6 SVD + 1/6 Popular**.

Also exports:
- **popular**: global non-personalized top-K from the **same** `PopularRecommender` instance
  fitted on the **CF training sample** (identical for all users in the UI), matching the notebook
  setup — not a separate full-CSV aggregate.
- **svd**: pure SVD (or NumPy MF) top-`TOP_K_SVD` per profile (longer than hybrid so the UI
  spotlight can show many slides after dropping titles that appear in `forYou`).
- **random**: random baseline — fixed-seed shuffle of unrated catalog items with Normal(μ,σ) scores
  (same spirit as notebook RandomRecommender).

Two users are drawn at random (USER_PICK_SEED) from the sample among those with at least
MIN_RATINGS_PER_USER ratings.

Run from repository root:
  python modeling/export_static_recommendations.py
  python modeling/export_static_recommendations.py --fetch-posters   # fills web/public/data/posters.json via Jikan

Requires: processed_data/explicit_ratings.csv, web/public/data/catalog.json
Optional: pip install surprise (same as notebook) for bitwise-closer training to modeling.ipynb.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Sequence

import numpy as np
import pandas as pd

try:
    from surprise import AlgoBase, Dataset, Reader, SVD  # type: ignore[import-not-found]

    _HAS_SURPRISE = True
except ImportError:
    AlgoBase = object  # type: ignore[misc, assignment]
    _HAS_SURPRISE = False

# --- Mirrors modeling.ipynb ---
SEED = 42
TOP_K = 20
# Pure SVD list for the web spotlight (filtered client-side vs hybrid `forYou`); keep > TOP_K.
TOP_K_SVD = 40
MIN_ITEM_RATINGS = 500
N_USERS = 5000
SVD_SEED = 1234
MIN_RATINGS_PER_USER = 20
USER_PICK_SEED = 999
RANDOM_EXPORT_SEED = 31_415
# modeling.ipynb build_hybrid_scores: w_svd=0.50, w_tfidf=0.25, w_meta=0.15, w_pop=0.10
# Export only SVD + Popular → renormalize onto (w_svd + w_pop).
_NB_W_SVD = 0.50
_NB_W_POP = 0.10
_NB_SP = _NB_W_SVD + _NB_W_POP
HYBRID_SVD_WEIGHT = _NB_W_SVD / _NB_SP
HYBRID_POP_WEIGHT = _NB_W_POP / _NB_SP
# Cap ratings per user in JSON (full history can be huge)
MAX_RATINGS_EXPORT = 500

# Web UI profile labels (JSON keys stay viewer-a / viewer-b)
VIEWER_A_DISPLAY_NAME = "Oskar"
VIEWER_B_DISPLAY_NAME = "Daniel"

# Surprise SVD defaults (used by NumPy fallback)
_MF_LR = 0.005
_MF_REG = 0.02
_MF_N_FACTORS = 50
_MF_N_EPOCHS = 10


class PopularRecommender(AlgoBase if _HAS_SURPRISE else object):
    def __init__(self, min_ratings: int = MIN_ITEM_RATINGS):
        if _HAS_SURPRISE:
            AlgoBase.__init__(self)
        self.min_ratings = min_ratings
        self.item_means: pd.Series | None = None
        self.global_mean: float = 0.0
        self._inner_item_means: dict[int, float] | None = None

    def fit_from_counts(self, item_inner: Sequence[int], ratings: Sequence[float]) -> None:
        df = pd.DataFrame({"item": item_inner, "rating": ratings})
        stats = df.groupby("item").agg(
            count=("rating", "count"),
            mean=("rating", "mean"),
        )
        means = stats.loc[stats["count"] >= self.min_ratings, "mean"]
        self._inner_item_means = {int(i): float(v) for i, v in means.items()}
        self.global_mean = float(np.mean(ratings))

    def fit_surprise(self, trainset) -> "PopularRecommender":
        df = pd.DataFrame(
            [(i, r) for (_, i, r) in trainset.all_ratings()],
            columns=["item", "rating"],
        )
        stats = df.groupby("item").agg(
            count=("rating", "count"),
            mean=("rating", "mean"),
        )
        self.item_means = stats.loc[stats["count"] >= self.min_ratings, "mean"]
        self.global_mean = trainset.global_mean
        return self

    def estimate_inner(self, inner_iid: int) -> float:
        if _HAS_SURPRISE and self.item_means is not None:
            if inner_iid in self.item_means.index:
                return float(self.item_means[inner_iid])
            return float(self.global_mean)
        if self._inner_item_means is not None and inner_iid in self._inner_item_means:
            return self._inner_item_means[inner_iid]
        return float(self.global_mean)

    if _HAS_SURPRISE:

        def fit(self, trainset):
            return self.fit_surprise(trainset)

        def estimate(self, u, i):
            return self.estimate_inner(i)


class BiasedMF:
    """Funk SVD–style biased MF (NumPy), aligned with common Surprise SVD settings."""

    def __init__(
        self,
        n_users: int,
        n_items: int,
        n_factors: int = _MF_N_FACTORS,
        n_epochs: int = _MF_N_EPOCHS,
        lr: float = _MF_LR,
        reg: float = _MF_REG,
        random_state: int = SVD_SEED,
    ):
        rng = np.random.default_rng(random_state)
        self.n_users = n_users
        self.n_items = n_items
        self.n_factors = n_factors
        self.n_epochs = n_epochs
        self.lr = lr
        self.reg = reg
        self.global_mean = 0.0
        self.bu = np.zeros(n_users, dtype=np.float64)
        self.bi = np.zeros(n_items, dtype=np.float64)
        self.pu = rng.normal(0, 0.1, (n_users, n_factors))
        self.qi = rng.normal(0, 0.1, (n_items, n_factors))

    def fit(self, rows: list[tuple[int, int, float]]) -> None:
        ratings = [r for _, _, r in rows]
        self.global_mean = float(np.mean(ratings))
        order = np.arange(len(rows))
        rng = np.random.default_rng(SVD_SEED)
        for _ in range(self.n_epochs):
            rng.shuffle(order)
            for idx in order:
                u, i, r = rows[idx]
                pred = (
                    self.global_mean
                    + self.bu[u]
                    + self.bi[i]
                    + float(self.pu[u] @ self.qi[i])
                )
                err = r - pred
                self.bu[u] += self.lr * (err - self.reg * self.bu[u])
                self.bi[i] += self.lr * (err - self.reg * self.bi[i])
                pu_old = self.pu[u].copy()
                self.pu[u] += self.lr * (err * self.qi[i] - self.reg * self.pu[u])
                self.qi[i] += self.lr * (err * pu_old - self.reg * self.qi[i])

    def predict(self, u: int, i: int) -> float:
        return float(
            self.global_mean
            + self.bu[u]
            + self.bi[i]
            + float(self.pu[u] @ self.qi[i])
        )


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_catalog_mal_ids(catalog_path: Path) -> set[int]:
    with catalog_path.open(encoding="utf-8") as f:
        rows = json.load(f)
    return {int(a["mal_id"]) for a in rows}


def aggregate_rating_stats_per_anime(
    ratings_path: Path,
    catalog_ids: set[int],
    chunksize: int = 1_000_000,
) -> tuple[dict[int, int], dict[int, float]]:
    """
    Per-anime rating count and sum over the full explicit_ratings file (memory-safe chunks).
    Only rows whose anime_id is in catalog_ids are accumulated.
    """
    counts: dict[int, int] = {}
    sums: dict[int, float] = {}
    for chunk in pd.read_csv(
        ratings_path,
        usecols=["anime_id", "rating"],
        chunksize=chunksize,
    ):
        chunk["anime_id"] = chunk["anime_id"].astype(int)
        chunk = chunk[chunk["anime_id"].isin(catalog_ids)]
        if chunk.empty:
            continue
        g = chunk.groupby("anime_id", sort=False)["rating"]
        for aid, ser in g:
            aid = int(aid)
            c = int(ser.shape[0])
            s = float(ser.sum())
            counts[aid] = counts.get(aid, 0) + c
            sums[aid] = sums.get(aid, 0.0) + s
    return counts, sums


def popular_rows_from_full_ratings(
    counts: dict[int, int],
    sums: dict[int, float],
    k: int,
) -> list[tuple[int, float]]:
    """
    Notebook Popular logic: rank by mean rating, but only among items with >= min_ratings.
    If too few items qualify at 500, try lower floors (sparse exports / fixtures).
    """
    if not counts:
        return []
    rows_np = np.array(
        [(aid, counts[aid], sums[aid] / counts[aid]) for aid in counts],
        dtype=np.float64,
    )
    thresholds = [MIN_ITEM_RATINGS, 200, 100, 50, 20, 10, 5, 1]
    for thr in thresholds:
        mask = rows_np[:, 1] >= thr
        sub = rows_np[mask]
        if sub.shape[0] == 0:
            continue
        if sub.shape[0] >= k or thr == 1:
            # Primary: mean desc; secondary: count desc (numpy lexsort: last key is primary)
            order = np.lexsort((-sub[:, 1], -sub[:, 2]))
            sub = sub[order]
            out: list[tuple[int, float]] = []
            for i in range(min(k, sub.shape[0])):
                out.append((int(sub[i, 0]), round(float(sub[i, 2]), 2)))
            return out
    return []


def popular_rows_from_catalog_members(
    catalog_path: Path,
    catalog_ids: set[int],
    k: int,
) -> list[tuple[int, float]]:
    """Fallback: MAL community size from catalog.json (1–10 scale for UI)."""
    with catalog_path.open(encoding="utf-8") as f:
        rows = json.load(f)
    items = [
        (int(a["mal_id"]), float(a.get("members", 0) or 0))
        for a in rows
        if int(a["mal_id"]) in catalog_ids
    ]
    items.sort(key=lambda x: -x[1])
    if not items:
        return []
    mx = items[0][1] if items[0][1] > 0 else 1.0
    return [
        (mid, round(1.0 + 9.0 * (mem / mx), 2))
        for mid, mem in items[:k]
    ]


def build_popular_export(
    ratings_path: Path,
    catalog_path: Path,
    catalog_ids: set[int],
    k: int,
) -> list[dict]:
    counts, sums = aggregate_rating_stats_per_anime(ratings_path, catalog_ids)
    max_cnt = max(counts.values()) if counts else 0
    # With almost no ratings per title (e.g. tiny fixture), mean-rating "Popular" is meaningless;
    # use MAL catalog members so the row matches real-world popularity.
    if max_cnt < 100:
        return pairs_to_json(
            popular_rows_from_catalog_members(catalog_path, catalog_ids, k)
        )
    pairs = popular_rows_from_full_ratings(counts, sums, k)
    if len(pairs) < k:
        members = popular_rows_from_catalog_members(catalog_path, catalog_ids, k)
        seen = {m for m, _ in pairs}
        for mid, est in members:
            if mid in seen:
                continue
            pairs.append((mid, est))
            seen.add(mid)
            if len(pairs) >= k:
                break
        pairs = pairs[:k]
    return pairs_to_json(pairs)


def build_sample(ratings_path: Path) -> pd.DataFrame:
    ratings_df = pd.read_csv(
        ratings_path,
        usecols=["user_id", "anime_id", "rating"],
    )
    np.random.seed(SEED)
    all_users = ratings_df["user_id"].unique()
    np.random.shuffle(all_users)
    chosen = set(all_users[:N_USERS])
    sample = ratings_df[ratings_df["user_id"].isin(chosen)][
        ["user_id", "anime_id", "rating"]
    ].copy()
    sample["user_id"] = sample["user_id"].astype(int)
    sample["anime_id"] = sample["anime_id"].astype(int)
    return sample


def user_ratings_for_export(
    sample: pd.DataFrame,
    uid: int,
    catalog_ids: set[int],
    max_items: int | None = MAX_RATINGS_EXPORT,
) -> list[dict]:
    """All ratings for uid in the training sample, limited to titles in catalog.json."""
    sub = sample.loc[sample["user_id"] == uid, ["anime_id", "rating"]]
    rows: list[dict] = []
    for anime_id, rating in zip(sub["anime_id"], sub["rating"]):
        aid = int(anime_id)
        if aid not in catalog_ids:
            continue
        rows.append({"mal_id": aid, "rating": round(float(rating), 1)})
    rows.sort(key=lambda x: (-x["rating"], x["mal_id"]))
    if max_items is not None and len(rows) > max_items:
        rows = rows[:max_items]
    return rows


def pairs_to_json(pairs: list[tuple[int, float]]) -> list[dict]:
    return [
        {"mal_id": int(mid), "predicted_rating": round(est, 2)}
        for mid, est in pairs
    ]


def collect_export_mal_ids(out: dict) -> set[int]:
    """MAL IDs referenced by recommendations.json (spotlight, popular, per-profile rows)."""
    ids: set[int] = set()
    fm = out.get("featuredMalId")
    if isinstance(fm, int):
        ids.add(fm)
    pop = out.get("popular")
    if isinstance(pop, list):
        for e in pop:
            if isinstance(e, dict):
                mid = e.get("mal_id")
                if isinstance(mid, int):
                    ids.add(mid)
                elif isinstance(mid, float) and mid == int(mid):
                    ids.add(int(mid))
    users = out.get("users")
    if isinstance(users, dict):
        for prof in users.values():
            if not isinstance(prof, dict):
                continue
            for key in ("forYou", "svd", "random"):
                lst = prof.get(key)
                if not isinstance(lst, list):
                    continue
                for e in lst:
                    if not isinstance(e, dict):
                        continue
                    mid = e.get("mal_id")
                    if isinstance(mid, int):
                        ids.add(mid)
                    elif isinstance(mid, float) and mid == int(mid):
                        ids.add(int(mid))
    return ids


_JIKAN_GAP_SEC = 0.36
_last_jikan_monotonic = 0.0


def _jikan_throttle() -> None:
    global _last_jikan_monotonic
    now = time.monotonic()
    wait = _last_jikan_monotonic + _JIKAN_GAP_SEC - now
    if wait > 0:
        time.sleep(wait)
    _last_jikan_monotonic = time.monotonic()


def _pick_jikan_image_url(images_obj: object) -> str | None:
    if not isinstance(images_obj, dict):
        return None
    for fmt in ("jpg", "webp"):
        block = images_obj.get(fmt)
        if not isinstance(block, dict):
            continue
        for key in ("large_image_url", "image_url"):
            u = block.get(key)
            if isinstance(u, str) and u.strip():
                return u.strip()
    return None


def _jikan_get_json(url: str, retries: int = 6) -> dict | None:
    headers = {"User-Agent": "HanamiStaticExport/1.0 (education)"}
    for attempt in range(retries):
        _jikan_throttle()
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                if resp.status != 200:
                    return None
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504) and attempt + 1 < retries:
                ra = e.headers.get("Retry-After")
                try:
                    sec = float(ra) if ra else float(attempt + 1) * 2.0
                except ValueError:
                    sec = float(attempt + 1) * 2.0
                time.sleep(min(max(sec, 1.0), 25.0))
                continue
            return None
        except OSError:
            if attempt + 1 < retries:
                time.sleep(min(2.0 * (attempt + 1), 20.0))
                continue
            return None
    return None


def fetch_jikan_poster_url(mal_id: int) -> str | None:
    if mal_id <= 0:
        return None
    base = f"https://api.jikan.moe/v4/anime/{mal_id}"
    main = _jikan_get_json(base)
    if isinstance(main, dict):
        data = main.get("data")
        if isinstance(data, dict):
            u = _pick_jikan_image_url(data.get("images"))
            if u:
                return u
    pics = _jikan_get_json(f"{base}/pictures")
    if isinstance(pics, dict):
        arr = pics.get("data")
        if isinstance(arr, list) and arr:
            first = arr[0]
            if isinstance(first, dict):
                u = _pick_jikan_image_url(first)
                if u:
                    return u
    return None


def write_posters_json(mal_ids: set[int], dest: Path) -> tuple[int, int]:
    """Fetch poster URLs via Jikan; writes {\"mal_id\": \"https://...\", ...}."""
    out_map: dict[str, str] = {}
    total = sum(1 for m in mal_ids if m > 0)
    for mid in sorted(mal_ids):
        if mid <= 0:
            continue
        u = fetch_jikan_poster_url(mid)
        if u:
            out_map[str(mid)] = u
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as f:
        json.dump(out_map, f, indent=2)
        f.write("\n")
    return len(out_map), total


def pick_two_users(sample: pd.DataFrame, rng: np.random.Generator) -> tuple[int, int]:
    counts = sample.groupby("user_id").size()
    eligible = counts[counts >= MIN_RATINGS_PER_USER].index.to_numpy()
    if len(eligible) < 2:
        raise RuntimeError(
            f"Need at least 2 users with >={MIN_RATINGS_PER_USER} ratings in the "
            f"{N_USERS}-user sample; found {len(eligible)}."
        )
    choice = rng.choice(eligible, size=2, replace=False)
    return int(choice[0]), int(choice[1])


def top_hybrid_numpy(
    mf: BiasedMF,
    popular: PopularRecommender,
    user2idx: dict[int, int],
    idx2item: list[int],
    raw_uid: int,
    catalog_ids: set[int],
    rated_items: set[int],
    k: int,
) -> list[tuple[int, float]]:
    u = user2idx[raw_uid]
    scored: list[tuple[int, float]] = []
    for inner_i, raw_iid in enumerate(idx2item):
        if raw_iid in rated_items:
            continue
        if raw_iid not in catalog_ids:
            continue
        svd_e = mf.predict(u, inner_i)
        pop_e = popular.estimate_inner(inner_i)
        hybrid = HYBRID_SVD_WEIGHT * svd_e + HYBRID_POP_WEIGHT * pop_e
        scored.append((raw_iid, float(hybrid)))
    scored.sort(key=lambda x: -x[1])
    return scored[:k]


def top_svd_only_numpy(
    mf: BiasedMF,
    user2idx: dict[int, int],
    idx2item: list[int],
    raw_uid: int,
    catalog_ids: set[int],
    rated_items: set[int],
    k: int,
) -> list[tuple[int, float]]:
    u = user2idx[raw_uid]
    scored: list[tuple[int, float]] = []
    for inner_i, raw_iid in enumerate(idx2item):
        if raw_iid in rated_items or raw_iid not in catalog_ids:
            continue
        scored.append((raw_iid, float(mf.predict(u, inner_i))))
    scored.sort(key=lambda x: -x[1])
    return scored[:k]


def top_random_recs_numpy(
    raw_uid: int,
    idx2item: list[int],
    catalog_ids: set[int],
    rated_items: set[int],
    k: int,
) -> list[tuple[int, float]]:
    rng = np.random.default_rng(RANDOM_EXPORT_SEED + int(raw_uid) % 100_000)
    eligible = [
        iid for iid in idx2item if iid not in rated_items and iid in catalog_ids
    ]
    rng.shuffle(eligible)
    picks = eligible[:k]
    mean, std = 7.45, 1.75
    return [(iid, round(float(rng.normal(mean, std)), 2)) for iid in picks]


def top_popular_from_surprise_trainset(
    trainset,
    popular: PopularRecommender,
    catalog_ids: set[int],
    k: int,
) -> list[tuple[int, float]]:
    """
    Global popular list from the same PopularRecommender fitted on the CF trainset
    (PopularRecommender scores do not depend on user; raw_u is only for Surprise.predict API).
    """
    raw_u = int(trainset.to_raw_uid(int(trainset.all_users()[0])))
    scored: list[tuple[int, float]] = []
    for inner_iid in trainset.all_items():
        raw_iid = int(trainset.to_raw_iid(inner_iid))
        if raw_iid not in catalog_ids:
            continue
        est = float(popular.predict(raw_u, raw_iid).est)
        scored.append((raw_iid, est))
    scored.sort(key=lambda x: (-x[1], -x[0]))
    return scored[:k]


def top_popular_from_numpy_indices(
    popular: PopularRecommender,
    idx2item: list[int],
    catalog_ids: set[int],
    k: int,
) -> list[tuple[int, float]]:
    scored: list[tuple[int, float]] = []
    for inner_i, raw_iid in enumerate(idx2item):
        ri = int(raw_iid)
        if ri not in catalog_ids:
            continue
        scored.append((ri, float(popular.estimate_inner(inner_i))))
    scored.sort(key=lambda x: (-x[1], -x[0]))
    return scored[:k]


def export_with_surprise(
    sample: pd.DataFrame,
    catalog_ids: set[int],
) -> tuple[dict, int, int]:
    reader = Reader(rating_scale=(1, 10))
    data = Dataset.load_from_df(
        sample[["user_id", "anime_id", "rating"]],
        reader,
    )
    trainset = data.build_full_trainset()
    np.random.seed(SVD_SEED)
    svd = SVD(
        random_state=SVD_SEED,
        n_factors=_MF_N_FACTORS,
        n_epochs=_MF_N_EPOCHS,
        verbose=False,
    )
    svd.fit(trainset)
    popular = PopularRecommender(min_ratings=MIN_ITEM_RATINGS)
    popular.fit(trainset)

    rng = np.random.default_rng(USER_PICK_SEED)
    u1, u2 = pick_two_users(sample, rng)

    def top_hybrid(raw_uid: int, k: int) -> list[tuple[int, float]]:
        inner_uid = trainset.to_inner_uid(raw_uid)
        rated_inner = {j for j, _ in trainset.ur[inner_uid]}
        scored: list[tuple[int, float]] = []
        for inner_iid in trainset.all_items():
            if inner_iid in rated_inner:
                continue
            raw_iid = int(trainset.to_raw_iid(inner_iid))
            if raw_iid not in catalog_ids:
                continue
            svd_e = svd.predict(raw_uid, raw_iid).est
            pop_e = popular.predict(raw_uid, raw_iid).est
            hybrid = HYBRID_SVD_WEIGHT * svd_e + HYBRID_POP_WEIGHT * pop_e
            scored.append((raw_iid, float(hybrid)))
        scored.sort(key=lambda x: -x[1])
        return scored[:k]

    def top_svd_only(raw_uid: int, k: int) -> list[tuple[int, float]]:
        inner_uid = trainset.to_inner_uid(raw_uid)
        rated_inner = {j for j, _ in trainset.ur[inner_uid]}
        scored: list[tuple[int, float]] = []
        for inner_iid in trainset.all_items():
            if inner_iid in rated_inner:
                continue
            raw_iid = int(trainset.to_raw_iid(inner_iid))
            if raw_iid not in catalog_ids:
                continue
            est = svd.predict(raw_uid, raw_iid).est
            scored.append((raw_iid, float(est)))
        scored.sort(key=lambda x: -x[1])
        return scored[:k]

    def top_random_surprise(raw_uid: int, k: int) -> list[tuple[int, float]]:
        inner_uid = trainset.to_inner_uid(raw_uid)
        rated_inner = {j for j, _ in trainset.ur[inner_uid]}
        rng_r = np.random.default_rng(RANDOM_EXPORT_SEED + int(raw_uid) % 100_000)
        eligible: list[int] = []
        for inner_iid in trainset.all_items():
            if inner_iid in rated_inner:
                continue
            raw_iid = int(trainset.to_raw_iid(inner_iid))
            if raw_iid in catalog_ids:
                eligible.append(raw_iid)
        rng_r.shuffle(eligible)
        picks = eligible[:k]
        mean, std = 7.45, 1.75
        return [(iid, round(float(rng_r.normal(mean, std)), 2)) for iid in picks]

    def profile(uid: int, display_name: str) -> dict:
        ratings = user_ratings_for_export(sample, uid, catalog_ids)
        return {
            "malUserId": int(uid),
            "displayName": display_name,
            "ratings": ratings,
            "forYou": pairs_to_json(top_hybrid(uid, TOP_K)),
            "svd": pairs_to_json(top_svd_only(uid, TOP_K_SVD)),
            "random": pairs_to_json(top_random_surprise(uid, TOP_K)),
        }

    first = int(top_hybrid(u1, 1)[0][0])
    out = {
        "defaultUserId": "viewer-a",
        "featuredMalId": first,
        "users": {
            "viewer-a": profile(u1, VIEWER_A_DISPLAY_NAME),
            "viewer-b": profile(u2, VIEWER_B_DISPLAY_NAME),
        },
        "popular": pairs_to_json(
            top_popular_from_surprise_trainset(
                trainset, popular, catalog_ids, TOP_K
            )
        ),
    }
    return out, u1, u2


def export_with_numpy(
    sample: pd.DataFrame,
    catalog_ids: set[int],
) -> tuple[dict, int, int]:
    users = sorted(sample["user_id"].unique())
    items = sorted(sample["anime_id"].unique())
    user2idx = {u: i for i, u in enumerate(users)}
    item2idx = {it: i for i, it in enumerate(items)}
    idx2item = list(items)

    rows_idx: list[tuple[int, int, float]] = []
    irs: list[int] = []
    irv: list[float] = []
    for u, i, r in zip(
        sample["user_id"], sample["anime_id"], sample["rating"].astype(float)
    ):
        ui, ii = user2idx[int(u)], item2idx[int(i)]
        rows_idx.append((ui, ii, float(r)))
        irs.append(ii)
        irv.append(float(r))

    mf = BiasedMF(len(users), len(items))
    mf.fit(rows_idx)

    popular = PopularRecommender(min_ratings=MIN_ITEM_RATINGS)
    popular.fit_from_counts(irs, irv)

    rng = np.random.default_rng(USER_PICK_SEED)
    u1, u2 = pick_two_users(sample, rng)

    rated_by: dict[int, set[int]] = {u: set() for u in users}
    for u, i, _ in rows_idx:
        rated_by[users[u]].add(idx2item[i])

    def top_hybrid_uid(raw_uid: int, k: int) -> list[tuple[int, float]]:
        return top_hybrid_numpy(
            mf,
            popular,
            user2idx,
            idx2item,
            raw_uid,
            catalog_ids,
            rated_by[raw_uid],
            k,
        )

    def profile(uid: int, display_name: str) -> dict:
        r = rated_by[uid]
        ratings = user_ratings_for_export(sample, uid, catalog_ids)
        return {
            "malUserId": int(uid),
            "displayName": display_name,
            "ratings": ratings,
            "forYou": pairs_to_json(
                top_hybrid_numpy(
                    mf,
                    popular,
                    user2idx,
                    idx2item,
                    uid,
                    catalog_ids,
                    r,
                    TOP_K,
                )
            ),
            "svd": pairs_to_json(
                top_svd_only_numpy(
                    mf,
                    user2idx,
                    idx2item,
                    uid,
                    catalog_ids,
                    r,
                    TOP_K_SVD,
                )
            ),
            "random": pairs_to_json(
                top_random_recs_numpy(uid, idx2item, catalog_ids, r, TOP_K)
            ),
        }

    first = int(top_hybrid_uid(u1, 1)[0][0])
    out = {
        "defaultUserId": "viewer-a",
        "featuredMalId": first,
        "users": {
            "viewer-a": profile(u1, VIEWER_A_DISPLAY_NAME),
            "viewer-b": profile(u2, VIEWER_B_DISPLAY_NAME),
        },
        "popular": pairs_to_json(
            top_popular_from_numpy_indices(
                popular, idx2item, catalog_ids, TOP_K
            )
        ),
    }
    return out, u1, u2


def main() -> int:
    root = project_root()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ratings",
        type=Path,
        default=root / "processed_data" / "explicit_ratings.csv",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=root / "web" / "public" / "data" / "catalog.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "web" / "public" / "data" / "recommendations.json",
    )
    parser.add_argument(
        "--force-numpy",
        action="store_true",
        help="Use NumPy MF even if surprise is installed.",
    )
    parser.add_argument(
        "--fetch-posters",
        action="store_true",
        help=(
            "Call the Jikan API and write posters.json (poster URLs by mal_id) for every title "
            "in this export. Default path: same directory as --output."
        ),
    )
    parser.add_argument(
        "--posters-output",
        type=Path,
        default=None,
        help="Path for posters.json when using --fetch-posters (default: <output-dir>/posters.json).",
    )
    args = parser.parse_args()

    if not args.ratings.is_file():
        print(
            f"Missing ratings file: {args.ratings}\n"
            "Generate processed_data with EDA.ipynb first.",
            file=sys.stderr,
        )
        return 1
    if not args.catalog.is_file():
        print(f"Missing catalog: {args.catalog}", file=sys.stderr)
        return 1

    catalog_ids = load_catalog_mal_ids(args.catalog)
    sample = build_sample(args.ratings)

    use_surprise = _HAS_SURPRISE and not args.force_numpy
    if use_surprise:
        out, u1, u2 = export_with_surprise(sample, catalog_ids)
        backend = "surprise.SVD"
    else:
        out, u1, u2 = export_with_numpy(sample, catalog_ids)
        backend = "numpy BiasedMF (Funk SVD-style)"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print(f"Wrote {args.output} for users {u1}, {u2} (backend: {backend})")

    if args.fetch_posters:
        mal_ids = collect_export_mal_ids(out)
        p_dest = args.posters_output or (args.output.parent / "posters.json")
        got, total = write_posters_json(mal_ids, p_dest)
        print(f"Wrote {p_dest}: {got}/{total} poster URLs from Jikan.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
