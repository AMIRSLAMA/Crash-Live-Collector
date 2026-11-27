# Crash-Live-Collector

An isolated, local-first service for recording round results supplied by the operator and reviewing descriptive historical statistics.

## Features
- Arabic RTL dashboard at `/`.
- Manual round entry and JSON API ingestion.
- Persistent JSONL storage in a dedicated Docker named volume.
- Historical median, last-30 median, below-2x / at-least-2x percentages, minimum and maximum.
- Multiplier distribution across six descriptive ranges, compared for all history and the latest 30 / 100 / 500 rounds.
- Sequence analysis: below-2x / at-least-2x transitions, current and longest streaks, and sequential block summaries.
- Historical volatility comparison: sequential blocks measured by interquartile range (IQR) and median absolute deviation (MAD), with relative lower / middle / higher spread groups.
- Input validation, duplicate-ID protection, bounded request size and batch size.
- No game-internal access, private traffic interception, account/session collection, prediction claims or wagering automation.
- Walk-forward pattern matching compares context-frequency probabilities to a rolling-rate baseline using minimum support and smoothing; it is not a forecast.

## Local run
Requires Node.js 20+.
```bash
npm test
npm start
```
Open `http://localhost:3000`.

## API
- `GET /health` — service health.
- `GET /api/rounds?limit=100` — latest recorded rounds (maximum 1,000).
- `GET /api/export.csv` — download the recorded history as CSV.
- `GET /api/stats` — descriptive statistics.
- `GET /api/proportion-confidence?threshold=2` — Wilson 95% confidence interval for the observed share below a selected threshold (default 2x). It summarizes sampling uncertainty only, not the next round.
- `GET /api/data-audit` — record integrity checks: duplicate IDs, timestamp validity, occurrence-time reversals, future timestamps, and gaps between captured rounds. Capture gaps are warnings only and do not prove missing rounds.
- `GET /api/distribution` — multiplier buckets for all recorded rounds and the latest 30, 100 and 500 rounds, with counts, percentages and medians. Shorter histories use the available rows.
- `GET /api/sequence?groupSize=10` — transition counts around the descriptive 2x threshold, streak lengths, and summaries for the latest ten sequential blocks. Group size is clamped to 5–100. Sequence order is ingestion/import order, not inferred timestamp order.
- `GET /api/volatility?groupSize=20` — compares sequential blocks using IQR and MAD, summarizes relative spread groups, and returns the latest 20 blocks. Group size is clamped to 5–100; the classification is descriptive within the recorded sample only.

- `GET /api/pattern-holdout-discovery?trainFraction=0.6&minTrainSupport=8&minTestSupport=5` — exploratory chronological holdout scan. Discovers fixed 3–5 round contexts on the first 60% only, scores matching occurrences on the later 40%, and compares Brier / Log Loss against the training-only rate. Results are ranked descriptively; this is a multiple-candidate screen, not confirmatory evidence, and it has no null/permutation or FDR correction.
- `GET /api/sequence-pattern-test?window=50` — strict walk-forward sequence-pattern comparison: contexts of 3–5 binary rounds, minimum 8 historical matches, smoothing toward the rolling baseline with fixed prior strength 10, and Brier / Log Loss comparison. Shows a 50-row audit trail; fewer than 100 evaluations are labeled descriptive only.
- `GET /api/predictive-test?window=30` — strict walk-forward binary probability evaluation for below-2x outcomes. Each prediction uses only the preceding rolling window; the baseline uses all rounds available before that target. Reports Brier score, log loss, accuracy, calibration summary and the latest 50 auditable predictions. Fewer than 100 evaluated rounds are labeled descriptive only; this is not proof of a predictive edge.
- `GET /api/backtest?window=30` — walk-forward historical evaluation: compares a rolling-window median against a fixed initial-window median and reports mean absolute error plus below-2x classification accuracy. Requires more rounds than the selected window (10–500).
- `POST /api/rounds` — add one round or a batch of up to 500.
- `POST /api/import` — import CSV (`roundId,multiplier,occurredAt`) or JSON (array / `{ rounds: [...] }`), up to 500 rows and 1 MiB.

Example:
```json
{"rounds":[{"roundId":"round-001","multiplier":1.45,"occurredAt":"2026-11-26T12:00:00.000Z"},{"roundId":"round-002","multiplier":2.8}]}
```
Multiplier must be from 1 to 1,000,000. IDs are generated when omitted; duplicate IDs return HTTP 409. Imports validate the complete batch before writing, so invalid or duplicate batches are rejected without partial insertion. The dashboard includes a file picker for CSV and JSON imports.

## Docker
```bash
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:3038/health
```
Dashboard: `http://127.0.0.1:3038`. Data persists in the dedicated `crash_live_data` volume. Stop without deleting data: `docker compose down`.

## GitHub Actions and deployment
- CI runs tests and builds the Docker image on pushes and pull requests to `main`.
- Deployment is manual only and requires the exact confirmation `DEPLOY`.
- Configure the `production` GitHub Environment and secrets only when ready: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`.
- Destination is fixed at `/home/amir/crash-live-collector`; Compose project is `crash-live-collector`.
- SSH host-key checking remains enabled.

No deployment has been performed. Keep this project isolated from Hesbah, ROHNY and all other server services.

## Interpretation
Statistics, sequence analysis and walk-forward backtests describe only the supplied historical sample. The backtest evaluates later recorded rounds using earlier history and compares against a simple fixed baseline; it is not a live prediction, does not establish a reliable way to predict future random outcomes, and cannot guarantee a result.
