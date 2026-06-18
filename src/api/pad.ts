import express from 'express';

/**
 * Phone → scratchpad image relay (QR upload).
 *
 * A learner working on a lesson at their computer can scan a QR code with their phone, snap a photo
 * of paper working, and have it land on the on-screen scratchpad — to keep drawing on, Attach to the
 * chat, or hit "Help me". The handoff is a short-lived in-memory channel keyed by a random token:
 *   1. desktop  POST /api/pad-session            → { token, url }   (url is the phone page to scan)
 *   2. phone    GET  /m/:token                    → self-contained camera-capture page
 *   3. phone    POST /api/pad-upload/:token       → { image }       (downscaled JPEG data URL)
 *   4. desktop  GET  /api/pad-upload/:token       → { image }       (one-shot; cleared on delivery)
 *
 * No DB: these are throwaway rough-work images, single web instance, gone in minutes. Sessions expire
 * after PAD_TTL_MS so a forgotten/abandoned scan can't pile up.
 */

const PAD_TTL_MS = 10 * 60 * 1000; // 10 minutes — a scan is a here-and-now handoff

interface PadSession {
  image: string | null; // latest uploaded JPEG data URL, null once the desktop has picked it up
  createdAt: number;
}

const padSessions = new Map<string, PadSession>();

// Drop abandoned sessions so the map can't grow without bound.
setInterval(() => {
  const cutoff = Date.now() - PAD_TTL_MS;
  for (const [token, s] of padSessions) if (s.createdAt < cutoff) padSessions.delete(token);
}, 60 * 1000).unref?.();

export const padRouter = express.Router();

// Desktop opens a pairing session and gets the URL to encode into the QR it shows.
padRouter.post('/pad-session', (req, res) => {
  const token = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
  padSessions.set(token, { image: null, createdAt: Date.now() });
  // Behind Render's proxy req.protocol honours x-forwarded-proto (trust proxy is set in index.ts).
  const host = req.get('host');
  const url = `${req.protocol}://${host}/m/${token}`;
  res.json({ token, url });
});

// Phone uploads a (downscaled) photo into the session.
padRouter.post('/pad-upload/:token', (req, res) => {
  const { token } = req.params;
  const session = padSessions.get(token);
  if (!session) return res.status(404).json({ error: 'expired' });
  const { image } = req.body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'no image' });
  }
  session.image = image;
  session.createdAt = Date.now(); // keep the session warm while the phone is actively sending
  res.json({ ok: true });
});

// Desktop polls; returns the latest image once (then clears it so it isn't re-loaded).
padRouter.get('/pad-upload/:token', (req, res) => {
  const session = padSessions.get(req.params.token);
  if (!session) return res.status(404).json({ error: 'expired' });
  const image = session.image;
  session.image = null;
  res.json({ image: image ?? null });
});

// Desktop closes the modal → drop the session immediately.
padRouter.delete('/pad-session/:token', (req, res) => {
  padSessions.delete(req.params.token);
  res.json({ ok: true });
});

/**
 * The self-contained phone page (no build step, no SPA — served straight from the API origin so the
 * upload POST is same-origin). The phone downscales the photo to keep it well under the JSON limit.
 */
export function mobilePageHandler(req: express.Request, res: express.Response) {
  const token = req.params.token;
  if (!/^[a-z0-9]+$/i.test(token) || !padSessions.has(token)) {
    res.status(404).type('html').send(EXPIRED_PAGE);
    return;
  }
  res.type('html').send(mobilePage(token));
}

