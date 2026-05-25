# Imperial Cloud — Build Conventions (for Claude Code)

Source of truth: `IMPERIAL_CLOUD_BUILD.md` (root). The SQL, API infra, and theme system in that file are tested. Copy patterns from it; do not reinvent.

## Non-negotiables

- **Authorization lives in the DB.** RLS gates; `requirePermission` is defense in depth.
- **Every API route follows one pipeline:** rate-limit → `getAuth` → Zod `parse` → `requirePermission` → action (RLS query or `SECURITY DEFINER` RPC) → `audit` → `ok` / `Errors`. Canonical example: `app/api/files/route.ts`.
- **Two Supabase clients.** `userClient()` (RLS-bound) for normal access; `serviceClient()` (RLS-bypass) ONLY for definer RPCs, audit writes, admin creation, anonymous link resolution. Never to browser.
- **Theme is two-layer.** `--ic-shell-*` (permanent dark: sidebar/topbar/brand) and `--ic-ws-*` (adaptive: workspace). The theme toggle CANNOT recolor the shell. Never hard-code a color.
- **Strict TypeScript.** `pnpm typecheck` is the commit gate. Derive API types from Zod via `z.infer`.
- **Immutability.** `file_versions` and `audit_logs` are append-only; enforced by triggers.

## Naming

Files kebab-case · Components PascalCase · Hooks `useX` · DB snake_case · Permissions `area.verb`. Every business table has `org_id` and RLS in the same migration.

## Implementation order (build bottom-up)

1. Schema + RLS — done (`supabase/migrations/01–07`).
2. API infra — done (`lib/api.ts`, `lib/validation.ts`).
3. Auth flow + middleware + app shell — **next**.
4. Theme system — done (`providers/`, `hooks/`, `components/theme/`).
5. File explorer (read) → upload + versioning (copy `app/api/files/route.ts`).
6. Sharing (copy `app/api/sharing/route.ts`) → realtime.
7. Search → analytics → notifications → audit surfacing.
8. Tests, perf, a11y, deploy.

Commit and typecheck between modules. One concern per prompt.

## Adding a new API route

1. Define Zod schema in `lib/validation.ts`.
2. Copy the handler shape from `app/api/files/route.ts`.
3. Gate with the correct permission (`area.verb`).
4. Write an audit entry. Typecheck before commit.
