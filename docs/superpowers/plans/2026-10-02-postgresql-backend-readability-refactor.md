# PostgreSQL Backend Readability Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the explicit-PostgreSQL backend behavior while making its services, repositories, tests, and quality gates consistently readable and maintainable.

**Architecture:** Keep `pg` and the current domain/service/infrastructure layers. Split persistence by domain, keep SQL inside focused repositories, express service methods as short named workflows, and separate service behavior tests from database-contract assertions. Add root formatting and focused lint gates so the current one-line and deeply nested style cannot return.

**Tech Stack:** Node.js 22+, TypeScript, Fastify, `pg`, PostgreSQL 17, Node test runner, Prettier, ESLint, `typescript-eslint`.

**Spec:** `docs/superpowers/plans/2026-10-01-postgresql-repositories.md`, refined by the approved 2026-10-02 readability design.

## Global Constraints

- Preserve HTTP behavior, database schema, PostgreSQL error codes, service method parameters, and domain error messages.
- Keep parameterized SQL inside repositories, migrations, infrastructure tests, or centralized test probes; never place it in services or service test bodies.
- Keep concrete repositories and services; do not add base repositories, factories, a query builder, or interfaces with one implementation.
- Permit simple guard clauses, but reject compound opaque conditions, nested ternaries, and nesting deeper than two blocks.
- Use 100-character lines, functions no longer than 40 logical lines, and cyclomatic complexity no greater than six.
- Make no frontend behavior or product-scope changes.
- Treat the current uncommitted PostgreSQL implementation as the baseline: never discard it, and skip commit steps unless the user has authorized committing the combined baseline and refactor.

## Review Focus

- A response created while its poll closes must finish first and remain valid; Task 4 keeps a deterministic concurrency test.
- Replacing availability with semantically identical intervals must preserve IDs, timestamps, and confirmation; Task 5 adds this assertion.
- Successful service tests must roll back instead of committing fixtures; Task 6 tests the transaction harness itself.
- Missing/closed/cross-group persistence results must retain their current messages or PostgreSQL codes; Tasks 3-5 retain those assertions.
- Applying `001_initial` twice must remain safe and report the correct status; Task 7 verifies both runs.

---

### Task 1: Root Formatting and Readability Gates

**Files:**
- Create: `prettier.config.mjs`, `.prettierignore`, `eslint.config.mjs`, `package-lock.json`
- Modify: `package.json`, `frontend/package.json`, `.github/workflows/ci.yml`
- Delete: `frontend/.prettierrc`

**Interfaces:**
- Produces root scripts `format`, `format:check`, `lint`, and `check`.
- Produces one formatting/lint policy for backend and frontend source.

- [ ] **Step 1: Add root tooling dependencies and scripts**

Install root dev dependencies for `prettier`, `prettier-plugin-sql`, `eslint`, `typescript`, `typescript-eslint`, and `@stylistic/eslint-plugin`. Remove the duplicate frontend Prettier dependency. Configure quoted cross-platform globs for backend TypeScript/SQL/JSON, frontend TypeScript/HTML/CSS/JSON, root config files, and CI YAML.

- [ ] **Step 2: Configure formatting**

Set `printWidth: 100`, `singleQuote: true`, `endOfLine: 'lf'`, Angular parsing for HTML, and PostgreSQL formatting for `.sql`. Ignore dependencies, build output, `.worktrees`, Playwright output, and generated artifacts.

- [ ] **Step 3: Configure focused lint rules**

Lint `backend/{src,tests}/**/*.ts` and `frontend/src/**/*.ts`. Enforce `@stylistic/max-len` 100, `max-lines-per-function` 40 excluding blanks/comments, `max-depth` 2, modified `complexity` 6, `no-nested-ternary`, `@typescript-eslint/no-non-null-assertion`, `no-floating-promises`, and `no-misused-promises`.

- [ ] **Step 4: Prove the gates detect the current debt**

Run: `npm run format:check` and `npm run lint`

Expected: FAIL on the current compressed backend files and oversized functions.

- [ ] **Step 5: Apply only mechanical formatting**

Run: `npm run format`

Do not restructure code in this step. Keep the formatter-only diff isolated for review.

- [ ] **Step 6: Wire the gates into CI**

