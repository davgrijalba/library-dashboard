# Dashboard data: provenance

This is the dashboard copy of the reviewed data. Each CSV in this folder is written by one percent-cell Python script in `dashboard/scripts/` and published with the site from `dashboard/public/`. Raw inputs are read from `Session 1/data/` and are never modified. Built on 2026-10-19 by three worker subagents and reviewed by the parent agent (each script was rerun and produced byte-identical files).

| CSV | Written by | Raw input | Complete or sampled |
|---|---|---|---|
| `annual_digital_physical_share.csv` | `scripts/annual_digital_physical_share.py` | `combined_checkout_totals_by_month_usageclass.csv` | **Complete** monthly totals |
| `digital_top_sampled_titles_by_year.csv` | `scripts/top_sampled_titles_by_year.py` | `digital_checkout_title_sample_balanced_250k.csv` | **Sampled** |
| `physical_top_sampled_titles_by_year.csv` | `scripts/top_sampled_titles_by_year.py` | `physical_checkout_title_sample_balanced_250k.csv` | **Sampled** |
| `digital_material_type_shares_by_year.csv` | `scripts/material_type_shares_by_year.py` | `digital_checkout_title_sample_balanced_250k.csv` | **Sampled** |
| `physical_material_type_shares_by_year.csv` | `scripts/material_type_shares_by_year.py` | `physical_checkout_title_sample_balanced_250k.csv` | **Sampled** |

## How to regenerate

From the `Session 3/dashboard` folder (this copy), with the Session 1 `.venv` active. These copies write to `dashboard/public/dashboard_data/`:

```
python scripts/annual_digital_physical_share.py
python scripts/top_sampled_titles_by_year.py
python scripts/material_type_shares_by_year.py
```

Each script finds the data from its own location, so the working directory does not matter. Each one ends with `assert` checks and stops with an error if a check fails.

## File details

### `annual_digital_physical_share.csv`
- **One row** = one calendar year, 2005–2026 (22 rows).
- **Columns:** `year, physical_checkouts, digital_checkouts, total_checkouts, physical_share_pct, digital_share_pct, months_physical, months_digital, complete_year`
- **Calculation:** monthly `total_checkouts` summed per year and usage class; shares are percent of that year's total.
- **Checks:** output total equals input total (176,191,053); shares add to 100 each year; complete years are exactly 2006–2025.
- **Caveat:** 2005 (Physical from April, Digital from September) and 2026 (January–April) are partial years, marked `complete_year = False`. Do not compare their totals with full years.

### `digital_top_sampled_titles_by_year.csv`, `physical_top_sampled_titles_by_year.csv`
- **One row** = one title ranked in the top 10 for one year (200 rows per file, 2006–2025).
- **Columns:** `year, rank, title, creator, materialtype, publisher, publicationyear, subjects, isbn, usageclass, sampled_checkouts, sampled_months`
- **Calculation:** checkouts summed per year and exact title text across sampled rows; top 10 per year (ties broken alphabetically). Metadata is the most frequent non-missing value for that title in that year. `sampled_months` = number of sampled title-month rows.
- **Checks:** 10 rows per year; ranks 1–10 with no duplicates; checkouts non-increasing by rank; three random (year, title) pairs recomputed from the raw sample match.
- **Caveats:**
  - "Most checked out" means most checked out **among sampled rows**, not the library's true top title. A title's months may only be partly in the sample.
  - Titles are grouped by exact text, so edition variants (for example "Blink…" and "Blink… (unabridged)") count separately.
  - The digital list includes magazines (for example *Newsweek*, *Consumer Reports*).
  - Digital: 3 rows with a missing title were dropped.

### `digital_material_type_shares_by_year.csv`, `physical_material_type_shares_by_year.csv`
- **One row** = one material type in one year (long format; 99 digital rows, 282 physical rows).
- **Columns:** `year, usageclass, materialtype, sampled_rows, sampled_checkouts, row_share_pct, checkout_share_pct`
- **Calculation:** `materialtype` upper-cased and trimmed (fixes `EBOOK`/`Ebook`); per year, rows and checkouts counted per type and divided by that year's sample totals.
- **Checks:** years exactly 2006–2025; 12,500 sampled rows per year; both shares add to 100 per year (within rounding); no lower-case material types.
- **Caveats:** shares describe the **balanced sample**, not the full collection. Combined physical values such as `SOUNDDISC, VIDEODISC` are kept as their own category.
