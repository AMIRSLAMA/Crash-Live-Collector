# Crash-Live-Collector

An isolated, local-first service for recording round results supplied by the operator and reviewing descriptive historical statistics.

## Features
- Arabic RTL dashboard at `/`.
- Manual round entry and JSON API ingestion.
- Persistent JSONL storage in a dedicated Docker named volume.
- Historical median, last-30 median, below-2x / at-least-2x percentages, minimum and maximum.
- Multiplier distribution across six descriptive ranges, compared for all history and the latest 30 / 100 / 500 rounds.
- Sequence analysis: below-2x / at-least-2x transitions, current and longest streaks, and sequential block summaries.
- Input validation, duplicate-ID protection, bounded request size and batch size.
- No game-internal access, private traffic interception, account/session collection, prediction claims or wagering automation.

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
- `GET /api/distribution` — multiplier buckets for all recorded rounds and the latest 30, 100 and 500 rounds, with counts, percentages and medians. Shorter histories use the available rows.
- `GET /api/sequence?groupSize=10` — transition counts around the descriptive 2x threshold, streak lengths, and summaries for the latest ten sequential blocks. Group size is clamped to 5–100. Sequence order is ingestion/import order, not inferred timestamp order.
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
