# Backend architecture — Node.js + Fastify + PostgreSQL

## Principles

Backend должен оставаться небольшим stateless web service.

Не использовать:

- NestJS;
- base repositories, repository interfaces, query builders или дополнительные persistence abstractions без конкретной необходимости;
- Redis;
- queues;
- background worker;
- in-memory authoritative state.

Fastify достаточно.

## Implemented structure

```text
backend/src/
├── app.ts
├── server.ts
├── config/
│   └── config.ts
├── domain/
│   └── <entity>/
│       ├── <entity>.ts
│       └── <entity>.validation.ts
├── services/
│   └── <entity>/
│       └── <entity>.service.ts
├── infrastructure/
│   └── database/
│       ├── prisma-database.ts
│       └── prisma-records.ts
└── shared/
    ├── constants.ts
    └── time/
        └── utc.ts
```

Routes -> concrete services -> Prisma Client -> PostgreSQL.

## Database access

**OWNER DECISION 2026-10-02:** use Prisma ORM 7 with `@prisma/adapter-pg`. The binding [Prisma migration plan](../docs/superpowers/plans/2026-10-02-prisma-parallel-migration.md) supersedes earlier MikroORM and explicit-`pg` instructions.

Concrete services receive one shared `PrismaDatabase` and use Prisma Client directly for ordinary CRUD. Public methods keep domain inputs and values; do not add repository wrappers or database-client parameters.

`PrismaDatabase.create(config)` owns lifecycle; `transaction(work)` joins an existing transaction, `isAvailable()` checks readiness, and `close()` disconnects the root client. The server closes it on graceful shutdown and failed startup. Record mappers preserve UTC values; application IDs, tokens and timestamps remain authoritative.

Runtime raw SQL is limited to tagged, parameterized Prisma queries for readiness (`SELECT 1`) and three operations:

1. Response insertion with `INSERT ... SELECT ... FOR SHARE` against the open poll.
2. Atomic response state changes locking the response/poll and preserving idempotent timestamps.
3. Response/poll context locks with `FOR UPDATE` before interval replacement.

Changed interval replacements reset confirmation in the same transaction; identical replacements preserve IDs, timestamps and confirmation. Nested service transactions join their caller. Prisma requires finite transaction timeout/maxWait values: 2,147,483,647 ms (about 24.8 days) approximates the old unbounded waits. `pg` remains for the adapter and separate-session concurrency test fixture.

Named checks, uniqueness, partial indexes, cascades and the composite `polls_based_on_same_group_fk` with `ON DELETE SET NULL (based_on_poll_id)` remain explicit in reviewed SQL and covered by database tests. State/kind/direction remain PostgreSQL `text` with `CHECK` constraints. Prisma's expected SetNull warning must not weaken this contract.

## Validation

Validation хранится рядом с domain type, но в отдельном `<entity>.validation.ts` file.

Один public validator вызывает короткие named steps в понятном порядке:

```ts
export function validatePoll(sequenceNo: number, input: PollInput): ValidPollInput {
  validateSequenceNumber(sequenceNo);
  validateDateRange(input.startsOn, input.endsOn);
  const windowMinutes = validateDailyWindow(input.dayStart, input.dayEnd);
  validateSlotMinutes(input.slotMinutes);
  validateMeetingDuration(input, windowMinutes);
  return normalizePollInput(input);
}
```

Не собирать независимые validation rules в одно большое условие.

## Fastify schemas

Каждый route должен иметь request validation.

Использовать Fastify JSON Schema или небольшой schema library, если он уже принят в проекте.

Backend никогда не доверяет frontend interval normalization.

## Config

Environment variables:

```text
NODE_ENV
HOST
PORT
DATABASE_URL
LOG_LEVEL
FRONTEND_ORIGIN     # только если нужен CORS
```

Config читается на startup.

Если обязательный env отсутствует, процесс должен быстро завершиться с понятной ошибкой.

Не хранить environment-specific config в source files.

## Tokens

### invite code

```js
randomBytes(32).toString("base64url")
```

Хранится в group, потому что должен быть redisplayable.

### participant edit token

Сгенерировать аналогично.

Клиенту вернуть raw token один раз.

В БД:

```text
sha256(rawToken)
```

При request:

- прочитать header;
- hash;
- query participant by hash.

Never log the header.

## Logging

Fastify/Pino JSON logs в stdout/stderr.

Минимальные fields:

- timestamp;
- level;
- message;
- requestId;
- route pattern;
- statusCode;
- durationMs.

Не логировать:

- participant token;
- full request body response intervals на каждом autosave;
- secret headers.

## Graceful shutdown

Handle:

- `SIGTERM`;
- `SIGINT`.

Sequence:

1. stop accepting requests / `fastify.close()`;
2. wait active requests;
3. disconnect the shared `PrismaDatabase`;
4. exit.

Не хранить state, который нужно flush на local disk.

## Health endpoints

Рекомендуется добавить сразу — это дёшево и пригодится в Kubernetes.

### `/health/live`

Проверяет, что process/event loop работает.

Не требует PostgreSQL.

### `/health/ready`

Проверяет способность обслуживать запросы.

MVP:

```sql
SELECT 1
```

через tagged Prisma query.

Если DB unavailable -> non-2xx.

## Migrations

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

## Domain services

### Interval service

Pure/domain functions:

- validate alignment;
- detect overlaps;
- normalize;
- ensure poll bounds.

### Suggestion service

Input:

- current poll;
- base poll;
- source confirmed response;
- current intervals.

Output:

- non-conflicting ghost suggestions.

### Results service

Детерминированно строит:

- heatmap;
- best slots.

No persistence for derived data.

## HTTP behavior

- REST over HTTP/1.1 is sufficient;
- no gRPC;
- JSON;
- request IDs;
- route schemas;
- stable error shape.

## Security baseline

Even though this is a trusted-team MVP:

- parameterized SQL only;
- validate input lengths/ranges;
- crypto-random codes;
- no tokens in logs;
- CORS allowlist, not `*`, if custom participant header is cross-origin;
- default security headers where practical;
- do not expose stack traces in production.

## Future observability hooks

Do not add Prometheus/Loki dependencies until course task requires them.

But architecture must make it easy to add:

- request metrics;
- domain counters;
- structured logs;
- probes.

Keep routes/services explicit so instrumentation can wrap predictable boundaries.
