import axios from 'axios';

/**
 * ModelRouter — cost policy (bottom_up.md §8, HARD RULE):
 *   - real users (prod profile)      → Claude Haiku
 *   - all testing (test profile)     → NVIDIA NIM (free) ; offline → mock
 *   - never run a test suite on Haiku.
 *
 * Profile resolves from env: MODEL_PROFILE / LLM_PROVIDER. Under a test runner
 * (NODE_ENV=test) we refuse Haiku and force NIM/mock.
 */
export type Provider = 'mock' | 'nvidia' | 'claude';

const NIM_BASE = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
// meta/llama-3.3-70b-instruct: non-reasoning, returns clean JSON in `content` (the nemotron
// "super" reasoning models strand content as null with json_object on NIM). Fast + warm for tutoring.
const NIM_MODEL = process.env.MODEL_NODE_NIM || 'meta/llama-3.3-70b-instruct';
const HAIKU_MODEL = process.env.MODEL_NODE || 'claude-haiku-4-5-20251001';
// Translation needs a strong multilingual model (NIM is weak on Indian languages). Claude Haiku by
// default; set MODEL_TRANSLATE=claude-sonnet-4-6 for top quality.
const TRANSLATE_MODEL = process.env.MODEL_TRANSLATE || 'claude-haiku-4-5-20251001';

/** Strong-model completion for translation (Claude). Returns plain text. */
export async function claudeTranslate(messages: ChatMessage[], maxTokens = 1000): Promise<string> {
  return claudeComplete(messages, maxTokens, TRANSLATE_MODEL);
}

export function resolveProvider(): Provider {
  const isTestRunner = process.env.NODE_ENV === 'test';
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase();

  if (explicit === 'mock') return 'mock';
  if (explicit === 'nvidia' || explicit === 'nim') return 'nvidia';
  if (explicit === 'claude' || explicit === 'haiku') {
    // Refuse Haiku under a test runner — fall back to NIM (free) or mock.
    if (isTestRunner) return process.env.NVIDIA_API_KEY ? 'nvidia' : 'mock';
    return 'claude';
  }
  // Default: prefer free NIM when a key exists, else mock. (We are "testing" by default.)
  if (process.env.NVIDIA_API_KEY) return 'nvidia';
  return 'mock';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Call the active provider for a JSON completion. Returns raw text (caller parses). */
export async function completeJson(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string> {
  const provider = resolveProvider();
  if (provider === 'nvidia') return nimComplete(messages, opts?.maxTokens ?? 1024, true);
  if (provider === 'claude') return claudeComplete(messages, opts?.maxTokens ?? 1024);
  throw new Error('mock'); // caller catches and uses its offline path
}

async function nimComplete(messages: ChatMessage[], maxTokens: number, json: boolean): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('NVIDIA_API_KEY missing');
  // NOTE: no response_format json_object — on NIM it strands content as null for several models.
  // We instead instruct "Return ONLY JSON" in the prompt and use parseLooseJson on the reply.
  void json;
  const res = await axios.post(
    `${NIM_BASE}/chat/completions`,
    {
      model: NIM_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: maxTokens,
    },
    {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      // Free NIM tier can have high first-token latency under load; give it room before falling back.
      timeout: 60_000,
    }
  );
  const content = res.data?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) throw new Error('Empty NIM content');
  return String(content);
}

/**
 * Vision turn for the scratchpad "Help me": NIM's vision model reads the learner's handwritten
 * working (a JPEG data URL) and returns a short grounded hint. Falls back via thrown error.
 */
export async function nimVision(prompt: string, jpegDataUrl: string, maxTokens = 400): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('NVIDIA_API_KEY missing');
  const model = process.env.MODEL_VISION || 'nvidia/nemotron-nano-12b-v2-vl';
  const res = await axios.post(
    `${NIM_BASE}/chat/completions`,
    {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: jpegDataUrl } },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    },
    { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60_000 }
  );
  const content = res.data?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) throw new Error('Empty vision content');
  return String(content);
}

/** Author with Claude Haiku regardless of the runtime provider (used by the gate-authoring tool). */
export async function claudeAuthor(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  return claudeComplete(messages, maxTokens);
}

/** Claude Haiku VISION: caption/classify an image (base64). Used by the figure-captioning pass. */
export async function claudeVision(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mediaType = 'image/png',
  maxTokens = 400
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: userText },
          ],
        },
      ],
    },
    { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 40_000 }
  );
  const text = res.data?.content?.[0]?.text;
  if (!text) throw new Error('Empty Claude vision content');
  return String(text);
}

async function claudeComplete(messages: ChatMessage[], maxTokens: number, model: string = HAIKU_MODEL): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model, max_tokens: maxTokens, system, messages: rest },
    {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    }
  );
  const text = res.data?.content?.[0]?.text;
  if (!text) throw new Error('Empty Claude content');
  return String(text);
}

/** Tolerant JSON extraction from an LLM reply (handles code fences / surrounding prose). */
export function parseLooseJson<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
