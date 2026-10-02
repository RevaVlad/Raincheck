# Replace MikroORM with PostgreSQL Repositories

## Summary

Remove MikroORM completely and use `pg`, explicit SQL, concrete domain-specific repositories, and a small transaction wrapper. Preserve all current domain behavior, database constraints, concurrency guarantees, and the unfinished response-creation locking work.

The layers remain:

- `domain/`: types and validation, with no database dependencies.
- `services/`: application workflows and business decisions.
- `infrastructure/database/`: PostgreSQL connection, transactions, migrations, repositories, SQL, and row mapping.

## Implementation Changes

- Replace MikroORM dependencies with `pg` and `@types/pg`; delete ORM configuration, entities, generated migrations, snapshots, and all `Mikro*` implementations.
- Add a `Database` wrapper exposing `query`, `isAvailable`, `close`, and `transaction<T>(work: (transaction: Database) => Promise<T>)`. Transaction-scoped instances join an existing transaction so service tests can wrap complete workflows and roll them back.
- Add concrete, stateless repositories:
  - `GroupRepository`: insert groups.
  - `ParticipantRepository`: insert participants.
  - `PollRepository`: insert polls and atomically close an open poll.
  - `ResponseRepository`: create responses for open same-group polls, confirm them, and return them to draft.
  - `IntervalRepository`: lock/load response context, read intervals, replace intervals, and map rows to domain values.
- Keep SQL inside repositories. Services generate IDs/tokens, invoke domain validation, coordinate repositories, and translate missing or invalid persistence results into the existing human-readable errors.
- Preserve response creation's `INSERT ... SELECT ... FOR SHARE` behavior so a concurrent poll close waits for creation to finish. Preserve transactional interval replacement, unchanged-interval idempotence, and confirmed-to-draft transitions.
- Replace service interfaces and `Mikro*Service` classes with concrete `GroupService`, `ParticipantService`, `PollService`, `ResponseService`, and `IntervalService` classes. Do not introduce generic repositories, repository interfaces, factories, or a formal Unit of Work interface.
- Restore one final-state `001_initial.sql` migration and the small explicit SQL migration runner. Retain `db:migrate` and `db:migrate:status`; remove unsupported MikroORM `db:migration:create` and `db:migrate:down` scripts.
- Update server lifecycle, readiness checks, README architecture/setup instructions, imports, and package lockfile for the new database boundary.

## Interfaces and Compatibility

- HTTP behavior remains unchanged: `/health/live` and `/health/ready` keep their current responses.
- Existing service method behavior and parameters remain stable, but consumers instantiate concrete service classes instead of `Mikro*` implementations.
- PostgreSQL constraint error codes such as `23503` and `23505` remain observable where current tests depend on them; no speculative error hierarchy is added.
- MikroORM migration history is not supported. The documented development reset recreates the PostgreSQL volume before applying the new baseline.
- Preserve the uncommitted response concurrency test semantically. Discard the uncommitted ORM snapshot configuration test because its subject is removed.

## Test Plan

- Adapt database test support to construct services over the new `Database` and roll each test back through its transaction wrapper.
- Rewrite persistence assertions to use domain results, repositories, or direct SQL instead of ORM entities.
- Retain coverage for validation, unique/FK/check constraints, one open poll per group, same-group previous polls, cascade/set-null behavior, token hashing, confirmation idempotence, interval rollback, and closed-poll rejection.
- Keep the concurrent response-create/poll-close test and verify creation completes first.
- Verify a clean database migration, a second idempotent migration run, and migration status.
- Run backend typecheck, unit tests, integration tests, and build; then run the repository-level root checks.

## Assumptions

- The local Compose PostgreSQL data is disposable and may be removed when verifying the new baseline.
- No compatibility layer is required for databases previously migrated by MikroORM.
- No new HTTP workflows or frontend changes are included.
- PostgreSQL 17 and the repository's current Node.js requirements remain unchanged.
