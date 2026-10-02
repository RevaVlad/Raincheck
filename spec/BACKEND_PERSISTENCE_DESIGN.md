# Backend Persistence Design

## Current decision and architecture

**OWNER DECISION 2026-10-02:** use Prisma ORM 7 with `@prisma/adapter-pg`. The binding [Prisma migration plan](../docs/superpowers/plans/2026-10-02-prisma-parallel-migration.md) supersedes earlier MikroORM and explicit-`pg` instructions.

Concrete services receive one shared `PrismaDatabase` and use Prisma Client directly for ordinary CRUD. Public methods keep domain inputs and values; do not add repository wrappers or database-client parameters.

`PrismaDatabase.create(config)` owns lifecycle; `transaction(work)` joins an existing transaction, `isAvailable()` checks readiness, and `close()` disconnects the root client. The server closes it on graceful shutdown and failed startup. Record mappers preserve UTC values; application IDs, tokens and timestamps remain authoritative.

Runtime raw SQL is limited to tagged, parameterized Prisma queries for readiness (`SELECT 1`) and three operations:

1. Response insertion with `INSERT ... SELECT ... FOR SHARE` against the open poll.
2. Atomic response state changes locking the response/poll and preserving idempotent timestamps.
3. Response/poll context locks with `FOR UPDATE` before interval replacement.

Changed interval replacements reset confirmation in the same transaction; identical replacements preserve IDs, timestamps and confirmation. Nested service transactions join their caller. Prisma requires finite transaction timeout/maxWait values: 2,147,483,647 ms (about 24.8 days) approximates the old unbounded waits. `pg` remains for the adapter and separate-session concurrency test fixture.

Named checks, uniqueness, partial indexes, cascades and the composite `polls_based_on_same_group_fk` with `ON DELETE SET NULL (based_on_poll_id)` remain explicit in reviewed SQL and covered by database tests. State/kind/direction remain PostgreSQL `text` with `CHECK` constraints. Prisma's expected SetNull warning must not weaken this contract.

Domain types and named validation pipelines live under `backend/src/domain/<entity>/`; concrete Group, Participant, Poll, Response and Interval services live under `backend/src/services/<entity>/`. PostgreSQL remains the only persistent state store and Fastify remains stateless. No domain, service, HTTP or frontend behavior changes are introduced.

## Migrations and setup

Migrations are one-off admin tasks, separate from web startup. Root commands:

```sh
npm run prisma:generate
npm run prisma:validate
npm run prisma:deploy
npm run prisma:status
```

Generation and validation require no live database; deploy/status require `DATABASE_URL`. Backend installation generates the ignored client at `backend/src/generated/prisma/`; never commit it.

Create new reviewed explicit SQL at `backend/prisma/migrations/<timestamp>_<name>/migration.sql`, update representable Prisma schema fields, validate/generate, review constraints and data effects, then deploy and test on a fresh disposable database. Never edit applied migrations. Never use `prisma db push` or `prisma migrate dev`: Prisma cannot represent all PostgreSQL-specific constraints, including the composite foreign key's column-subset SetNull action.

[README setup](../README.md) creates an unused disposable database in the existing Compose instance, preserving the volume and old database. Concurrent workers use distinct databases. A second deploy applies nothing when Prisma migration history is current. Deploy does not convert legacy databases/history; existing-data migration or baselining requires a separately reviewed procedure.

## Tests and operational constraints

Tests remain under `backend/tests/`, using real PostgreSQL rollback transactions and typed Prisma probes. Validation precedes persistence; database constraints remain the final protection against races. Participant edit tokens remain hashed and are never logged or stored in plaintext.

## Superseded history

The MikroORM plan (`BACKEND_PERSISTENCE_PLAN.md`) and explicit-`pg` [repository plan](../docs/superpowers/plans/2026-10-01-postgresql-repositories.md) and [readability plan](../docs/superpowers/plans/2026-10-02-postgresql-backend-readability-refactor.md) are superseded historical records. Their original contents remain history, including obsolete commands and reset guidance. The historical MikroORM status in `IMPLEMENTATION_PLAN.md` and stack summary in `spec/README.md` are superseded by this persistence decision.