Install root dependencies in CI, cache the root lockfile, and run `format:check` and `lint` before typecheck/tests/build.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json prettier.config.mjs .prettierignore eslint.config.mjs frontend/package.json frontend/package-lock.json frontend/.prettierrc .github/workflows/ci.yml backend frontend
git commit -m "chore: enforce repository readability"
```

### Task 2: Typed Database Results and Focused Repositories

**Files:**
- Create: `backend/src/infrastructure/database/repositories/{group,participant,poll,response,interval}.repository.ts`
- Create: `backend/src/infrastructure/database/repositories/required-row.ts`
- Modify: `backend/src/infrastructure/database/database.ts`
- Delete: `backend/src/infrastructure/database/repositories/repositories.ts`, `backend/src/types/pg.d.ts`
- Test: existing database-backed service and schema tests

**Interfaces:**
- Produces `requiredRow<T extends QueryResultRow>(result: QueryResult<T>, message: string): T`.
- Produces concrete repositories with constructor `(database: Database)`.
- Keeps `Database.query` and `Database.transaction<T>` signatures stable.

- [ ] **Step 1: Remove the local `pg` declaration and run typecheck**

Run: `npm --prefix backend run typecheck`

Expected: PASS against the installed `@types/pg`; any newly exposed nullable result must be handled without assertions before continuing.

- [ ] **Step 2: Add the required-row helper**

Implement `requiredRow` using `result.rows[0]`; throw the supplied existing error message when absent. Do not branch on `rowCount` and do not use non-null assertions.

- [ ] **Step 3: Split repositories by domain**

Keep these methods and return types:

- `GroupRepository.insert(value: Group): Promise<Group>`
- `ParticipantRepository.insert(value: Participant): Promise<Participant>`
- `PollRepository.insert(value: Poll): Promise<Poll>`
- `PollRepository.close(id: string, now: Date): Promise<Poll>`
- Response and interval methods used by Tasks 4-5

Each repository defines typed PostgreSQL row shapes and its mapper beside the queries it owns. Export a mapper only when another focused repository must reuse it.

- [ ] **Step 4: Rewrite SQL as multiline parameterized templates**

Keep column lists explicit and preserve every current predicate, lock, constraint-dependent behavior, and ordering clause.

- [ ] **Step 5: Verify infrastructure behavior**

Run: `npm --prefix backend run typecheck`

Run with `DATABASE_URL`: `npm --prefix backend run test:integration`

Expected: PASS with the existing 17 integration scenarios.

- [ ] **Step 6: Commit**

```bash
git add -A -- backend/src/infrastructure/database backend/src/services backend/tests
git commit -m "refactor: split postgres repositories"
```

### Task 3: Concrete Services and Minimal Infrastructure Boundaries

**Files:**
- Modify: `backend/src/services/{group,participant,poll,response,interval}/*.service.ts`
- Modify: `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/infrastructure/database/migrate.ts`
- Delete: `backend/src/infrastructure/database/create-database.ts`, `backend/src/infrastructure/database/database-health.ts`, `backend/src/shared/utils/time.ts`
- Test: `backend/tests/app.test.ts`, `backend/tests/services/**/*.test.ts`, `backend/tests/shared/time.test.ts`

**Interfaces:**
- Produces concrete `GroupService`, `ParticipantService`, `PollService`, `ResponseService`, and `IntervalService` classes.
- Preserves all existing public service method parameters and return types.
- `app.ts` exports `DatabaseHealth { isAvailable(): Promise<boolean> }`; `buildApp` consumes it and production passes `Database` directly by structural typing.

- [ ] **Step 1: Update tests to import the concrete class names**

Run: `npm --prefix backend run typecheck`

Expected: FAIL until each `*ServiceImpl` export and import is renamed.

- [ ] **Step 2: Remove single-implementation service interfaces**

Rename `*ServiceImpl` to `*Service`, retain constructor injection of `Database`, and keep each method signature unchanged.

- [ ] **Step 3: Remove delegating wrappers**

Use `Database.create(config)` directly from server and migration entrypoints, pass `Database` directly to `buildApp`, and update the time test to import the canonical UTC module.

- [ ] **Step 4: Refactor the migration entrypoint for cleanup**

Move status/apply decisions into named functions and ensure `database.close()` runs in `finally`. Keep the CLI output strings and migration version unchanged.

- [ ] **Step 5: Verify the service boundary**

Run: `npm --prefix backend run typecheck`

Run: `npm --prefix backend run test:unit`

Expected: PASS with no `*ServiceImpl`, `createDatabase`, or `PostgresDatabaseHealth` references.

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/tests
git commit -m "refactor: simplify backend service boundaries"
```

