# Raincheck

Raincheck helps a recurring group agree on meeting times. This repository currently contains the project foundation: Angular frontend, Fastify API, and PostgreSQL schema.

## Requirements

- Node.js 22.22.3 or newer (Node 24 recommended)
- npm 11
- Docker with Compose for local PostgreSQL

## Local setup

```sh
npm ci --prefix frontend
npm ci --prefix backend
docker compose up -d postgres
cp backend/.env.example backend/.env
npm run db:migrate
```

Run the frontend and backend in separate terminals:

```sh
npm run dev:backend
npm run dev:frontend
```

The frontend is at `http://localhost:4200`. Its `/api` requests proxy to the backend at `http://localhost:3000`. Health endpoints are `/health/live` and `/health/ready` on the backend. Readiness checks PostgreSQL; liveness only checks the web process.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run db:migrate:status
```

`npm run db:migrate` is an explicit admin command. Starting the backend never runs migrations. Application code and dependency lockfiles live separately in `frontend/` and `backend/`.

## Backend entities

The backend models Group, Participant, Poll, PollResponse, and AvailabilityInterval in `backend/src/domain/`. Constructors validate names, timezones, poll windows, and interval bounds. Participant creation returns the raw edit token once and stores only its SHA-256 hash in the entity. `backend/src/db/insert.ts` contains parameterized inserts; `backend/src/db/replace-response-intervals.ts` handles atomic whole-response replacement. Replacement validates against the stored poll and returns a confirmed response to draft.

After starting PostgreSQL and running migrations, verify the database rules with:

```sh
npm --prefix backend run test:db
```

The database checks relationship constraints and the single-open-poll rule. HTTP workflows for creating groups, joining, and editing responses are separate follow-up work.
