# Participant Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person create or edit one group participant profile with a persistent avatar color before entering the poll.

**Architecture:** Group creation stores only the group and first poll. A shared profile component creates a participant when the workspace has no authenticated `me`, or updates the existing participant through its stored token. The existing group sidebar is reused, with participant iteration extracted into a list component and the existing participant card kept as the visual/accessibility unit.

**Tech Stack:** Angular 22, Angular Material, Tailwind, Fastify, Prisma 7, PostgreSQL, TypeScript.

**Spec:** [docs/superpowers/specs/2026-10-06-participant-profile-design.md](../specs/2026-10-06-participant-profile-design.md)

## Global Constraints

- Group creation returns the group and first poll without a participant or participant token.
- API and persisted avatar colors are exactly `green`, `blue`, `purple`, `rose`, `yellow`, and `gray`; new profiles default to `green`, and the migration backfills existing participants to `gray`.
- Participant profile writes require the participant token; raw tokens are returned only when a participant is created and remain in local storage keyed by invite code.
- No full authentication or account recovery; a lost/invalid token starts the new-participant flow.
- Keep the current fonts, buttons, theme, Angular Material/Tailwind conventions, and responsive sidebar behavior. Add no dependency or OpenAPI type generator.
- Use Prisma Client for ordinary CRUD. Add a reviewed SQL migration and run it through `prisma:deploy`; never use `prisma db push` or `prisma migrate dev`.
- Preserve existing group-name uniqueness, poll, response, and invite-link behavior.

## Review Focus

- A token from another group must not update a participant; authenticated update returns the existing unauthorized error and optional workspace identity stays `null`. Test this in Task 1's group API tests.
- Saving the current participant's name with only case or whitespace differences must not be reported as a duplicate. Test this in Task 1's group API tests.
- If local storage refuses a newly issued token, the profile form must keep the failure visible and must not navigate to the workspace. Test this in Task 3's group-entry component spec.
- Opening an invite with an absent, malformed, or stale token must show the create-profile state and clear stale storage without crashing. Test this in Task 3's facade and route specs.
- At a 320 px viewport, the profile and sidebar must remain usable without horizontal page overflow; the palette's selected state and the self-card link must remain keyboard accessible. Verify in Task 4's browser QA.

---

