# Raincheck

Raincheck helps a recurring group agree on meeting times. The repository contains an Angular frontend, Fastify API, and a PostgreSQL backend using Prisma ORM 7 with `@prisma/adapter-pg`.

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
npm run prisma:generate
npm run prisma:validate
```

Use a fresh disposable database for the Prisma baseline; the existing Compose volume and old database are preserved. For example, create an unused database once:

```sh
docker compose exec postgres createdb -U raincheck raincheck_prisma_local
```

Set `DATABASE_URL` in `backend/.env` to `postgres://raincheck:raincheck@localhost:5432/raincheck_prisma_local`. Each concurrent developer or test worker must use a separate database. Apply the reviewed migrations and inspect status:

```sh
npm run prisma:deploy
npm run prisma:deploy
npm run prisma:status
```

The second deploy applies nothing when the migration history is current. Generation and validation need no live database; deploy and status require `DATABASE_URL`. Backend installation also generates the ignored client at `backend/src/generated/prisma/`.

Never run `prisma db push` or `prisma migrate dev` against this schema. Prisma cannot represent all reviewed PostgreSQL constraints: in particular, its schema model does not express `ON DELETE SET NULL (based_on_poll_id)` on the composite previous-poll foreign key. The expected SetNull validation warning is not a reason to weaken that constraint.

For a schema change, update `backend/prisma/schema.prisma` where representable and create a new `backend/prisma/migrations/<timestamp>_<name>/migration.sql` with explicit SQL. Review its checks, indexes, foreign keys and data effects, validate/generate, and deploy/test on a fresh disposable database before committing it. Do not edit an applied migration, reset a populated database, or delete the Compose volume. Deploy uses Prisma migration history; it neither imports legacy migration history nor upgrades an existing `pg`/MikroORM database automatically. Existing data migration or baselining requires a separately reviewed procedure.

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
npm run prisma:status
```

`npm run prisma:deploy` is an explicit admin command. Starting the backend never runs migrations. Application code and dependency lockfiles live separately in `frontend/` and `backend/`.

## Backend structure

Domain types and named validation steps live under `backend/src/domain/<entity>/`. Concrete services use Prisma Client directly for ordinary CRUD; `backend/src/infrastructure/database/prisma-database.ts` owns lifecycle and transaction scope, and record mappers preserve domain values. Reviewed SQL migrations live under `backend/prisma/migrations/`. Shared UTC helpers live under `backend/src/shared/time/`.

Concrete services receive the shared `PrismaDatabase` once; callers do not pass database clients through domain methods. Nested service transactions join the current transaction. Whole-response interval replacement runs in one transaction; an identical replacement preserves IDs, timestamps and confirmation, while a changed replacement resets the response to draft. Group timezone, poll dates, daily windows, and availability intervals all use UTC. Tests live under `backend/tests/` and mirror the source responsibility.

Runtime raw SQL is limited to tagged, parameterized Prisma queries for readiness (`SELECT 1`) and three lock-sensitive operations: response insertion with a poll share lock, atomic response state changes locking the response/poll, and locking response/poll context for interval replacement. `pg` remains for the Prisma adapter and the separate-session concurrency test fixture. No repository wrappers or second persistence framework are used.

`npm test` runs backend unit and database-backed tests, then frontend tests. After starting PostgreSQL and running migrations, run the backend database suites with:

```sh
npm --prefix backend run test:db
```

The database checks relationship constraints and the single-open-poll rule. The HTTP API is documented in [api/openapi.yaml](api/openapi.yaml): participant edit tokens are returned only by successful group creation and join, while all later participant-bound calls use `X-Participant-Token`.

Suggestions are derived only from the caller's confirmed response in the previous poll. They are mapped by ISO weekday, clipped and rounded to the new UTC grid, then reduced by explicit current intervals; they are never stored. Results contain every smallest grid cell and count only confirmed responses. Unmarked confirmed cells are neutral, `IF_NEEDED` stays available but is counted separately, and `UNAVAILABLE` wins. Candidate windows advance by `slotMinutes`; the API returns the first three after ranking availability, if-needed count, soft score, and earliest time.

The current persistence decision is [the Prisma migration plan](docs/superpowers/plans/2026-10-02-prisma-parallel-migration.md). The earlier MikroORM plan (`spec/BACKEND_PERSISTENCE_PLAN.md`) and explicit-`pg` plans ([repositories](docs/superpowers/plans/2026-10-01-postgresql-repositories.md), [readability refactor](docs/superpowers/plans/2026-10-02-postgresql-backend-readability-refactor.md)) are superseded historical records; their implementation instructions and reset procedures no longer apply.
