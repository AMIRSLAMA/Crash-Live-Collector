# Crash-Live-Collector

A clean, isolated Docker service starter for server-side health monitoring and deployment practice.

> This starter intentionally provides only a health endpoint and deployment plumbing. It does not connect to game internals, intercept private traffic, collect betting signals, or make predictions.

## Stack
- Node.js 20
- Docker Compose
- GitHub Actions CI
- Manual, gated SSH deployment workflow

## Local run
```bash
npm install
npm start
```
Open `http://localhost:3000/health`.

## Docker
```bash
docker compose up --build -d
docker compose ps
curl http://localhost:3000/health
docker compose down
```

## GitHub Actions
- `CI`: runs on pushes and pull requests to `main`.
- `Deploy (manual)`: workflow_dispatch only. Requires the operator to enter `DEPLOY` as confirmation. No deployment is run automatically.

## Deployment secrets
Configure repository Actions secrets only when ready:
- `DEPLOY_HOST`: server hostname/IP
- `DEPLOY_USER`: SSH user
- `DEPLOY_SSH_KEY`: private key for a restricted deployment account
- `DEPLOY_KNOWN_HOSTS`: pinned SSH host-key entry (never disable host-key checking)

The deployment workflow uses a fixed destination `/home/amir/crash-live-collector`. Review the workflow before enabling or running it. No secrets belong in files or commits.

## Isolation
This project uses its own Compose project and directory. Do not point it at existing Hesbah or ROHNY directories, ports, databases, or volumes.