const EXPIRED_PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Link expired</title></head>
<body style="font-family:system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#faf7f2;color:#1c1b19;text-align:center;padding:24px">
<div><div style="font-size:42px">⏳</div><h2>This scan has expired</h2><p style="color:#6b675f">Tap the 📷 Scan button on your computer again to get a fresh code.</p></div>
</body></html>`;

function mobilePage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Add to scratchpad</title>
<style>
  :root { --accent:#d9591f; --ink:#1c1b19; --dim:#6b675f; --card:#fff; --bg:#faf7f2; --rule:#e7e1d6; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; margin:0; background:var(--bg); color:var(--ink);
         min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:22px 18px 40px; }
  h1 { font-size:1.25rem; margin:6px 0 2px; }
  p.sub { color:var(--dim); margin:0 0 18px; text-align:center; font-size:0.92rem; max-width:340px; }
  .card { background:var(--card); border:1px solid var(--rule); border-radius:18px; padding:18px; width:100%; max-width:420px; }
  label.pick { display:block; border:2px dashed var(--rule); border-radius:14px; padding:30px 16px; text-align:center; cursor:pointer; color:var(--dim); }
  label.pick .ico { font-size:40px; display:block; margin-bottom:8px; }
  input[type=file] { display:none; }
  img.preview { width:100%; border-radius:12px; margin-top:14px; display:none; border:1px solid var(--rule); }
  button { width:100%; margin-top:14px; padding:15px; border:none; border-radius:12px; background:var(--accent); color:#fff;
           font-size:1.02rem; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.5; }
  button.secondary { background:#fff; color:var(--ink); border:1px solid var(--rule); }
  .status { margin-top:14px; text-align:center; font-size:0.95rem; min-height:1.2em; }
  .status.ok { color:#2e7d32; } .status.err { color:#c0392b; }
  .done { font-size:46px; text-align:center; }
</style>
</head>
<body>
  <h1>📷 Snap your working</h1>
  <p class="sub">Take a photo of your rough work on paper — it'll appear on the scratchpad on your computer.</p>
  <div class="card">
    <label class="pick" id="pickLabel">
      <span class="ico">📸</span>
      <span id="pickText">Tap to take a photo</span>
      <input id="file" type="file" accept="image/*" capture="environment" />
    </label>
    <img id="preview" class="preview" alt="preview" />
    <button id="send" disabled>Send to scratchpad</button>
    <div class="status" id="status"></div>
  </div>
<script>
  var token = ${JSON.stringify(token)};
  var fileEl = document.getElementById('file');
  var preview = document.getElementById('preview');
  var sendBtn = document.getElementById('send');
  var statusEl = document.getElementById('status');
  var pickText = document.getElementById('pickText');
  var dataUrl = null;

  function setStatus(msg, cls) { statusEl.textContent = msg || ''; statusEl.className = 'status' + (cls ? ' ' + cls : ''); }

  // Downscale the captured photo so the upload stays small (longest side <= 1600px, JPEG ~0.85).
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var max = 1600;
        var w = img.width, h = img.height;
        var scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        resolve(c.toDataURL('image/jpeg', 0.85));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  fileEl.addEventListener('change', function () {
    var f = fileEl.files && fileEl.files[0];
    if (!f) return;
    setStatus('Preparing…');
    shrink(f).then(function (url) {
      dataUrl = url;
      preview.src = url; preview.style.display = 'block';
      pickText.textContent = 'Retake photo';
      sendBtn.disabled = false;
      setStatus('');
    }).catch(function () { setStatus('Could not read that image — try again.', 'err'); });
  });

  sendBtn.addEventListener('click', function () {
    if (!dataUrl) return;
    sendBtn.disabled = true;
    setStatus('Sending…');
    fetch('/api/pad-upload/' + token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    }).then(function (r) {
      if (!r.ok) throw new Error('upload');
      document.querySelector('.card').innerHTML =
        '<div class="done">✅</div><p class="sub" style="margin:10px auto 0">Sent! Look back at your computer — it\\'s on your scratchpad now.</p>' +
        '<button class="secondary" onclick="location.reload()">Send another photo</button>';
    }).catch(function () {
      sendBtn.disabled = false;
      setStatus('This scan may have expired. Re-scan the code on your computer.', 'err');
    });
  });
</script>
</body>
</html>`;
}
