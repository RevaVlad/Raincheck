# Parallel Prisma Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: Use `superpowers:using-git-worktrees`, `superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `superpowers:requesting-code-review`, and `superpowers:finishing-a-development-branch`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stabilized `pg` persistence layer with Prisma ORM 7 while preserving domain/HTTP behavior and PostgreSQL concurrency guarantees.

**Architecture:** Use Prisma Client for ordinary CRUD and tagged raw SQL for readiness plus three row-lock-sensitive operations. Implement in isolated worktrees with disjoint file ownership, merge reviewed commits into one coordinator branch, and never run concurrent agents against the same database.

**Tech Stack:** Node.js 22+, TypeScript, Fastify, PostgreSQL 17, Prisma ORM 7.10.x, `@prisma/adapter-pg`, Node test runner.

**Spec:** This plan is self-contained; its architecture and Global Constraints are binding.

## Global Constraints

- Preserve public service signatures, domain types, database constraints, and HTTP behavior.
- Preserve response create/confirm ordering against concurrent poll close.
- Use Prisma Client for ordinary CRUD; raw runtime SQL is limited to readiness and three lock-sensitive operations.
- Do not add repository wrappers, dual-write, feature flags, optimistic-locking fields, or retry frameworks.
- Keep status, kind, and direction as PostgreSQL `text` with the existing `CHECK` constraints.
- Never use `prisma db push`; use reviewed migrations and `prisma migrate deploy`.
- Do not commit the generated Prisma Client.
- Concurrent implementers use separate worktrees, branches, and PostgreSQL databases.
- Agents may edit only their assigned paths and may not spawn subagents.
- The coordinator alone reviews, cherry-picks, resolves integration, and maintains the SDD ledger.

## Review Focus

- Prisma migration must reproduce every named constraint, partial index, and column-subset `SET NULL`; Task 2 adds migration and catalog assertions.
- Domain date/time strings must survive round trips under a non-UTC process timezone; Tasks 2 and 5 add mapping and interval tests.
- Joined transactions must not open independent nested Prisma transactions; Task 2 tests outer rollback across an inner service transaction.
- Response and interval row locks must preserve deterministic concurrency behavior; Tasks 4 and 5 retain the blocking scenarios.
- Final runtime must contain no old `pg` repositories or custom migration runner; Tasks 6 and 8 verify structural removal.

---

## Execution Topology

| Wave | Tasks | Concurrency |
| --- | --- | --- |
| 0 | Task 1: baseline checkpoint | Sequential |
| 1 | Task 2: Prisma foundation | Sequential |
| 2 | Tasks 3, 4, 5: CRUD, responses, intervals | Three agents in parallel |
| 3 | Tasks 6 and 7: cutover, documentation | Two agents in parallel |
| 4 | Task 8: verification and specialist reviews | Three read-only reviewers in parallel; one fixer if required |

Each implementation task receives an isolated worktree under `.worktrees/`. Wave 2 branches start from the reviewed Task 2 commit. Wave 3 branches start after Tasks 3-5 have been reviewed and cherry-picked.

Each database-writing agent receives a dedicated database:

- `raincheck_prisma_foundation`
- `raincheck_prisma_crud`
- `raincheck_prisma_response`
- `raincheck_prisma_interval`
- `raincheck_prisma_cutover`
- `raincheck_prisma_final`

Do not delete the existing Compose volume. Create these databases in the existing PostgreSQL instance and apply the Prisma migration independently.

## Task 1: Stabilize and Checkpoint the Current Baseline

**Owner:** Coordinator  
**Model:** `gpt-6.1-sol`, high  
**Parallel:** No

**Files:**

- Preserve: the complete current worktree
- Verify: backend, frontend, root tooling, and CI configuration

**Interfaces:**

- Produces: one reviewed baseline commit containing the current `pg` refactor.
- Produces: coordinator branch `feat/prisma-migration` used by every later worktree.

- [ ] **Step 1: Inspect and preserve the dirty worktree**

  Review `git status`, the untracked files, and the diff. Do not discard or overwrite current user changes.