### Task 1: Persist avatar colors and extend participant API

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261006000000_participant_avatar_color/migration.sql`
- Modify: `backend/src/domain/participant/participant.ts`
- Modify: `backend/src/domain/participant/participant.validation.ts`
- Modify: `backend/src/services/participant/participant.service.ts`
- Modify: `backend/src/infrastructure/database/prisma-records.ts`
- Modify: `backend/src/api/group-routes.ts`
- Modify: `api/openapi.yaml`
- Test: `backend/tests/domain/participant/participant.validation.test.ts`
- Test: `backend/tests/services/participant/participant.service.test.ts`
- Test: `backend/tests/services/interval/interval.service.test.ts`
- Test: `backend/tests/services/response/response.service.test.ts`
- Test: `backend/tests/infrastructure/database/prisma-records.test.ts`
- Test: `backend/tests/api/groups.test.ts`
- Test: `backend/tests/api/foundation.test.ts`
- Test: `backend/tests/infrastructure/database/migration.test.ts`
- Test: `backend/tests/infrastructure/database/schema.test.ts`

**Interfaces:**
- Consumes: the existing `ParticipantService.create(groupId, displayName, now?)` and `ParticipantService.rename(id, displayName, now?)` calls.
- Produces: `AvatarColor = 'green' | 'blue' | 'purple' | 'rose' | 'yellow' | 'gray'`; `validateAvatarColor(value: string): AvatarColor`; `Participant.avatarColor`; `ParticipantService.create(groupId, displayName, avatarColor, now?)`; and `ParticipantService.updateProfile(id, displayName, avatarColor, now?)`.
- The participant request is `{ displayName: string; avatarColor: AvatarColor }`. Participant and workspace-participant responses include `avatarColor`.

- [ ] **Step 1: Add failing palette and persistence tests**

Add this focused domain test:

```ts
void test('accepts the six avatar colors and rejects all other values', () => {
  for (const color of ['green', 'blue', 'purple', 'rose', 'yellow', 'gray']) {
    assert.equal(validateAvatarColor(color), color);
  }
  assert.throws(() => validateAvatarColor('teal'), /color/i);
});
```

Update service tests so `ParticipantService.create(groupId, 'Alice', 'green', now)` returns `green` and `updateProfile(id, 'Alice Smith', 'purple')` returns both the new normalized name and `purple`. Add API tests that join and update with each color and return it from `participant`, `workspace.me`, and `workspace.participants`; unsupported or omitted color returns `400 INVALID_REQUEST`; duplicate names still return `409 PARTICIPANT_NAME_TAKEN`; the same normalized name is allowed on update; and a token scoped to another group cannot update the profile. Add migration assertions for the gray backfill and color constraint; add the new column and check name to the schema assertions.

- [ ] **Step 2: Run backend tests to verify the new assertions fail**

Run: `npm --prefix backend run test:unit && npm --prefix backend run test:integration && npm --prefix backend run test:api`
Expected: FAIL in the new domain/service/API assertions because `AvatarColor`, validation, and profile color persistence are not implemented; existing cases continue to run.

- [ ] **Step 3: Implement the palette persistence and participant contract**

Add `avatarColor` as `VARCHAR(6)` with a named check constraint allowing exactly the six lowercase values. In the migration, add the nullable column, update existing rows to `gray`, then enforce `NOT NULL` and the check constraint; do not add a database default. Add `avatarColor` to the Prisma model and domain `Participant`, validate colors before writes, update create and profile-update service logic to accept the color, and include it in participant DTOs. Update the matching participant schemas in `api/openapi.yaml` (`Participant`, `ParticipantInput`, `WorkspaceParticipant`, `JoinResponse`, and `ParticipantResponse`).

- [ ] **Step 4: Generate Prisma client and apply the migration**

Run: `npm --prefix backend run prisma:validate && npm --prefix backend run prisma:generate && npm --prefix backend run prisma:deploy`
Expected: Prisma schema is valid, the client generates, and the new migration is applied successfully through the supported deploy command.

- [ ] **Step 5: Run the backend tests and typecheck**

Run: `npm --prefix backend run test:unit && npm --prefix backend run test:integration && npm --prefix backend run test:api && npm --prefix backend run typecheck`
Expected: all backend suites and TypeScript checks pass, including the new schema and migration assertions.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src backend/tests api/openapi.yaml
git commit -m "feat(api): persist participant avatar colors"
```

### Task 2: Create groups without an initial participant

**Files:**
- Modify: `backend/src/api/group-routes.ts`
- Modify: `api/openapi.yaml`
- Modify: `backend/tests/api/groups.test.ts`

**Interfaces:**
- Consumes: Task 1's participant profile contract for later `POST /participants` writes.
- Produces: `POST /api/groups` requires `name` and `firstPoll`, optionally accepts `timezone: 'UTC'`, and returns exactly `group` and `currentPoll`.

- [ ] **Step 1: Add a failing create-without-participant API test**

Add `test('creates a group and first poll without creating a participant')`. Update the helper to submit no creator name, then assert creation returns `201`, response keys are exactly `group` and `currentPoll`, the group has zero participants, and workspace returns `me: null` with `participants: []`. Assert an extra `creatorDisplayName` is rejected and an invalid first poll still rolls back the group.

- [ ] **Step 2: Run the group API test to verify it fails**

Run: `npm --prefix backend run test:api`
Expected: FAIL because the create route still requires and creates the creator participant.

- [ ] **Step 3: Remove participant creation from the group transaction**

Remove `creatorDisplayName` from the Fastify body schema and route type. Keep group and first-poll creation in the transaction; return only their DTOs. Update group-test setup helpers and call sites that previously relied on an implicit creator to create a participant explicitly, while preserving the empty-group creation assertion. Update `CreateGroupRequest` and `CreateGroupResponse` in `api/openapi.yaml` to remove the creator name, participant, and edit token.

- [ ] **Step 4: Run backend API tests and typecheck**

