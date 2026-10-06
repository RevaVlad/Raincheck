# Participant Profile Screen Design

## Goal

After creating a group or opening an invite without a valid participant session, a person sets their display name and avatar color before entering the poll. A participant can later edit the same profile from their own card in the group sidebar.

Group creation remains available before anyone joins: it creates the persistent group and its first poll, while the profile screen creates the first participant.

## User flows

### Create a group

1. The create form collects the group name and first poll schedule; it does not collect a participant name.
2. `POST /api/groups` creates the group and first poll in one transaction, with no participant.
3. The response contains only `group` and `currentPoll`.
4. The browser opens `/g/:inviteCode/profile`.
5. Saving the profile creates the participant, stores the returned participant ID and edit token in local storage, and opens `/g/:inviteCode`.

### Open an invite

The group entry flow continues to load the workspace with an optional participant token. A valid token returns `me` and opens the workspace. With no valid token, the entry flow shows the profile screen with the same group sidebar. A successful first profile save stores the token and opens the workspace. Refreshing the page reads the token and restores the correct state.

### Edit a profile

The current participant card links to `/g/:inviteCode/profile`. The profile screen pre-fills the current name and color from the workspace. Saving sends an authenticated profile update with the existing token; it does not issue or replace a token. Other participant cards stay non-interactive and visually subdued.

If a stored token is missing or invalid, the person is treated as a new participant. There is no account recovery in this MVP; a name already used by the previous participant receives the normal name-conflict error, and the person can choose another available name.

## Profile and avatar color

The shared profile screen supports both first-time creation and editing. The name and avatar color form one submission. The first palette color is selected for a new participant by default. All API and persisted color values are from this fixed palette:

| Value | Swatch |
| --- | --- |
| `green` | `#cff4e2` |
| `blue` | `#dcecff` |
| `purple` | `#f1e2ff` |
| `rose` | `#ffe1e5` |
| `yellow` | `#fff0bd` |
| `gray` | `#e8e9eb` |

These six swatches follow the join/profile reference image. New profiles default to `green`; the database migration assigns `gray` to existing participants. Color remains a semantic palette value in the API and storage, while the frontend maps it to the displayed swatch and legible initials.

## API contract

- `POST /api/groups` no longer accepts `creatorDisplayName`. It creates only the group and first poll and returns no participant or participant token.
- `POST /api/groups/:inviteCode/participants` accepts required `displayName` and `avatarColor` fields and returns the participant, including `avatarColor`, plus the one-time raw edit token.
- `PATCH /api/groups/:inviteCode/participants/me` accepts the same profile fields and returns the updated participant, including `avatarColor`, without returning a token.
- The participant response schema and each participant in the workspace response include `avatarColor`.
- The API accepts exactly `green`, `blue`, `purple`, `rose`, `yellow`, or `gray`. Invalid values return `INVALID_REQUEST`; a duplicate normalized name returns `PARTICIPANT_NAME_TAKEN` as before.
- The workspace endpoint remains readable without a token and returns `me: null` for absent or invalid optional identity. A group with no participants returns an empty `participants` array.
- The root `api/openapi.yaml` is updated as the frontend's documented contract. Frontend API types remain hand-maintained in `api.types.ts`; this change does not set up OpenAPI type generation.

## Persistence

Persist the selected palette value on each participant. Add a reviewed Prisma SQL migration that gives existing rows `gray`, constrains stored values to the six palette keys, and keeps the Prisma schema aligned. Participant creation and profile update validate the color at the API/domain boundary as well as relying on the database constraint.

Group creation remains transactional for the group and first poll. Participant creation happens only when the profile form is saved. The existing uniqueness rule for normalized participant names remains group-scoped.

## Frontend composition and behavior

- Remove the participant name field and participant-token handling from the create-group page. Its success route is `/g/:inviteCode/profile`.
- Reuse one profile component for first entry and editing. It reads the workspace to determine whether a valid current participant exists, then calls create or update accordingly.
- Keep the existing `GroupSidebarComponent` shared between profile and workspace views. It continues to show group name, invite link, participants, and poll list, including the empty-participant state.
- Extract participant iteration into a participant-list component and keep the existing participant-card component. The current participant card is an accessible link to the profile; other cards remain subdued and do not navigate.
- Keep the existing application fonts, button styles, theme, and Angular Material/Tailwind conventions. The six color choices must be keyboard-operable and expose the selected state to assistive technology. On narrow viewports, the sidebar and form stack without horizontal overflow.
- API, storage, and name-conflict failures remain visible on the profile form. A failed profile save does not navigate away.

## Compatibility and scope

The current MVP notes describe the previous flow where group creation includes the creator. This approved feature replaces that flow. Update the relevant scope, UX, session/routing, and acceptance notes alongside the implementation so they describe the no-participant group state and shared profile screen. No poll scheduling, response, confirmation, token scope, or group invite semantics change.

Full authentication, account recovery, editing other participants, and automatic participant creation are out of scope.

## Verification

Update backend API/service and Angular tests for the new request/response shapes and routes. Verify these paths, including refresh:

- create group -> profile -> save -> workspace/poll;
- invite without a valid token -> profile -> save -> workspace/poll;
- own participant card -> profile edit -> save -> workspace/poll.

Cover all six persisted colors, default green, migration/default gray for existing participants, duplicate names, invalid colors, lost identity behavior, and a group with no participants. Check visible form errors, keyboard navigation for the palette and participant link, and mobile sidebar/profile layout. Run the browser smoke paths and relevant project checks before completion.
