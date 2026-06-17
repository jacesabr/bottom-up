import 'dotenv/config';
import express from 'express';
import { initializeDatabase } from '../db/index.js';
import routes from './routes.js';
import adminRoutes from './admin.js';

const app = express();
// Render injects PORT; fall back to API_PORT / 3030 locally.
const PORT = process.env.PORT || process.env.API_PORT || 3030;

app.use(express.json({ limit: '8mb' })); // scratchpad images arrive as base64 data URLs

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Routes (mounted FIRST so the server serves even if the seed-load hiccups)
app.use('/api/admin', adminRoutes);
app.use('/api', routes);

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
