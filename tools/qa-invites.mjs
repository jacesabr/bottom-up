// QA the pre-recorded invite clips: transcribe each back and print it, so we confirm the audio
// actually says the invite (cross-vendor where possible: Sarvam-TTS clip -> Deepgram/Sarvam STT).
// Run: node tools/qa-invites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const DEEPGRAM = process.env.DEEPGRAM_API_KEY;
const SARVAM = process.env.SARVAM_API_KEY;

const EXPECT = {
  hi: { speech: 'hi-IN', text: 'हिंदी में सीखने के लिए, ऊपर बीच में दिए गए भाषा बॉक्स पर टैप करें।' },
  pa: { speech: 'pa-IN', text: 'ਪੰਜਾਬੀ ਵਿੱਚ ਸਿੱਖਣ ਲਈ, ਉੱਪਰ ਵਿਚਕਾਰਲੇ ਭਾਸ਼ਾ ਬਾਕਸ ਉੱਤੇ ਟੈਪ ਕਰੋ।' },
  ta: { speech: 'ta-IN', text: 'தமிழில் கற்க, மேலே நடுவில் உள்ள மொழிப் பெட்டியைத் தட்டவும்.' },
  bn: { speech: 'bn-IN', text: 'বাংলায় শিখতে, উপরে মাঝখানের ভাষা বাক্সে ট্যাপ করুন।' },
};

async function deepgram(buf, langTag) {
  if (!DEEPGRAM) return null;
  const r = await fetch(
    `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${encodeURIComponent(langTag)}`,
    { method: 'POST', headers: { Authorization: `Token ${DEEPGRAM}`, 'Content-Type': 'audio/wav' }, body: buf }
  );
  if (!r.ok) return `(deepgram HTTP ${r.status})`;
  const d = await r.json();
  return d?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '(empty)';
}

async function sarvam(buf, speech) {
  if (!SARVAM) return null;
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', 'saarika:v2.5');
  form.append('language_code', speech);
  const r = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM },
    body: form,
  });
  if (!r.ok) return `(sarvam HTTP ${r.status})`;
  const d = await r.json();
  return d?.transcript ?? '(empty)';
}

for (const [code, { speech, text }] of Object.entries(EXPECT)) {
  const file = path.join(ROOT, 'public', 'audio', 'invites', `${code}.wav`);
  if (!fs.existsSync(file)) {
    console.log(`\n[${code}] MISSING ${file}`);
    continue;
  }
  const buf = fs.readFileSync(file);
  const dg = await deepgram(buf, speech);
  const sv = await sarvam(buf, speech);
  console.log(`\n[${code}]  expected: ${text}`);
  console.log(`     deepgram: ${dg}`);
  console.log(`       sarvam: ${sv}`);
}