### Task 4: Readable Response Workflow and Deterministic Lock Test

**Files:**
- Modify: `backend/src/infrastructure/database/repositories/response.repository.ts`
- Modify: `backend/src/services/response/response.service.ts`
- Create: `backend/tests/support/concurrency.ts`
- Modify: `backend/tests/services/response/response.service.test.ts`

**Interfaces:**
- Produces a typed `ResponseCreationContext` containing poll status and both group IDs.
- Produces repository operations for creation context, guarded insert, open-poll state change, and availability-change reset.
- Keeps `ResponseService.create`, `confirm`, and `markDraft` signatures stable.

- [ ] **Step 1: Strengthen response behavior tests**

Retain assertions for draft creation, idempotent confirmation, cross-group rejection, closed-poll rejection, and creation-before-close ordering. Replace the fixed 50 ms delay with a concurrency fixture that acquires a PostgreSQL advisory lock, waits until the response insert is blocked on that lock, starts the close, and then releases the insert.

- [ ] **Step 2: Run the focused response suite**

Run with `DATABASE_URL`: `node --conditions=development --import tsx --test tests/services/response/response.service.test.ts`

Expected: FAIL until the new fixture and repository methods exist.

- [ ] **Step 3: Implement named creation guards**

Have the service load a creation context, call a named guard that checks existence/open status/same group, then perform the guarded insert. Preserve `INSERT ... SELECT ... FOR SHARE OF p` inside the transaction and return the inserted row directly.

- [ ] **Step 4: Centralize response state writes**

Keep confirmation idempotence and closed-poll rejection in repository methods. Add the focused availability-change operation used by `IntervalService`; it sets `DRAFT`, clears `confirmed_at`, and updates `updated_at`.

- [ ] **Step 5: Verify locking and errors**

Run the focused response suite repeatedly at least three times.

Expected: PASS every run with `['create', 'close']`, no arbitrary sleep, and unchanged error messages/codes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/database/repositories/response.repository.ts backend/src/services/response backend/tests/services/response backend/tests/support/concurrency.ts
git commit -m "refactor: clarify response persistence workflow"
```

### Task 5: English-Like Interval Replacement

**Files:**
- Create: `backend/src/services/interval/interval.operations.ts`
- Modify: `backend/src/services/interval/interval.service.ts`
- Modify: `backend/src/infrastructure/database/repositories/interval.repository.ts`
- Modify: `backend/tests/services/interval/interval.service.test.ts`

**Interfaces:**
- Produces `toPollWindow(poll: Poll): PollWindow`.
- Produces `createIntervals(responseId: string, inputs: readonly IntervalInput[], window: PollWindow, now: Date): AvailabilityInterval[]`.
- Produces `sameIntervals(existing: readonly AvailabilityInterval[], replacement: readonly AvailabilityInterval[]): boolean`.
- Keeps `IntervalService.replace(responseId, inputs, now?)` unchanged.

- [ ] **Step 1: Add the missing idempotence assertion**

Extend the unchanged-replacement test to confirm that interval IDs, `createdAt`, response state, and `confirmedAt` remain unchanged after replacing a confirmed response with semantically identical intervals.

- [ ] **Step 2: Run the focused interval suite**

Run with `DATABASE_URL`: `node --conditions=development --import tsx --test tests/services/interval/interval.service.test.ts`

Expected: PASS as a characterization test before restructuring; it must continue passing throughout the refactor.

- [ ] **Step 3: Extract the pure interval operations**

Move poll-window projection, validated interval construction, and canonical semantic comparison into `interval.operations.ts`. Keep UUID creation there; do not introduce an ID-generator interface.

- [ ] **Step 4: Rewrite `replace` as one linear workflow**

The method must: begin transaction, lock response/poll, require an open poll, build and validate replacement, load existing intervals, return existing intervals immediately when unchanged, replace changed rows, record the availability change, and return the replacement.

- [ ] **Step 5: Verify rollback and state transitions**

Assert changed confirmed data becomes draft, invalid data leaves stored state untouched, closed polls reject changes, and unchanged data remains confirmed.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/interval backend/src/infrastructure/database/repositories/interval.repository.ts backend/tests/services/interval
git commit -m "refactor: linearize interval replacement"
```

