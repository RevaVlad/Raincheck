# Raincheck

Raincheck helps a recurring group agree on meeting times. This repository currently contains the project foundation: Angular frontend, Fastify API, and a MikroORM-backed PostgreSQL schema.

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

Create or roll back a schema migration with:

```sh
npm run db:migration:create -- --name describe-change
npm run db:migrate:down
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

## Backend structure

Domain types and named validation steps live under `backend/src/domain/<entity>/`. Each capability has a service interface and MikroORM implementation under `backend/src/services/<entity>/`. Database entities, repositories, configuration, and generated migrations stay under `backend/src/infrastructure/database/`. Shared UTC helpers live under `backend/src/shared/time/`.

Services receive an ORM entity manager once and expose domain methods without database-client parameters. Whole-response interval replacement runs in one transaction. Group timezone, poll dates, daily windows, and availability intervals all use UTC. Tests live under `backend/tests/` and mirror the source responsibility.

`npm test` runs backend unit and database-backed service tests, then frontend tests. After starting PostgreSQL and running migrations, run only the backend service suites with:

```sh
npm --prefix backend run test:db
```

The database checks relationship constraints and the single-open-poll rule. HTTP workflows for creating groups, joining, and editing responses are separate follow-up work.
