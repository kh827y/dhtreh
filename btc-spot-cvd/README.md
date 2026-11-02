# BTC Spot CVD (staging)
Isolated experimental research collector. Does **not** affect the loyalty-program application.

## Purpose
Build honest BTC spot buy-taker minus sell-taker USD volume over the same hourly intervals for **Binance, Coinbase, OKX, Bybit, Kraken**, from actual trades (not futures CVD, candles, net exchange transfers or estimates).

Data sources:
- CryptoHFTData free anonymous hourly Parquet trade archives: binance_spot, okx_spot, bybit_spot, kraken_spot. Schema: price, quantity, is_buyer_maker, trade_time. Refer to https://www.cryptohftdata.com/docs/rest-trades and https://www.cryptohftdata.com/docs/data-gaps-and-corrections .
- Coinbase public BTC-USD trades endpoint with pagination (maker side in the side field): https://api.exchange.coinbase.com/products/BTC-USD/trades .

## Integrity
- Every hour must be fully captured. Missing data => null/coverage warning, **never zero**.
- Full 1h/24h/7d/30d five-venue total is emitted only when **all** venues cover exactly the same closed UTC hourly buckets.
- USD and USD-stablecoin markets are annotated; totals assume approximate USD peg.
- Historical Coinbase and Parquet backfill may need multiple workflow runs.
- Public data and its completeness must be verified from a real GitHub Actions run.

## Deployment
Scheduled workflows run only after this change reaches a GitHub repository's **default branch**. This is a staging branch of an unrelated existing repository, deliberately not merged or activated. Prefer moving these files to a dedicated new repository before enabling.
Once deployed to a public default branch, the compact feed is:
https://raw.githubusercontent.com/OWNER/REPO/main/btc-spot-cvd/data/latest.json

No trading keys or Codex needed. GitHub Actions usage is subject to GitHub quotas and provider outages.