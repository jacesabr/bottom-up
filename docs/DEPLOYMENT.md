# Deployment Guide

## Local Development

### Prerequisites
- Node.js 20+
- npm (do NOT use pnpm — repo has no pnpm-lock.yaml and no packageManager field by design)
- Neon Postgres (production) or any PostgreSQL 15+ for local

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL and API keys
   ```

3. **Initialize database:**
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:push
   ```

4. **Run development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - API server on `http://localhost:3030`
   - Web frontend on `http://localhost:5173`

### Project Structure

```
bottom-up/
  src/
    api/          # Express API server (routes, health check)
    core/         # Teaching loop, sequencer, gate logic
    db/           # Drizzle schema, content loader, database init
    web/          # React frontend (components, styles)
    __tests__/    # Mock offline tests
  content/        # content/<exam>/<subject>/<chapter>/{content.json, exam.json, source/*.txt}
  tools/          # Dev scripts
  render.yaml     # Render deployment config
  drizzle.config.ts
  vite.config.ts
  package.json
```

## Render Deployment (jae account)

### Step 1: Create PostgreSQL Database

```bash
# Via Render dashboard: https://dashboard.render.com/postgres
# Or use the Render MCP tool to create:
# - Name: bottom-up-db
# - Plan: free or pro
# - Region: oregon (or closest to jae's region)
```

Capture the `DATABASE_URL` connection string.

### Step 2: Create Web Service (API)

```bash
# Via Render dashboard or MCP tool
# - Name: bottom-up-api
# - Runtime: Node
# - Build command: npm install && npm run build:api
# - Start command: npm run start
# - Build command: npm install --include=dev   (tsx must resolve locally — do NOT use `npx tsx`)
# - Start command: npm start   (= tsx src/api/index.ts)
# - Environment:
#   DATABASE_URL: [from Step 1]
#   ANTHROPIC_API_KEY: [from .env]   # live tutoring (Haiku)
#   NVIDIA_API_KEY: [from .env]      # NIM fallback (text) + student vision
#   LLM_PROVIDER: claude             # real-user path; Claude→NIM fallback on exhaustion (see src/core/llm.ts)
#   ADMIN_USER / ADMIN_PASSWORD      # gate the /api/admin/* dashboard (Basic auth)
#   API_PORT: 3030
# - Branch: master
# - Repo: https://github.com/jacesabr/bottom-up.git
```

> **LLM resilience:** with `LLM_PROVIDER=claude`, `completeJson()` falls back to the free NIM text model
> `meta/llama-3.3-70b-instruct` if Anthropic fails (429/quota, 401/403, 5xx/529, network/timeout) so a student's
> turn still completes; student vision already uses `nvidia/nemotron-nano-12b-v2-vl`. NIM-primary has no fallback.

### Step 3: Create Static Site (Frontend)

```bash
# Via Render dashboard or MCP tool
# - Name: bottom-up-web
# - Build command: npm install && npm run build:web
# - Publish path: dist/web
# - Auto-deploy: yes
# - Branch: master
# - Repo: https://github.com/jacesabr/bottom-up.git
# - Routes:
#   /api/* -> https://bottom-up-api.onrender.com/api/$path
#   /* -> /index.html (SPA fallback)
```

### Step 4: Deploy

Push to master branch:
```bash
git push origin master
```

> **⚠ Deploys do NOT auto-trigger** (no repo webhook). After pushing, trigger a deploy via the Render API:
> ```bash
> curl -X POST https://api.render.com/v1/services/srv-d8nuodbeo5us738ehh9g/deploys \
>   -H "Authorization: Bearer $RENDER_API_KEY" -d '{}'
> ```
> (API svc `srv-d8nuodbeo5us738ehh9g`, web `srv-d8nuom4m0tmc73ehufd0`.) Latest live deploy: commit `82eb0d1`.

### Content updates & the in-memory cache

The API caches static content (chapters + concepts) in memory (`src/core/content-cache.ts`). After loading new
content into the DB (`node_modules/.bin/tsx tools/load-content.ts <exam:subject:chapter>`), the cache must refresh
to serve it.

> **⚠ There is NO `POST /api/admin/reload` route** (an older note claimed this — it 404s). `invalidateContentCache()`
> exists but is **not exposed over HTTP**. The cache refreshes **only on API process restart** — free tier: the next
> cold-start after ~15 min idle; or trigger a deploy (above) to restart on demand. `load-content.ts` preserves
> existing DB-authored `concepts.refreshers` on reload (durability guard), so reloading never wipes refreshers.
> *(TODO: add an authenticated admin route that calls `invalidateContentCache()`+`invalidatePapersCache()`.)*

## Testing

### Offline Mock Test
```bash
npm test
```

### Manual Testing (Local)
1. Open `http://localhost:5173`
2. Pick the chapter
3. Click an available node
4. Complete the teaching loop
5. Pass the gate
6. Advance to next node

## Monitoring

- API logs: `https://dashboard.render.com/services/bottom-up-api`
- Web logs: `https://dashboard.render.com/static-sites/bottom-up-web`
- Database: Neon console (if using Neon)

## Hard Rules (from spec)

✅ **Real users → Claude Haiku, with live NIM fallback** (`completeJson` → `meta/llama-3.3-70b-instruct` on Anthropic exhaustion; vision on `nvidia/nemotron-nano-12b-v2-vl`)
✅ **All testing → NVIDIA NIM or mock** (never Haiku in test suites)
✅ **Event-sourced performance** (append-only bu_event table)
✅ **Full corpus live** (cbse10 14 ch, cbse12 13 ch, jee 14 ch — **3236 authored gates, all with verified sources**;
   Phase-2 complete 2026-06-19: per-gate sources + 215 refresher concepts + 17 §A bridge nodes. See `authoring_and_improve.md`.)
✅ **Copy Socratic styling** (cream palette, Tutor shell layout, math rendering)
