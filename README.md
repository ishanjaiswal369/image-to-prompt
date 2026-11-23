# Image to Prompt

Right-click any image (or select a screen region) in Chrome → get a structured
text-to-image prompt (subject, composition, style, lighting, mood), plus raw JSON.
Accounts and credits are gated via Google sign-in and an event-sourced credit ledger. Payment processing is out of scope for
this phase — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design,
including why certain spec details were adapted (permissions, auth flow, ledger
concurrency).

**Live:** [landing page](https://image-to-prompt.copperlabs.co.in) ·
[download the extension](https://github.com/ishanjaiswal369/image-to-prompt/releases/latest/download/image-to-prompt.zip) ·
API on Render ([`/healthz`](https://image-to-prompt-api.onrender.com/healthz))

**Deploying:** see [`docs/DEPLOY.md`](docs/DEPLOY.md) (Neon + Render + GitHub Release / Chrome Web Store) ·
**Privacy:** [`PRIVACY.md`](PRIVACY.md)

## Prerequisites

- Node.js 20+ (developed against Node 24)
- Docker Desktop (Postgres 16 runs via `docker-compose`)
- A Google Cloud OAuth 2.0 client ID (Chrome Extension type)
- A Gemini API key ([ai.google.dev](https://ai.google.dev))

## Repo layout

```
/backend     Fastify + Prisma + Postgres API
/extension   Chrome MV3 extension (in-page floating card, React)
/docs        Architecture notes
```

## Backend setup

```bash
cd backend
cp .env.example .env
# edit .env: GOOGLE_CLIENT_ID, GEMINI_API_KEY, ADMIN_TOKEN, JWT secrets, EXTENSION_ORIGIN
```

### Run Postgres + the backend via Docker Compose

```bash
cd backend
docker compose up -d postgres
npm install --workspace backend --include-workspace-root
npm run prisma:migrate -w backend
npm run dev -w backend
```

`docker compose up` (without `-d postgres`) also builds and runs the backend itself
in a container, using the `Dockerfile` — useful for a closer-to-production smoke test.

### Run the backend natively against Dockerized Postgres

```bash
cd backend
docker compose up -d postgres
npm run prisma:migrate -w backend
npm run dev -w backend       # http://localhost:8080
```

### Tests

The credit ledger transaction logic (debit, refund-on-failure, idempotent replay,
concurrent-debit safety) is the correctness-critical path in this system and is
covered in `backend/test/ledger.test.ts`. It runs against a real Postgres instance
(no mocked DB):

```bash
npm run test -w backend
```

### Smoke-testing `/analyze` via curl

```bash
# 1. Exchange a Google ID token for app tokens (see docs/ARCHITECTURE.md for why
#    the extension uses launchWebAuthFlow rather than getAuthToken to obtain one)
curl -X POST http://localhost:8080/auth/google \
  -H "Content-Type: application/json" \
  -d '{"idToken":"<google id token>"}'

# 2. Analyze an image
curl -X POST http://localhost:8080/analyze \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey":"'"$(node -e 'console.log(crypto.randomUUID())')"'",
    "sourceType":"image_url",
    "imageUrl":"https://example.com/image.jpg",
    "languages":["en"]
  }'

# 3. Check balance / history
curl http://localhost:8080/credits/balance -H "Authorization: Bearer <accessToken>"
curl http://localhost:8080/history -H "Authorization: Bearer <accessToken>"
```

### Dev-only credit grant (stand-in for a future Stripe webhook)

```bash
curl -X POST http://localhost:8080/admin/credits/grant \
  -H "x-admin-token: <ADMIN_TOKEN from .env>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","amount":20,"reason":"manual_grant"}'
```

## Extension setup

```bash
cd extension
cp .env.example .env   # VITE_API_BASE_URL, default http://localhost:8080
npm install --workspace extension --include-workspace-root
npm run build -w extension
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** →
select `extension/dist`.

Before this works end-to-end you need:
1. A Google OAuth client ID (Chrome Extension type, matching this extension's ID)
   set as `oauth2.client_id` in `extension/manifest.json` and as `GOOGLE_CLIENT_ID`
   in `backend/.env`.
2. `backend/.env`'s `EXTENSION_ORIGIN` set to `chrome-extension://<your-extension-id>`
   (shown on `chrome://extensions` once loaded) — CORS rejects everything else.

For local iteration with hot reload: `npm run dev -w extension`, then load the
`extension/dist` folder as unpacked (crxjs keeps it updated).

## Environment variables

See `backend/.env.example` and `extension/.env.example` for the full list. Nothing
provider-specific is hardcoded — swapping the vision provider is a `VISION_PROVIDER`
env var change (see `docs/ARCHITECTURE.md`).

## Status / what's verified so far

- Prisma schema validated and the client generates cleanly; `prisma migrate dev`
  itself is pending a local Postgres (Docker Desktop install in progress).
- Backend type-checks clean in strict mode, boots, and its full route/error-handling
  surface (auth, `/analyze`, `/history`, `/admin/credits/grant`, rate limiting) has
  been smoke-tested without a live DB or real provider keys.
- Extension type-checks clean in strict mode and the production build (Vite + crxjs)
  succeeds, producing a manifest with the intended permission set and no
  `host_permissions`.
- Full live end-to-end verification (real Postgres, real Google OAuth client, real
  Gemini key, actually loading the unpacked extension in Chrome and clicking
  through sign-in → analyze → history) is pending those credentials/Docker.