Run: `npm --prefix backend run test:api && npm --prefix backend run typecheck`
Expected: all API tests pass and the backend typechecks with group creation allowing zero participants.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/group-routes.ts backend/tests/api/groups.test.ts api/openapi.yaml
git commit -m "feat(api): defer participant creation until profile"
```

### Task 3: Add the shared profile flow and update frontend API types

**Files:**
- Modify: `frontend/src/app/core/api/api.types.ts`
- Modify: `frontend/src/app/features/group/participants-api.service.ts`
- Modify: `frontend/src/app/features/group/group.facade.ts`
- Modify: `frontend/src/app/features/group/group.routes.ts`
- Modify: `frontend/src/app/features/group-entry/group-entry-page.component.ts`
- Modify: `frontend/src/app/features/group-entry/group-entry-page.component.html`
- Modify: `frontend/src/app/features/create-group/create-group-page.component.ts`
- Modify: `frontend/src/app/features/create-group/create-group-page.component.html`
- Modify: `frontend/src/app/features/create-group/create-group-page.component.spec.ts`
- Modify: `frontend/src/app/features/group-entry/group-entry-page.component.spec.ts`
- Modify: `frontend/src/app/core/session/participant-session.service.ts`
- Modify: `frontend/src/app/core/session/participant-session.service.spec.ts`
- Test: `frontend/src/app/features/group/group.facade.spec.ts`
- Test: `frontend/src/app/features/group/group.routes.spec.ts`

**Interfaces:**
- Consumes: Task 1's six-value participant profile API and Task 2's `CreateGroupResponse { group, currentPoll }`.
- Produces: frontend `AvatarColor`, color-bearing `Participant`/`WorkspaceParticipant`, `ParticipantInput`, `CreateGroupResponse { group, currentPoll }`, `ParticipantsApiService.updateProfile(inviteCode, token, body)`, and `GroupFacade.saveProfile(body): Promise<boolean>`.
- `GroupFacade.saveProfile` creates and stores identity when `workspace.me` is `null`; otherwise it patches through the existing token. It reloads the workspace only after the write and token persistence succeed.

- [ ] **Step 1: Add failing API-client, create-page, facade, and profile tests**

In the existing create-page spec, assert the form has no participant-name control and sends no `creatorDisplayName`, then navigates to `/g/:inviteCode/profile`. In the facade spec, assert `saveProfile` posts and stores the returned identity for a new participant, patches with the stored token for an existing participant without replacing it, keeps the name-conflict message, and treats invalid optional identity as a new-profile flow. In the group-entry spec, assert the profile form selects `green` initially, pre-fills `me` on the explicit profile route, submits the selected color, and stays on the form when creation, update, or local storage fails. In the session service spec, assert malformed/stale-token cleanup is safe when storage access throws.

- [ ] **Step 2: Run the focused frontend tests to verify they fail**

Run: `npm --prefix frontend run test`
Expected: FAIL because the create form and shared profile flow still use the old creator/join contract.

- [ ] **Step 3: Update hand-maintained types and profile API/facade logic**

Add `AvatarColor` and required `avatarColor` fields to the frontend API types; remove creator and participant-token fields from group creation types. Add a token-authenticated profile update method. Implement `GroupFacade.saveProfile(body): Promise<boolean>` with inline API error mapping and session storage only on first creation.

- [ ] **Step 4: Add the first-entry and edit routes using one profile component**

Remove the name field and session storage from `CreateGroupPageComponent`; navigate to `/g/:inviteCode/profile` after group creation. Convert the existing `GroupEntryPageComponent` form into the single shared profile form and register that component for the explicit `profile` route with route data forcing profile mode. The root entry route shows that same form when `me` is absent and the workspace when `me` is valid. A valid `me` on the explicit profile route pre-fills edit mode. On successful save, navigate to `/g/:inviteCode`; on failure, keep the form and error visible.

- [ ] **Step 5: Run frontend tests and typecheck**

Run: `npm --prefix frontend run test && npm --prefix frontend run typecheck`
Expected: all frontend tests pass and the hand-maintained types match the API contract.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app
git commit -m "feat(frontend): add participant profile flow"
```

### Task 4: Share participant-list navigation and verify the responsive screen

