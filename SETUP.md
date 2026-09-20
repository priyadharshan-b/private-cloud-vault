# Private Cloud — setup you must do by hand

This app is a private Google Drive-style vault. The code is in this repo. You still have to connect **GitHub**, **Supabase**, and (later) **your domain**. Follow the clicks below exactly.

## A. GitHub (load every file)

GitHub CLI is installed. In PowerShell, from this folder:

```powershell
cd "C:\Users\PRIYADHARSHAN B\Downloads\Private-Cloud-Vault\Private-Cloud-Vault"
gh auth login
```

Choose:

1. GitHub.com
2. HTTPS
3. Login with a web browser
4. Paste the one-time code into the browser and authorize

Then tell the assistant to create the repo and push, or run:

```powershell
git add -A
git commit -m "Make Private Cloud work outside Replit"
gh repo create private-cloud-vault --private --source=. --remote=origin --push
```

Do **not** commit a real `.env` file. Only `.env.example` is safe.

## B. Supabase project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** (or open your existing project)
3. Wait until the project is healthy
4. Go to **Project Settings → API**
5. Copy these into a local `.env` file (copy from `.env.example`):
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (server only, never put this in frontend code)

## C. SQL, RLS, and storage (required)

1. In Supabase, open **SQL Editor**
2. Click **New query**
3. Paste the full contents of `supabase/schema.sql`
4. Click **Run**
5. Confirm there is no red error

This creates `profiles`, `folders`, `files`, RLS, the new-user trigger, the private `user-files` bucket, and storage policies.

If the bucket already exists, the insert still sets it to **private**.

Optional check:

1. **Storage → Buckets**
2. `user-files` must exist
3. **Public bucket** must be **off**

## D. Auth URL configuration (required)

In Supabase go to **Authentication → URL Configuration**.

### While testing on your PC

**Site URL**

```text
http://localhost:5173
```

**Redirect URLs** — add each line:

```text
http://localhost:5173/api/auth/google/callback
http://localhost:5000/api/auth/google/callback
```

### After the app is live on your domain

Change **Site URL** to:

```text
https://YOUR-DOMAIN
```

Add redirect URLs:

```text
https://YOUR-DOMAIN/api/auth/google/callback
https://YOUR-DOMAIN/**
```

Replace `YOUR-DOMAIN` with the real host, for example `cloud.yourname.com` (no trailing slash in Site URL).

## E. Enable Google sign-in

### In Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create or select a project
3. **APIs & Services → OAuth consent screen** → External → app name `Private Cloud`
4. Add your email as a test user
5. **Credentials → Create credentials → OAuth client ID → Web application**
6. Authorized JavaScript origins:
   - `https://YOUR-PROJECT-REF.supabase.co`
   - `http://localhost:5173`
   - `https://YOUR-DOMAIN` (after go-live)
7. Authorized redirect URIs — **this exact URL**:
   - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
8. Copy **Client ID** and **Client secret**

`YOUR-PROJECT-REF` is the subdomain in your Supabase URL: `https://abcdxyz.supabase.co` → `abcdxyz`.

### In Supabase

1. **Authentication → Providers → Google**
2. Enable Google
3. Paste Client ID and Client secret
4. Save

Also enable:

- **Authentication → Providers → Email** → enabled
- Confirm email: you can turn this **off** while testing, then turn it **on** for production

## F. Run locally

From the project root:

```powershell
copy .env.example .env
```

Edit `.env` with the real keys. Then:

```powershell
corepack enable
pnpm install
pnpm --filter @workspace/api-server run dev
```

In a second terminal:

```powershell
pnpm --filter @workspace/private-cloud run dev
```

Open `http://localhost:5173`.

The web app proxies `/api` to port **5000**. Keep both processes running.

## G. Live deploy (GitHub → Render, then your domain)

Replit is no longer required. Use any Node host. Render matches `render.yaml`.

1. Push the GitHub repo
2. In Render: **New → Blueprint** (or Web Service) → connect the repo
3. Build: `corepack enable && pnpm install && pnpm run build:live`
4. Start: `node artifacts/api-server/dist/index.mjs`
5. Set environment variables (same names as `.env.example`)
6. Set `PUBLIC_APP_URL` to the live URL, for example `https://your-app.onrender.com`
7. After Render gives a URL, add that URL in Supabase **Site URL** and **Redirect URLs** as in section D

## H. Custom domain DNS

After the live URL works, attach your domain at the host (Render / Cloudflare / etc.). Then create DNS records at **whatever registrar you already use**. Typical values:

| Type | Name | Value | Purpose |
| --- | --- | --- | --- |
| A | `@` or `cloud` | the IPv4 your host shows | apex or subdomain |
| CNAME | `www` or `cloud` | the host name your host shows, e.g. `your-app.onrender.com` | subdomain |
| AAAA | `@` | IPv6 if the host gives one | optional |

Do not guess the IP. Copy the exact record from the host’s **Custom domain** screen.

Then in Supabase URL Configuration, use `https://YOUR-DOMAIN` as in section D.

Also add `https://YOUR-DOMAIN` to the Google OAuth **Authorized JavaScript origins**.

## I. Test two users (isolation)

1. Browser A: Google or email user A → create passcode `824619` → upload a file
2. Browser B (private window): user B → create a different passcode → upload a different file
3. User A must not see user B’s files
4. Lock, then unlock with the passcode
5. Logout returns to the login page

Never use `000000` as a passcode.
