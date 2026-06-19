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
  /** Live tutor + grader JSON completion — NVIDIA NIM (free). Primary for ALL student traffic. */
  text: process.env.MODEL_TEXT || process.env.MODEL_NODE_NIM || 'meta/llama-3.3-70b-instruct',
  /** Vision: sketch grading + "Help me" — NIM vision (free). */
  vision: process.env.MODEL_VISION || 'nvidia/nemotron-nano-12b-v2-vl',
  /** Claude text — opt-in override (LLM_PROVIDER=claude) + offline authoring. Haiku retired -> Sonnet. */
  claude: process.env.MODEL_CLAUDE || process.env.MODEL_AUTHOR || 'claude-sonnet-4-6',
  /** Claude vision — opt-in figure/sketch path only. */
  claudeVision: process.env.MODEL_CLAUDE_VISION || 'claude-sonnet-4-6',
};
