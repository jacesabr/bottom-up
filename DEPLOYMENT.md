# Deployment Guide

## Local Development

### Prerequisites
- Node.js 20+
- pnpm
- PostgreSQL 16 (or Neon Postgres)

### Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL and API keys
   ```

3. **Initialize database:**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   pnpm db:push
   ```

4. **Run development servers:**
   ```bash
   pnpm dev
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
  content/        # Imported content bundle (jemh101.slice.json)
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
# - Environment:
#   DATABASE_URL: [from Step 1]
#   ANTHROPIC_API_KEY: [from .env]
#   NVIDIA_API_KEY: [from .env]
#   API_PORT: 3030
# - Auto-deploy: yes
# - Branch: master
# - Repo: https://github.com/jacesabr/bottom-up.git
```

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

Render will auto-deploy both services. Check the dashboard for build logs.

## Testing

### Offline Mock Test
```bash
pnpm test
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

✅ **Real users → Claude Haiku** (configured in ModelRouter profile)
✅ **All testing → NVIDIA NIM or mock** (never Haiku in test suites)
✅ **Event-sourced performance** (append-only bu_event table)
✅ **3 nodes only for now** (scale after genuinely good loop)
✅ **Copy Socratic styling** (cream palette, Tutor shell layout, math rendering)
