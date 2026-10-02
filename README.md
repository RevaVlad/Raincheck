# Raincheck

Raincheck helps a recurring group agree on meeting times. The repository contains an Angular frontend, Fastify API, and an explicit-SQL PostgreSQL backend.

## Requirements

- Node.js 22.22.3 or newer (Node 24 recommended)
- npm 11
- Docker with Compose for local PostgreSQL

## Local setup

```sh
npm ci
npm ci --prefix frontend
npm ci --prefix backend
docker compose up -d postgres
cp backend/.env.example backend/.env
npm run db:migrate
```

Apply the idempotent baseline migration and inspect migration status with:

```sh
npm run db:migrate
npm run db:migrate:status
```

Run the frontend and backend in separate terminals:

```sh
npm run dev:backend
npm run dev:frontend
```

The frontend is at `http://localhost:4200`. Its `/api` requests proxy to the backend at `http://localhost:3000`. Health endpoints are `/health/live` and `/health/ready` on the backend. Readiness checks PostgreSQL; liveness only checks the web process.

## Checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run db:migrate:status
```

`npm run db:migrate` is an explicit admin command. Starting the backend never runs migrations. Application code and dependency lockfiles live separately in `frontend/` and `backend/`.

## Backend structure

Domain types and named validation steps live under `backend/src/domain/<entity>/`. Services use concrete repositories backed by `pg` under `backend/src/infrastructure/database/`; SQL migrations are explicit files under `migrations/`. Shared UTC helpers live under `backend/src/shared/time/`.

Concrete services receive the shared `Database` once and construct focused repositories internally; callers do not pass database clients through domain methods. Whole-response interval replacement runs in one transaction. Group timezone, poll dates, daily windows, and availability intervals all use UTC. Tests live under `backend/tests/` and mirror the source responsibility.

`npm test` runs backend unit and database-backed service tests, then frontend tests. After starting PostgreSQL and running migrations, run only the backend service suites with:

```sh
npm --prefix backend run test:db
```

The database checks relationship constraints and the single-open-poll rule. HTTP workflows for creating groups, joining, and editing responses are separate follow-up work.
