import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import QRCode from 'qrcode';
import '../styles/Scratchpad.css';

export interface ScratchpadHandle {
  exportJpeg: () => string | null;
}

/**
 * Canvas scratchpad (chat | scratchpad split), modelled on Socratic's ScratchpadCanvas:
 * native HTML5 canvas, pen + hand(pan) tools, zoom, clear. The canvas sizes itself to its
 * container (via ResizeObserver) so it fills the pane instead of forcing a tall page.
 *
 * Phone upload: the 📷 Scan button shows a QR code. Scanning it on a phone opens a camera page
 * (served by the API); the snapped photo is relayed back and drawn onto the canvas as a background
 * layer (resized to fit), so the learner can keep working on it, then Attach / Help me / Send.
 */
const INK = '#1c1b19';

interface ScratchpadProps {
  onAttach?: (jpegDataUrl: string) => void;
  onHelp?: (jpegDataUrl: string) => void;
  onSend?: (jpegDataUrl: string) => void;
  className?: string;
  apiBase: string;
  highlight?: 'attach' | 'helpme' | 'qr' | null; // glow a specific control when the tutor mentions it
}

const Scratchpad = forwardRef<ScratchpadHandle, ScratchpadProps>(function Scratchpad(
  { onAttach, onHelp, onSend, className, apiBase, highlight },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const bgImage = useRef<HTMLImageElement | null>(null); // photo scanned in from a phone (background layer)
  const [tool, setTool] = useState<'pen' | 'hand'>('pen');
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);

  // QR phone-upload session state.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImg, setQrImg] = useState<string | null>(null); // QR rendered as a PNG data URL
  const [scanStatus, setScanStatus] = useState<'connecting' | 'waiting' | 'received' | 'error'>('connecting');
  const tokenRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const exportJpeg = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/jpeg', 0.75);
  };
  useImperativeHandle(ref, () => ({ exportJpeg }));
  const handOff = (cb?: (s: string) => void) => () => {
    const data = exportJpeg();
    if (data && cb) cb(data);
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Photo scanned from a phone sits behind the ink, scaled to fit (contain) and centred.
    const bg = bgImage.current;
    if (bg && bg.width && bg.height) {
      const scale = Math.min(canvas.width / bg.width, canvas.height / bg.height);
      const w = bg.width * scale;
      const h = bg.height * scale;
      ctx.drawImage(bg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const stroke of strokes.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  };

  // Draw an incoming phone photo as the background layer (resized to the canvas), then enable actions.
  const loadBackground = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      bgImage.current = img;
      redraw();
      setDirty(true);
    };
    img.src = dataUrl;
  };

  // Size the canvas to its container; re-fit on resize (keeps strokes).
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const fit = () => {
      const r = container.getBoundingClientRect();
      canvas.width = Math.max(200, Math.floor(r.width));
      canvas.height = Math.max(200, Math.floor(r.height));
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    if (tool !== 'pen') return;
    e.preventDefault();
    // Keep receiving move/up events even if the pointer drifts off the canvas mid-stroke.
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* not all pointers support capture */
    }
    drawing.current = true;
    const p = pos(e);
    last.current = p;
    strokes.current.push([p]);
    // Restore stroke styling in case the context was reset (e.g. after a resize).
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };
  const draw = (e: React.PointerEvent) => {
    if (!drawing.current || tool !== 'pen') return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    strokes.current[strokes.current.length - 1].push(p);
    last.current = p;
    if (!dirty) setDirty(true);
  };
  const endDraw = (e?: React.PointerEvent) => {
    if (e) {
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    }
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    strokes.current = [];
    bgImage.current = null;
    redraw();
    setDirty(false);
  };

  // ---- QR phone-upload session ----
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const closeScan = () => {
    setQrOpen(false);
    stopPolling();
    const token = tokenRef.current;
    tokenRef.current = null;
    setQrImg(null);
    if (token) {
      fetch(`${apiBase}/pad-session/${token}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const openScan = async () => {
    setQrOpen(true);
    setScanStatus('connecting');
    setQrImg(null);
    try {
      const res = await fetch(`${apiBase}/pad-session`, { method: 'POST' });
      const { token, url } = await res.json();
      tokenRef.current = token;
      setQrImg(await QRCode.toDataURL(url, { width: 240, margin: 1 }));
      setScanStatus('waiting');
      // Poll for the phone's upload; load it onto the canvas and close once it lands.
      stopPolling();
      pollRef.current = setInterval(async () => {
        const t = tokenRef.current;
        if (!t) return;
        try {
          const r = await fetch(`${apiBase}/pad-upload/${t}`);
          if (!r.ok) return;
          const d = await r.json();
          if (d.image) {
            loadBackground(d.image);
            setScanStatus('received');
            stopPolling();
            setTimeout(closeScan, 900);
          }
        } catch {
          /* transient network blip — keep polling */
        }
      }, 1800);
    } catch {
      setScanStatus('error');
    }
  };

  // Tear down the session if the component unmounts mid-scan.
  useEffect(() => () => { stopPolling(); }, []);

  return (
    <div className={`scratchpad${className ? ` ${className}` : ''}`}>
      <div className="scratchpad-toolbar">
        <button className={tool === 'pen' ? 'sp-btn active' : 'sp-btn'} onClick={() => setTool('pen')}>✏️ Pen</button>
        <button className={tool === 'hand' ? 'sp-btn active' : 'sp-btn'} onClick={() => setTool('hand')}>✋ Hand</button>
        <button
          className={`sp-btn sp-scan${highlight === 'qr' ? ' glow' : ''}`}
          onClick={openScan}
          title="Scan a QR code with your phone to add a photo of your paper working"
        >
          📷 Scan
        </button>
        <div className="sp-zoom">
          <button className="sp-btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="sp-btn" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}>+</button>
        </div>
        <button className="sp-btn sp-clear" onClick={clear} disabled={!dirty}>Clear</button>
      </div>

      <div className="scratchpad-canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
          onPointerLeave={endDraw}
          style={{
            cursor: tool === 'hand' ? 'grab' : 'crosshair',
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            touchAction: 'none', // stop touch/pen gestures from scrolling instead of drawing
          }}
        />
      </div>
      <div className="scratchpad-actions">
        <button className={`sp-btn${highlight === 'attach' ? ' glow' : ''}`} onClick={handOff(onAttach)} disabled={!dirty} title="Attach this working to your reply">➕ Attach</button>
        <button className={`sp-btn${highlight === 'helpme' ? ' glow' : ''}`} onClick={handOff(onHelp)} disabled={!dirty} title="Ask the tutor to look at your working">💡 Help me</button>
        <button className="sp-btn sp-send" onClick={handOff(onSend)} disabled={!dirty} title="Send this working to the chat">📨 Send</button>
      </div>
      <div className="scratchpad-hint">Rough working — sketch, 📷 scan from your phone, then Attach / ask for Help / Send it to chat.</div>

      {qrOpen && (
        <div className="sp-qr-overlay" onClick={closeScan}>
          <div className="sp-qr-card" onClick={(e) => e.stopPropagation()}>
            <button className="sp-qr-close" onClick={closeScan} aria-label="Close">✕</button>
            <h3>📷 Scan to add a photo</h3>
            <p>Point your phone camera at this code, snap your paper working, and it'll land here on the scratchpad — ready to keep working on, Attach, or ask for Help.</p>
            <div className="sp-qr-box">
              {scanStatus === 'received' ? (
                <div className="sp-qr-done">✅<span>Got it!</span></div>
              ) : scanStatus === 'error' ? (
                <div className="sp-qr-err">Couldn't start the scan link. Close and try again.</div>
              ) : qrImg ? (
                <img src={qrImg} alt="QR code — scan with your phone" />
              ) : (
                <div className="sp-qr-loading">Preparing code…</div>
              )}
            </div>
            <div className="sp-qr-status">
              {scanStatus === 'waiting' && '⏳ Waiting for your photo…'}
              {scanStatus === 'connecting' && 'Setting up…'}
              {scanStatus === 'received' && 'Adding it to your scratchpad…'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default Scratchpad;
