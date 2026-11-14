# Base-currency receipt valuation fix — 2026-11-13

The converted cash-flow view previously valued a legacy project receipt at zero when its stored `bamt` was absent, even if the receipt was already in the academy base currency. The original-currency table still counted its original amount, causing the two views to disagree.

The original page's shared PPB helper now preserves an existing stored base amount, including an explicit zero. When that amount is absent and the receipt currency equals the academy base currency, it uses the original receipt amount. Legacy project/course references identify the currency only; their exchange rates are never used to invent a foreign receipt valuation. Unknown or foreign currencies without a stored base amount keep the existing missing-rate behavior.

This matches the reviewed source-only production fix. In this repository the change is a runtime HTML adapter so the reference files under `aplus-preview/original/` remain untouched. No schema, payment rows, exchange-rate records, balances or real database files are written or migrated by the adapter.

Validation uses synthetic data only: 21 valuation/filter/source-preservation checks plus an original-server runtime check that the served page contains and uses the fix. Existing secure gateway regression checks also pass. The full secure build includes the adapter in the server engine. No production publish or real-data transfer is part of this update.
