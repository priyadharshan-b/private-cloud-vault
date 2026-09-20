# Private Cloud

Private Cloud is a personal file vault with Supabase authentication, an additional passcode lock, private folders, and user-isolated storage.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/private-cloud run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` for the workspace database tooling and `SESSION_SECRET` for signed server sessions.
- Supabase access is provided through the connected Replit Supabase integration; do not put service-role credentials in browser code.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/private-cloud/` — React + Vite web app with the private access flow and storage workspace.
- `artifacts/api-server/src/routes/cloud.ts` — Supabase-backed auth, vault, files, folders, upload, download, and storage routes.
- `artifacts/api-server/src/lib/session.ts` and `passcode.ts` — signed HTTP-only sessions and server-side passcode hashing.
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod schemas.
- `supabase/schema.sql` — Supabase tables, RLS policies, user profile trigger, and private storage policies.

## Architecture decisions

- The authenticated Supabase session is held in a signed, HTTP-only cookie; the private vault passcode is a separate application-layer lock.
- File bytes stay in Supabase Storage under a `{user_id}/...` path; PostgreSQL stores only metadata.
- The API re-checks Supabase identity and vault unlock state for every private operation instead of relying on frontend filtering.
- API contracts are defined in OpenAPI and consumed through generated React Query hooks.

## Product

Users can sign in with email/password or Google OAuth, create or unlock a six-digit private vault passcode, upload files, create folders, search and sort their own files, rename/move/delete/download items, lock the vault, and inspect storage usage.

## User preferences

The user explicitly requested Supabase Auth, Supabase PostgreSQL, Supabase Storage, row-level security, and separate user data isolation.

## Gotchas

- Run the SQL in `supabase/schema.sql` in the connected Supabase project and create the private `user-files` bucket before testing file operations.
- Google OAuth still needs to be enabled in Supabase Auth and its callback URL configured for the deployed domain.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before using updated hooks or Zod schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