**Files:**
- Modify: `frontend/src/app/features/workspace/group-sidebar/group-sidebar.component.ts`
- Modify: `frontend/src/app/features/workspace/group-sidebar/group-sidebar.component.html`
- Modify: `frontend/src/app/features/workspace/group-sidebar/participant/participant.component.ts`
- Modify: `frontend/src/app/features/workspace/group-sidebar/participant/participant.component.html`
- Modify: `frontend/src/app/features/workspace/workspace-page.component.html`
- Modify: `frontend/src/app/features/workspace/workspace-page.component.spec.ts`
- Modify: `frontend/src/app/features/group-entry/group-entry-page.component.html`
- Modify: `frontend/src/app/features/group-entry/group-entry-page.component.spec.ts`
- Create: `frontend/src/app/features/workspace/group-sidebar/participant-list/participant-list.component.ts`
- Create: `frontend/src/app/features/workspace/group-sidebar/participant-list/participant-list.component.html`

**Interfaces:**
- Consumes: Task 3's `AvatarColor`, profile route, `workspace.me`, and `WorkspaceParticipant` fields.
- Produces: `ParticipantListComponent` inputs `participants: WorkspaceParticipant[]`, `inviteCode: string`, `currentParticipantId: string | null`, and `showStatuses: boolean`; the existing participant card renders color and optional status and links only the current participant to `/g/:inviteCode/profile`.

- [ ] **Step 1: Add failing participant-list and palette accessibility tests**

In `GroupEntryPageComponent`, assert the six color choices render in the approved order, exactly one is selected by default, ArrowRight moves the selection, and each option exposes its label and selected state. In `WorkspacePageComponent`, assert the current participant has `href="/g/invite-code/profile"` and `aria-current="page"`; other participants render without a link and with subdued styling. Assert each card uses its `avatarColor`, and the sidebar keeps its existing zero-participant empty state.

- [ ] **Step 2: Run the focused component tests to verify they fail**

Run: `npm --prefix frontend run test`
Expected: FAIL because the palette and participant list/card behavior are not implemented.

- [ ] **Step 3: Extract the participant list and preserve the card component**

Move participant iteration and the empty state into `ParticipantListComponent`. Keep `ParticipantComponent` responsible for one participant card; give it the current-participant ID and invite code so only the current participant renders an accessible link. Preserve the existing optional status visibility behavior so the sidebar stays composable with other workspace views.

- [ ] **Step 4: Reuse the sidebar on the profile screen and style the six avatar colors**

Before template changes, inspect the project mockups and run the UI Skills workflow from `ui-skills-root` if installed. Pass the current participant ID from workspace and group-entry/profile pages. Render the palette as an accessible exclusive Angular Material control, using the approved swatches and existing theme. Keep the shared sidebar at desktop widths and stack it above the profile form on narrow screens.

- [ ] **Step 5: Run component tests, frontend suite, typecheck, and browser QA**

Run: `npm --prefix frontend run test && npm --prefix frontend run typecheck`
Expected: all Angular tests pass. Then use the Playwright workflow to verify create -> profile -> workspace, invite -> profile -> workspace, self card -> edit -> workspace, and refresh for each path; check the selected color, duplicate-name error, keyboard traversal, no console errors, and 320 px/mobile layout.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app
git commit -m "feat(frontend): add profile navigation to participant list"
```

### Task 5: Align product notes and run the full project checks

**Files:**
- Modify: local, gitignored `spec/docs/00_MVP_SCOPE.md`
- Modify: local, gitignored `spec/docs/02_UX_AND_SCREENS.md`
- Modify: local, gitignored `spec/docs/04_SESSION_ROUTING_AND_API.md`
- Modify: local, gitignored `spec/docs/06_ACCEPTANCE_CRITERIA.md`

**Interfaces:**
- Consumes: Tasks 1-4's implemented API, routes, palette, and sidebar behavior.
- Produces: current MVP notes that describe group creation without a participant, the shared profile flow, and avatar-color contract.

- [ ] **Step 1: Update the stale create/join and acceptance notes**

Replace the creator-name-at-group-creation and join-only descriptions with the approved group -> profile -> workspace flow. Document both profile modes, the exact six color values, gray migration, token-loss behavior, and current-card profile link. Keep unrelated poll/editor requirements unchanged.

- [ ] **Step 2: Check documentation diff and run the repository check**

Run: `git diff --check`
Expected: no whitespace errors.

Run: `npm run check`
Expected: formatting, lint, backend/frontend typechecks, unit/API/integration tests, and both builds pass. The local `spec/` notes stay gitignored, consistent with the repository configuration.
