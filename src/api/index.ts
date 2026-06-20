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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

// Seed-load is best-effort and NON-fatal: content is already in the DB, so a transient Neon
// hiccup (ECONNRESET) on boot must never crash the server. Run after listen, swallow errors.
initializeDatabase().catch((e) => {
  console.error('initializeDatabase skipped (non-fatal):', e?.message ?? e);
});
