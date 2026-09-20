# Private Cloud

Private Cloud is a personal file vault with Supabase authentication, an extra passcode lock, private folders, and user-isolated storage.

This app no longer depends on Replit. Use GitHub + your own domain. Follow `SETUP.md`.

## Run

```powershell
copy .env.example .env
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/private-cloud run dev
```

Open http://localhost:5173

## Live

```powershell
pnpm run build:live
node artifacts/api-server/dist/index.mjs
```

Or connect the GitHub repo to Render using `render.yaml`.