- [ ] **Step 2: Verify the baseline**

  Start PostgreSQL, apply the current migration, and run:

  ```text
  npm run format:check
  npm run lint
  npm run typecheck
  npm test
  npm run build
  ```

  Expected: all commands pass before Prisma work begins.

- [ ] **Step 3: Commit the stabilized baseline**

  Include the current refactor and its tests, excluding worktrees and generated/output files.

- [ ] **Step 4: Prepare isolated execution**

  Create `feat/prisma-migration` from the baseline commit. Verify `.worktrees/` with `git check-ignore` before creating agent worktrees.

## Task 2: Prisma Foundation

**Owner:** Foundation implementer  
**Model:** `gpt-6.1-sol`, high  
**Branch:** `agent/prisma-foundation`

**Files:**

- Create: `backend/prisma.config.ts`, `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261002000000_initial/migration.sql`
- Create: Prisma database lifecycle, record mapper, and Prisma test-support modules under the existing database/test-support directories
- Modify: backend dependency manifests, root database scripts, ignore configuration, migration/schema tests

**Interfaces:**

- Produces: `PrismaDatabase.create(config): PrismaDatabase`.
- Produces: `PrismaDatabase.transaction<T>(work: (database: PrismaDatabase) => Promise<T>): Promise<T>`; a transaction-scoped instance joins the current transaction.
- Produces: `PrismaDatabase.isAvailable(): Promise<boolean>` and `close(): Promise<void>`.
- Produces: domain mappers for all five persisted record types.
- Produces: `inPrismaTransaction` and `PrismaProbe` for Wave 2 tests.

- [ ] **Step 1: Add failing foundation tests**

  Add tests proving date/time round trips under a non-UTC `TZ`, transaction rollback after a successful callback, and joining an existing transaction when a service opens an inner transaction.

- [ ] **Step 2: Install and configure Prisma 7**

  Pin compatible Prisma 7.10.x packages and `@prisma/adapter-pg`. Keep `pg` because the adapter and concurrency fixture require it. Configure generated output under `backend/src/generated/prisma` and ignore it in Git, ESLint, and Prettier.

- [ ] **Step 3: Define the mapped schema**

  Map camelCase model fields to the current snake_case tables and columns, retain exact PostgreSQL native types, keep constrained state fields as strings, and enable `partialIndexes`.

- [ ] **Step 4: Create the initial Prisma migration**

  Base the migration on the current DDL. Preserve every named `CHECK`, unique/index definition, cascade action, and `polls_based_on_same_group_fk` with `ON DELETE SET NULL (based_on_poll_id)`. Do not create the old `schema_migrations` table.

- [ ] **Step 5: Implement lifecycle and mapping**

  Implement `PrismaDatabase`, the domain record mappers, and the Prisma test helpers. Application-generated UUIDs, tokens, and timestamps remain authoritative; do not add Prisma defaults or `@updatedAt`.

- [ ] **Step 6: Add scripts**

  Add `prisma:generate`, `prisma:validate`, Prisma deploy, and Prisma status commands. Generation must not require a live database; migration commands must require `DATABASE_URL`.

- [ ] **Step 7: Verify the foundation**

  Create `raincheck_prisma_foundation`, run deploy twice, check migration status, then run the schema tests, mapper tests, typecheck, and build.

- [ ] **Step 8: Commit and report**

  Commit only Task 2-owned paths and write the SDD task report with the commands and results.

**Gate:** A task reviewer approves specification compliance and quality before the coordinator cherry-picks this commit.

## Wave 2: Parallel Service Migration

The coordinator creates all three worktrees from the reviewed Task 2 commit and dispatches all three agents together with `fork_turns: "none"`. Agents must not edit dependency manifests, Prisma schema/migrations, shared Prisma helpers, or another task's service/tests.

### Task 3: Simple CRUD Services

**Model:** `gpt-6.1-sol`, medium  
**Branch:** `agent/prisma-crud`

**Files:**

- Modify: group, participant, and poll services
- Modify: their three service test files

**Interfaces:**

- Consumes: `PrismaDatabase`, record mappers, `inPrismaTransaction`, and `PrismaProbe` from Task 2.
- Preserves: all public service method parameters and domain return types.

