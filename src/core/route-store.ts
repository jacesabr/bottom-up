/**
 * Per-learner model selection from the NIM router. The /route endpoint speed-probes and stores the
 * winning text/vision model id here; the teach + grade path reads it so a session uses the model that
 * was fastest×best when the learner entered the node. In-memory (single api process) — resets on deploy,
 * which just forces a fresh probe; no persistence needed. Empty store → callers fall back to models.ts.
 */
import type { RouteResult } from './nim-router.js';

interface Pick { text?: string; textFallback?: string; vision?: string; ts: number; lastText?: RouteResult; lastVision?: RouteResult; }
const store = new Map<string, Pick>();

export function setRoute(learnerId: string, result: RouteResult): void {
  if (!learnerId) return;
  const cur = store.get(learnerId) ?? { ts: 0 };
  if (result.kind === 'text') {
    cur.text = result.winner;
    cur.textFallback = result.ranked[1]?.model ?? result.fallback; // 2nd-best as in-session fallback
    cur.lastText = result;
  } else {
    cur.vision = result.winner;
    cur.lastVision = result;
  }
  cur.ts = Date.now();
  store.set(learnerId, cur);
}

/** Text model override for completeJson opts — {} when nothing probed yet (caller falls back to default). */
export function getTextModel(learnerId?: string): { model?: string; modelFallback?: string } {
  if (!learnerId) return {};
  const p = store.get(learnerId);
  return p ? { model: p.text, modelFallback: p.textFallback } : {};
}

export function getVisionModel(learnerId?: string): string | undefined {
  return learnerId ? store.get(learnerId)?.vision : undefined;
}

/** The model currently serving this learner (for the "X failed" message in the recovery popup). */
export function getCurrentText(learnerId?: string): string | undefined {
  return learnerId ? store.get(learnerId)?.text : undefined;
}
