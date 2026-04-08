# Anime Recommendation System — Data Engineering

## Overview

This repository contains the data engineering component of an anime recommendation system, built on the [Anime Recommendation Database 2020](https://www.kaggle.com/datasets/hernan4444/anime-recommendation-database-2020) from Kaggle. The notebook performs exploratory data analysis, cleaning, preprocessing, and feature engineering on `anime.csv` (~17,562 entries) and `animelist.csv` (~109M user interactions) to produce clean, model-ready datasets for the ML engineering team.

## Repository Structure

```
├── EDA.ipynb                  # Main notebook: EDA, cleaning, preprocessing, export
├── requirements.txt           # Python dependencies
├── README.md
├── .gitignore
├── processed_data/            # Generated locally after running the notebook (not in repo)
│   ├── anime_processed.csv
│   ├── animelist_clean.csv
│   ├── explicit_ratings.csv
│   └── implicit_interactions.csv
├── anime.csv                  # Raw data (not in repo — download from Kaggle)
└── animelist.csv              # Raw data (not in repo — download from Kaggle)
```

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Download the raw data

Download the following files from [Kaggle](https://www.kaggle.com/datasets/hernan4444/anime-recommendation-database-2020) and place them in the project root:

- `anime.csv` (~6 MB)
- `animelist.csv` (~2 GB)

### 3. Run the notebook

Open `EDA.ipynb` in Jupyter or VS Code and run all cells. The notebook uses chunked CSV reading to handle the large `animelist.csv` without exceeding memory limits. All processed datasets will be generated into the `processed_data/` directory.

**Expected runtime:** 10–20 minutes depending on hardware, mostly due to the 109M-row animelist processing and CSV exports.

## Notebook Sections

| # | Section | Description |
|---|---------|-------------|
| 1 | Loading & Initial Inspection | Loads both CSVs (chunked for animelist), computes sparsity, samples 5,000 users for EDA |
| 2 | EDA on anime.csv | 11 subsections: missing values, type, score, genre, episodes, source, popularity, score breakdown, temporal trends, watching status, correlations |
| 3 | Data Preprocessing — anime.csv | Drops low-information columns, one-hot encodes genres, cleans numerics, groups Source, engineers Fav_ratio, removes Hentai/Unknown |
| 4 | EDA on animelist.csv | 6 subsections: rating distribution, watching status, user activity, anime popularity, rating by status, watched episodes |
| 5 | Combined Analysis | Merge coverage, user vs MAL scores, type/genre patterns, cold start, user bias |
| 6 | Preprocessing — animelist.csv | Cleans invalid statuses, separates explicit/implicit, cold-start filtering (min 5 ratings per user/anime), exports |
| 7 | Key Findings & Implications | Summary of findings and recommendations for model design |

## Output Datasets

None of the processed datasets are stored in the repository due to their size (1–2 GB each). They are all generated locally by running `EDA.ipynb` with the raw Kaggle CSVs. The notebook exports four files to `processed_data/`:

### `anime_processed.csv`
Cleaned anime metadata with:
- 7 low-information columns dropped
- ~41 one-hot encoded genre columns
- `Source_grouped` (top 5 sources + "Other")
- `Fav_ratio` (Favorites / Members)
- Hentai entries and Unknown genres removed
- **~15,500 rows**

### `animelist_clean.csv`
The full cleaned interaction log after removing invalid statuses and unmatched anime, but before the explicit/implicit split and before cold-start filtering. **~100M rows, ~2 GB.**

This is equivalent to concatenating `explicit_ratings.csv` and `implicit_interactions.csv` (they are the rating > 0 and rating == 0 subsets respectively).

### `explicit_ratings.csv`
User-anime ratings where `rating > 0`, after:
- Removing invalid watching statuses (0, 5, 33, 55)
- Removing interactions with anime not in the processed set
- Cold-start filtering: users and anime with fewer than 5 ratings are iteratively removed until convergence
- **~57M rows** (estimate)

### `implicit_interactions.csv`
Interactions where `rating == 0` (user watched/planned but didn't rate), useful for implicit feedback models.
- Same validity cleaning as explicit (valid statuses, matched anime)
- No cold-start filtering applied — ML team can apply their own thresholds
- **~46M rows** (estimate)

## Key Findings

- **109M interactions** across ~325K users and ~17,500 anime; user-item matrix is **~98% sparse**
- **42.9% of interactions are unrated** (implicit feedback via watching status / episodes watched)
- Ratings are positively skewed — 7 and 8 are the most common scores
- Anime popularity follows a **long-tail distribution**; a small fraction drives most engagement
- **66% of users rate above the global mean**, so user bias normalization is important
- Comedy, Action, and Music are the most common genres; Thriller and Josei have higher average scores
- Cold-start filtering is essential — many users and anime have very few ratings

## Notes for the ML Team

- The **high sparsity (~98%)** favors matrix factorization over memory-based collaborative filtering
- **Content-based features** (41 genre dummies, type, source, studio) can help with the cold-start problem
- **Implicit interactions** (46M rows of watching/planning behavior) are available for implicit feedback models
- Consider **hybrid approaches** combining collaborative and content-based methods
- **User bias normalization** is recommended given the skewed rating behavior
- All processed datasets must be generated locally — download the raw CSVs from Kaggle and run the notebook

## Refresh Offline Frontend Recommendations

The frontend is fully static and reads recommendation artifacts from `web/public/data/recommendations.json`.
To regenerate those recommendations from notebook-trained models (`CF`, `content`, `hybrid`, `popular`, `random`):

1. Run `modeling/modeling.ipynb` through the cells that train/fit:
   - `algo` (SVD collaborative filtering)
   - `tfidf` (content-based model)
   - `meta` (metadata model used in hybrid)
   - `popular` and `random`
2. Run the export helper cell at the end of the notebook:
   - `export_frontend_data(top_n=16, n_demo_users=2, seed=42)`
3. Confirm the exported file exists:
   - `web/public/data/recommendations.json`
4. Build frontend assets:
   - `cd web && npm install && npm run build`

The export helper validates that recommended `mal_id` values exist in the catalog and applies fallbacks so the UI remains usable even if one model has sparse outputs.

## Data Source

[Anime Recommendation Database 2020](https://www.kaggle.com/datasets/hernan4444/anime-recommendation-database-2020) by Hernan4444 on Kaggle.