- [ ] **Step 1: Update focused tests for Prisma errors**

  Preserve behavior assertions and replace persistence-specific `23503`/`23505` expectations with Prisma `P2003`/`P2002` expectations.

- [ ] **Step 2: Convert group and participant creation**

  Use Prisma Client directly after existing validation. Preserve cryptographic token handling and application-controlled IDs/timestamps.

- [ ] **Step 3: Convert poll creation and close**

  Use Prisma Client for creation and a conditional update by `id` plus `status: OPEN` for close. Translate no-match behavior to the current domain error semantics.

- [ ] **Step 4: Verify and commit**

  Run the three focused suites and backend typecheck against `raincheck_prisma_crud`, then commit only owned paths and report.

### Task 4: Response Concurrency

**Model:** `gpt-6.1-sol`, high  
**Branch:** `agent/prisma-response`

**Files:**

- Modify: response service and response service tests
- Create: focused response raw-query module
- Modify: response concurrency fixture

**Interfaces:**

- Consumes: `PrismaDatabase` and response mapper from Task 2.
- Produces: tagged raw operations for response insert and state changes.
- Preserves: `ResponseService.create`, `confirm`, and `markDraft` signatures.

- [ ] **Step 1: Retain the concurrency characterization tests**

  Keep cross-group/open-poll validation, confirmation idempotence, and deterministic create/confirm-before-close scenarios.

- [ ] **Step 2: Implement response creation**

  In one joined transaction, read the minimal poll/participant context, perform the current domain checks, then execute the parameterized `INSERT ... SELECT ... FOR SHARE` operation.

- [ ] **Step 3: Implement state changes**

  Execute the existing atomic CTE that locks the response and poll, rejects a closed poll, and preserves idempotent timestamps.

- [ ] **Step 4: Verify and commit**

  Run the response suite three times and backend typecheck against `raincheck_prisma_response`, then commit only owned paths and report.

### Task 5: Interval Replacement

**Model:** `gpt-6.1-sol`, high  
**Branch:** `agent/prisma-interval`

**Files:**

- Modify: interval service and interval service tests
- Create: focused interval raw-query module

**Interfaces:**

- Consumes: `PrismaDatabase`, interval/response/poll mappers, and date/time conversions from Task 2.
- Produces: tagged raw response/poll context lock operation.
- Preserves: `IntervalService.replace` signature and idempotence.

- [ ] **Step 1: Strengthen the replacement tests**

  Assert unchanged replacements preserve interval IDs, timestamps, response state, and confirmation; changed replacements reset confirmation; invalid/closed replacements roll back.

- [ ] **Step 2: Implement the lock and read flow**

  Lock the response and poll through `FOR UPDATE`, validate the open poll, and read existing intervals through Prisma with deterministic ordering.

- [ ] **Step 3: Implement conditional replacement**

  Return existing intervals immediately when semantically equal. Otherwise use `deleteMany`, `createMany`, and a response update to `DRAFT` inside the same transaction.

- [ ] **Step 4: Verify and commit**

  Run the focused interval suite and backend typecheck against `raincheck_prisma_interval`, then commit only owned paths and report.

### Wave 2 Integration

- [ ] Generate one review package per branch.
- [ ] Dispatch three reviewers in parallel; response and interval reviewers use high effort.
- [ ] Resume the original implementer for fix rounds 1-3; use a fresh stronger implementer for rounds 4-5.
- [ ] If a finding requires a shared foundation change, fix Task 2 first, rebase affected branches, and rerun their focused suites.
- [ ] Cherry-pick only reviewed commits into the coordinator branch, in Task 3, Task 4, Task 5 order.

## Wave 3: Cutover and Documentation

### Task 6: Runtime Cutover and Cleanup

**Model:** `gpt-6.1-sol`, high  
**Branch:** `agent/prisma-cutover`

**Files:**

- Modify: app/server database lifecycle, shared database test harness, database/schema tests, package scripts, and CI
- Delete: old `Database`, repositories, `required-row`, custom migrator, and old migration directory

**Interfaces:**

- Consumes: all reviewed Wave 2 services and Task 2 Prisma infrastructure.
- Produces: the final Prisma-only runtime and test harness.

