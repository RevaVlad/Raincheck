# Agent instructions — Sverimsya MVP

Read in this order before coding:

1. `00_SCOPE_AND_DECISIONS.md`
2. `01_PRODUCT_MODEL.md`
3. relevant domain/API/frontend/backend spec
4. `10_ACCEPTANCE_CRITERIA.md`

## Non-negotiable MVP rules

- Persistent Group, temporary Polls.
- One OPEN Poll per Group.
- Permanent invite link.
- No full auth, OAuth or RBAC.
- Participant writes require own participant token.
- Angular v22 + Angular Material + Tailwind.
- State in Angular services; no NgRx.
- Node.js + Fastify + PostgreSQL.
- Backend stateless.
- Neutral time is available only after response confirmation.
- Any edit after confirmation resets response to DRAFT.
- Previous poll is suggestion only; never silently copied.
- Results use confirmed responses only.
- Hard availability outranks soft preference.
- No external calendar, notifications, AI, Redis, queues, microservices.

## UI work

Before UI changes, inspect:

- `references/availability_scheduler_mockup.html`
- `references/availability_scheduler_sidebar_mockup.html`
- `ai_desiger_welcom_page_mockup.png` if present in repo.

If UI Skills are installed:

```bash
npx ui-skills start
npx ui-skills categories
npx ui-skills list --category '<relevant>'
npx ui-skills get '<smallest-relevant-skill>'
```

Prefer one skill. Do not load a large bundle blindly.

Do not change established UX behavior because a generic component library makes another layout easier.

## Visual design

UX is more frozen than visual styling.

Keep:

- calm;
- lightweight;
- collaborative;
- grid-first;
- muted semantic red/yellow/green;
- minimal sidebar.

Do not invent a large enterprise dashboard.

## Backend

- Validate every write.
- Use concrete services backed by the shared `PrismaDatabase`; do not pass database clients through service methods.
- Use Prisma ORM 7 Client directly for ordinary CRUD; keep lifecycle/mappers under `src/infrastructure/database/` and reviewed SQL migrations under `backend/prisma/migrations/`.
- Use tagged parameterized Prisma raw SQL only for readiness and three locking operations: response insertion, response state changes, and interval replacement context locks; schema SQL belongs in reviewed migrations.
- Keep multi-step writes in joined Prisma transactions and run migrations only through `prisma:deploy` admin commands; never use `prisma db push` or `prisma migrate dev`. The Prisma migration plan supersedes older persistence instructions.
- Keep each domain type and its named validation pipeline in separate files under `src/domain/<entity>/`.
- Config from env.
- Logs to stdout.
- No authoritative in-memory state.
- Migrations separate from web startup.
- Do not log participant tokens.

## Changes to specs

If implementation reveals an actual contradiction:

1. stop;
2. identify exact conflicting requirements;
3. prefer `00_SCOPE_AND_DECISIONS.md`;
4. propose the smallest spec change;
5. do not silently rewrite domain behavior.

## Finish gate

Before declaring a feature complete:

- run relevant unit/integration tests;
- run browser QA for UI;
- check `10_ACCEPTANCE_CRITERIA.md`;
- confirm no FUTURE features leaked into MVP.
