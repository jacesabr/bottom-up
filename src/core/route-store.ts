/**
 * Per-learner model selection from the NIM router. The /route endpoint speed-probes and the BROWSER caches
 * the winning text/vision ids; the client then sends them back on EVERY turn, and setRoutePicks() seeds this
 * per-learner store (after the api validates them against the gated pool) so the teach + grade path reads the
 * right model. In-memory per api process, but the browser is the source of truth and re-seeds on every turn —
 * so picks survive deploys and work across instances. Empty store → callers fall back to models.ts.
 */
import type { RouteResult } from './nim-router.js';

interface Pick { text?: string; textFallback?: string; textChain?: string[]; vision?: string; ts: number; lastText?: RouteResult; lastVision?: RouteResult; }
const store = new Map<string, Pick>();

export function setRoute(learnerId: string, result: RouteResult): void {
  if (!learnerId) return;
  const cur = store.get(learnerId) ?? { ts: 0 };
  if (result.kind === 'text') {
    // The full HEALTHY pool, best-first — the cascade in completeJson walks this so one dead model never
    // blocks the rest. (ranked = [healthy best-first, then failed rows]; keep only ok ones.)
    const healthy = result.ranked.filter((r) => r.ok).map((r) => r.model);
    cur.text = result.winner;
    // 2nd-best HEALTHY model (not ranked[1], which is a ✗-timed-out row when only one model passed the probe).
    cur.textFallback = healthy.find((m) => m !== result.winner) ?? result.fallback;
    cur.textChain = healthy.length ? healthy : [result.winner, result.fallback].filter(Boolean) as string[];
    cur.lastText = result;
  } else {
    cur.vision = result.winner;
    cur.lastVision = result;
  }
  cur.ts = Date.now();
  store.set(learnerId, cur);
}

/** Seed the store directly from the client's cached picks (the browser ran the probe and remembers the
 *  winners). Called on each turn so ANY api instance can serve it without a shared store. Pass only ids
 *  already validated against the gated pool (see isAllowedModel); undefined fields are left untouched. */
export function setRoutePicks(learnerId: string, picks: { text?: string; textFallback?: string; textChain?: string[]; vision?: string }): void {
  if (!learnerId) return;
  const cur = store.get(learnerId) ?? { ts: 0 };
  if (picks.text) cur.text = picks.text;
  if (picks.textFallback) cur.textFallback = picks.textFallback;
  if (picks.textChain?.length) cur.textChain = picks.textChain; // full healthy pool the browser probed (survives deploys)
  if (picks.vision) cur.vision = picks.vision;
  cur.ts = Date.now();
  store.set(learnerId, cur);
}

/** Text model override for completeJson opts — {} when nothing probed yet (caller falls back to default).
 *  `models` is the full healthy cascade (best-first); completeJson walks it so a dead model never blocks. */
export function getTextModel(learnerId?: string): { model?: string; modelFallback?: string; models?: string[] } {
  if (!learnerId) return {};
  const p = store.get(learnerId);
  if (!p) return {};
  const models = p.textChain?.length ? p.textChain : [p.text, p.textFallback].filter((m): m is string => !!m);
  return { model: p.text, modelFallback: p.textFallback, models: models.length ? models : undefined };
}

export function getVisionModel(learnerId?: string): string | undefined {
  return learnerId ? store.get(learnerId)?.vision : undefined;
}

/** The model currently serving this learner (for the "X failed" message in the recovery popup). */
export function getCurrentText(learnerId?: string): string | undefined {
  return learnerId ? store.get(learnerId)?.text : undefined;
}