- [ ] **Step 1: Switch application lifecycle**

  Create one shared `PrismaDatabase`, use it for readiness, and disconnect it during graceful shutdown and failed startup.

- [ ] **Step 2: Consolidate tests**

  Move every service suite to the common Prisma rollback harness and convert common probes to Prisma. Keep direct `pg.Client` only for the separate-session concurrency fixture.

- [ ] **Step 3: Remove obsolete persistence**

  Delete the old pool wrapper, repositories, custom migration runner, and old migration files. Make Prisma deploy/status the canonical root commands.

- [ ] **Step 4: Verify and commit**

  Create `raincheck_prisma_cutover`, deploy migrations, run the complete backend suite and build, then commit only owned paths and report.

### Task 7: Documentation Reconciliation

**Model:** `gpt-6.1-sol`, medium  
**Branch:** `agent/prisma-docs`

**Files:**

- Modify: `README.md` and normative backend persistence specifications only

**Interfaces:**

- Documents: the final interfaces and commands produced by Tasks 2-6.

- [ ] **Step 1: Update the owner decision**

  Make Prisma ORM 7 the current persistence decision and document the three allowed lock-sensitive raw operations.

- [ ] **Step 2: Document migrations and setup**

  Document generation, validation, reviewed migration creation, deploy/status, disposable database setup, and the prohibition on `db push`.

- [ ] **Step 3: Reconcile history**

  Mark MikroORM and explicit-`pg` implementation plans as superseded without rewriting their historical content.

- [ ] **Step 4: Verify and commit**

  Check every documented command against package scripts, then commit only documentation paths and report.

### Wave 3 Integration

- [ ] Review Tasks 6 and 7 independently.
- [ ] Cherry-pick the reviewed cutover commit, followed by the documentation commit.
- [ ] Do not resolve a conflict silently; record any integration decision as an SDD ruling.

## Task 8: Final Verification and Reviews

**Owner:** Coordinator

- [ ] **Step 1: Verify migrations on a fresh database**

  Create `raincheck_prisma_final`, run deploy twice, and confirm status reports no pending migration.

- [ ] **Step 2: Run the full gate**

  ```text
  npm --prefix backend run prisma:validate
  npm --prefix backend run prisma:generate
  npm run format:check
  npm run lint
  npm run typecheck
  npm test
  npm run build
  ```

  Expected: every command passes.

- [ ] **Step 3: Run structural searches**

  Confirm there are no runtime references to old repositories, the custom migrator, `schema_migrations`, MikroORM, or direct `pg` queries outside the adapter/concurrency fixture. Confirm raw Prisma SQL is limited to readiness and the three approved locking operations.

- [ ] **Step 4: Dispatch specialist reviews in parallel**

  Dispatch a schema/migration parity reviewer (`gpt-6.1-sol`, high), transaction/concurrency reviewer (`gpt-6.1-sol`, high), and whole-branch reviewer (`gpt-6-astra`, high). Reviewers are read-only and receive review packages rather than reconstructing diffs.

- [ ] **Step 5: Handle final findings**

  Send the combined findings to one fix agent, run exactly one scoped re-review of the fix wave, and rerun the full gate.

- [ ] **Step 6: Finish the branch**

  Record every ledger ruling in the final handoff and use `superpowers:finishing-a-development-branch`. Do not merge or push without explicit approval.

## Acceptance Criteria

- All existing domain and concurrency behavior passes against Prisma-created databases.
- Prisma migration reconstructs the current schema from an empty PostgreSQL database.
- A second deploy is idempotent and migration status is clean.
- No old runtime persistence layer remains.
- No implementation agent edited another agent's assigned paths.
- Every implementation commit has an independent task review.
- The final whole-branch review has no unresolved Critical or Important finding.

## Assumptions

- Four concurrency slots are available: coordinator plus three agents.
- Docker/PostgreSQL is started before database-backed tasks.
- The current `pg` worktree is stabilized and committed before agent worktrees are created.
- Existing PostgreSQL data does not require migration, but the current volume is left intact for recoverability.
- Superpowers provides execution and review discipline; Ponytail keeps temporary compatibility code and file ownership to the minimum required for safe parallel work.
