import 'dotenv/config';
import express from 'express';
import { initializeDatabase } from '../db/index.js';
import routes from './routes.js';
import adminRoutes from './admin.js';
import { padRouter, mobilePageHandler } from './pad.js';
import { cors, securityHeaders, rateLimit } from '../core/access.js';

const app = express();
app.disable('x-powered-by'); // don't advertise the framework/version
// Render injects PORT; fall back to API_PORT / 3030 locally.
const PORT = process.env.PORT || process.env.API_PORT || 3030;

// Honour x-forwarded-proto behind Render's proxy so the QR pairing URL is built as https, not http.
app.set('trust proxy', 1); // trust ONE proxy hop (Render's LB) so req.ip is the real client, not XFF-spoofable

app.use(express.json({ limit: '8mb' })); // scratchpad images arrive as base64 data URLs

// Security headers on every response, locked-down CORS (allowlist — local dev + *.onrender.com +
// ALLOWED_ORIGINS — instead of `*`), and a generous per-IP rate limit. These are defense-in-depth on top
// of the real protection: the per-node access gate (core/access.ts) applied to every content route.
app.use(securityHeaders);
app.use(cors);
app.use(rateLimit({ windowMs: 60_000, max: 1000 }));

// Routes (mounted FIRST so the server serves even if the seed-load hiccups)
app.use('/api/admin', adminRoutes);
app.use('/api', padRouter); // QR phone→scratchpad image relay
app.use('/api', routes);

// Phone camera-capture page (scanned from the desktop QR). Served from the API origin so its upload
// POST is same-origin; not under /api because it returns HTML, not JSON.
app.get('/m/:token', mobilePageHandler);

// Readiness gate. `/health` stays 503 until we've confirmed the DB is reachable, so Render's
// zero-downtime deploy keeps traffic on the OLD instance until this new one can actually serve a
// turn — a static 200 (returned the instant Express binds, before the DB is confirmed) lets Render
// cut over early and kill the old instance while we're still warming, which drops live requests.
let ready = false;

// Health check — honest about readiness (200 only once the DB is reachable, else 503).
app.get('/health', (_req, res) => {
  if (ready) res.json({ status: 'ok' });
  else res.status(503).json({ status: 'starting' });
});

const server = app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

// Confirm the DB is reachable before going ready (initializeDatabase does a real round-trip + logs the
// loaded scale). Retry on a transient Neon hiccup rather than crash — and stay 503 meanwhile, so Render
// never routes to an instance that can't reach the DB. Content is already loaded out-of-band; we never seed.
(async function becomeReadyWhenDbReachable() {
  for (let attempt = 1; ; attempt++) {
    try {
      await initializeDatabase();
      ready = true;
      console.log('Readiness: DB reachable — accepting traffic.');
      return;
    } catch (e) {
      console.warn(`Readiness: DB not reachable yet (attempt ${attempt}) — retrying in 2s:`, (e as Error)?.message ?? e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
})();

// Graceful shutdown so Render's zero-downtime swap DRAINS in-flight turns instead of killing them
// mid-stream. A streaming tutor turn (2–12s on NIM) cut by SIGTERM never reaches recordLlmCall — the
// learner sees the "down" message and nothing is logged (exactly the failure mode we hit). On signal:
// flip to 503 (LB stops routing), stop accepting new connections, let in-flight requests finish.
function shutdown(signal: string) {
  console.log(`${signal} received — draining; refusing new requests.`);
  ready = false; // health check now 503 → Render drains us before sending more traffic
  server.close((err) => {
    if (err) { console.error('Error during server.close:', err); process.exit(1); }
    console.log('Drained cleanly — exiting.');
    process.exit(0);
  });
  // Safety net: force-exit before Render's ~30s SIGKILL so a stuck connection can't hang the drain.
  setTimeout(() => { console.warn('Drain timed out — forcing exit.'); process.exit(0); }, 25_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
