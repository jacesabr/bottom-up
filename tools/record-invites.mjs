// Pre-render the FIXED language-invite menu to static audio clips, one per language, so the menu
// plays one consistent voice with zero per-run TTS variance. Output: public/audio/invites/<code>.wav
//
// The Sarvam config here MUST match the live path in src/core/voice.ts (speaker/model/pace) and the
// invite strings + speech codes in src/web/lib/voice.ts (LANG_INVITES) / src/core/languages.ts, so
// the recorded menu voice is the same as the live Indic lesson voice the learner then continues with.
//
// Run:  node tools/record-invites.mjs        (reads SARVAM_API_KEY from .env)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency).
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SARVAM = process.env.SARVAM_API_KEY;
if (!SARVAM) {
  console.error('SARVAM_API_KEY missing (set it in .env)');
  process.exit(1);
}

// Keep in sync with LANG_INVITES (src/web/lib/voice.ts) and lang().speech (src/core/languages.ts).
const INVITES = {
  hi: { speech: 'hi-IN', text: 'हिंदी में सीखने के लिए, ऊपर बीच में दिए गए भाषा बॉक्स पर टैप करें।' },
  pa: { speech: 'pa-IN', text: 'ਪੰਜਾਬੀ ਵਿੱਚ ਸਿੱਖਣ ਲਈ, ਉੱਪਰ ਵਿਚਕਾਰਲੇ ਭਾਸ਼ਾ ਬਾਕਸ ਉੱਤੇ ਟੈਪ ਕਰੋ।' },
  ta: { speech: 'ta-IN', text: 'தமிழில் கற்க, மேலே நடுவில் உள்ள மொழிப் பெட்டியைத் தட்டவும்.' },
  bn: { speech: 'bn-IN', text: 'বাংলায় শিখতে, উপরে মাঝখানের ভাষা বাক্সে ট্যাপ করুন।' },
};

const outDir = path.join(ROOT, 'public', 'audio', 'invites');
fs.mkdirSync(outDir, { recursive: true });

for (const [code, { speech, text }] of Object.entries(INVITES)) {
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_language_code: speech, speaker: 'anushka', model: 'bulbul:v2', pace: 0.9 }),
  });
  if (!res.ok) {
    console.error(`${code}: HTTP ${res.status} — ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  const b64 = data?.audios?.[0];
  if (!b64) {
    console.error(`${code}: no audio in response`);
    process.exit(1);
  }
  const file = path.join(outDir, `${code}.wav`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`${code}: wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
}
console.log('done — clips in public/audio/invites/');