### Task 6: Isolated, Behavior-Focused Service Tests

**Files:**
- Modify: `backend/tests/support/database.ts`
- Create: `backend/tests/support/database-probe.ts`
- Modify: `backend/tests/services/**/*.test.ts`, `backend/tests/infrastructure/database/schema.test.ts`
- Test: `backend/tests/infrastructure/database/test-transaction.test.ts`

**Interfaces:**
- Produces `services(database: Database)` using concrete service classes.
- Produces `inTransaction(run: (context: ServiceTestContext) => Promise<void>): Promise<void>` that always rolls back.
- Produces typed probes for response state, stored intervals, participant token hash, poll reference, and test-only deletion.

- [ ] **Step 1: Prove the existing helper commits successful tests**

Add a test that captures an inserted group ID inside `inTransaction` and asserts outside the callback that the row does not exist.

Run with `DATABASE_URL`: `node --conditions=development --import tsx --test tests/infrastructure/database/test-transaction.test.ts`

Expected: FAIL against the current helper because it commits.

- [ ] **Step 2: Force rollback after successful callbacks**

Use one private sentinel thrown after `run` completes; suppress only that exact sentinel. Let genuine test errors pass through after `Database.transaction` rolls back.

- [ ] **Step 3: Add typed test probes**

Centralize the small number of stored-state reads and test-only writes. Return camel-cased typed projections and use `requiredRow`; do not recreate production repositories or expose generic query access through the test context.

- [ ] **Step 4: Remove SQL from service test bodies**

Rewrite group, participant, poll, response, and interval tests to read as service workflows plus typed probe assertions. Rename stale `em` and `forkDatabase` terminology.

- [ ] **Step 5: Keep schema SQL focused**

Retain PostgreSQL catalog queries only in `schema.test.ts`, formatted as multiline SQL and wrapped by named helpers for expected indexes and constraints.

- [ ] **Step 6: Verify test isolation and readability**

Run with `DATABASE_URL`: `npm --prefix backend run test:integration`

Run: `rg -n "\.query(?:<[^>]+>)?\(" backend/tests/services`

Expected: integration PASS; ripgrep returns no direct service-test queries.

- [ ] **Step 7: Commit**

```bash
git add backend/tests
git commit -m "test: isolate postgres service scenarios"
```

### Task 7: Migration, Documentation, and Final Verification

**Files:**
- Modify: `backend/src/infrastructure/database/migrations/001_initial.sql`
- Modify: `README.md`
- Modify: `spec/AGENTS.md`, `spec/08_BACKEND_ARCHITECTURE.md`, `spec/BACKEND_PERSISTENCE_DESIGN.md`

**Interfaces:**
- Keeps migration version `001_initial` and all schema objects unchanged.
- Makes explicit `pg` repositories the documented backend source of truth.

- [ ] **Step 1: Format the baseline migration**

Expand tables, columns, constraints, and indexes into readable PostgreSQL DDL. Verify the formatter changes whitespace/case only.

- [ ] **Step 2: Reconcile backend documentation**

Remove MikroORM-specific entities, commands, snapshots, and EntityManager wording. Document concrete services, focused repositories, explicit transactions, parameterized SQL, and the current migration commands without changing product rules.

- [ ] **Step 3: Verify migration idempotence**

Against a disposable PostgreSQL database, run:

```bash
npm run db:migrate
npm run db:migrate
npm run db:migrate:status
```

Expected: first run applies or reports already applied, second reports already applied, and status reports `001_initial applied`.

- [ ] **Step 4: Run all quality gates**

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands PASS.

- [ ] **Step 5: Run structural regression searches**

```bash
rg -n "ServiceImpl|MikroORM|EntityManager|createDatabase|PostgresDatabaseHealth" backend README.md spec/AGENTS.md spec/08_BACKEND_ARCHITECTURE.md spec/BACKEND_PERSISTENCE_DESIGN.md
rg -n "repositories/repositories|src/types/pg" backend
```

Expected: no obsolete implementation references; historical context is permitted only when explicitly labelled as replaced.

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/database/migrations/001_initial.sql README.md spec package.json package-lock.json
git commit -m "docs: align backend guidance with postgres repositories"
```
