/**
 * Central model registry — the ONE place to change which model each job uses. Nothing else in the
 * codebase should hardcode a provider model id; import { MODELS } from here instead. Every entry is
 * env-overridable (set the matching MODEL_* var on the service to swap a model with NO code change).
 *
 * Policy (2026-06-20): NVIDIA NIM (free) runs ALL live student traffic — we no longer use Claude
 * Haiku anywhere. The `claude*` ids fire ONLY on the opt-in LLM_PROVIDER=claude override and the
 * offline curated-authoring / jobs-news tools, which call the Anthropic API directly (so they need a
 * Claude id, not a NIM one). Haiku is retired, so they default to the current Claude model.
 */
export const MODELS = {
  /** Live tutor + grader JSON completion — NVIDIA NIM (free). Primary for ALL student traffic.
   *  Chosen 2026-06-20 after benchmarking the NIM catalog on the live free endpoint: Ministral-14B is
   *  ~2–7× faster (TTFT ~260ms vs ~370ms+, tutor turn ~1.3s vs 2.7–12s) than the old llama-3.3-70b at
   *  equal CBSE→JEE maths accuracy (16/16 on our gold set), and is a PLAIN INSTRUCT model — no hidden
   *  <think> traces to corrupt the streamed JSON turn. Reasoning models were rejected for that reason. */
  text: process.env.MODEL_TEXT || process.env.MODEL_NODE_NIM || 'mistralai/ministral-14b-instruct-2512',
  /** Fallback model tried when `text` errors (429/5xx/timeout/empty) — a DIFFERENT NIM model so a busy
   *  or down primary doesn't strand a student. Qwen3-Next-80B-A3B-Instruct: 3B-active MoE (snappy),
   *  strongest verified competition maths of the candidates, also plain-instruct / clean JSON. */
  textFallback: process.env.MODEL_TEXT_FALLBACK || 'qwen/qwen3-next-80b-a3b-instruct',
  /** Vision: sketch grading + "Help me" — NIM vision (free). */
  vision: process.env.MODEL_VISION || 'nvidia/nemotron-nano-12b-v2-vl',
  /** Claude text — opt-in override (LLM_PROVIDER=claude) + offline authoring. Haiku retired -> Sonnet. */
  claude: process.env.MODEL_CLAUDE || process.env.MODEL_AUTHOR || 'claude-sonnet-4-6',
  /** Claude vision — opt-in figure/sketch path only. */
  claudeVision: process.env.MODEL_CLAUDE_VISION || 'claude-sonnet-4-6',
};
