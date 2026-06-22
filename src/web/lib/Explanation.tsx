import { MathText } from './MathText';
import '../styles/Explanation.css';

type ExplainPart = { num: string; head: string; body: string };

/**
 * Split a PART-structured explanation into ordered parts. Authored explanations follow
 * `PART N — Heading.\n<body>` (see authoring_and_improve.md §C). We split on the marker (em-dash or
 * hyphen, any surrounding whitespace) so it works whether parts are separated by blank lines or
 * run together. Returns null when there are no PART markers — caller falls back to plain paragraphs.
 */
export function parseParts(text: string): { preamble: string; parts: ExplainPart[] } | null {
  if (!/PART\s+\d+\s*[—–-]/.test(text)) return null;
  const segs = text.split(/(?=PART\s+\d+\s*[—–-])/);
  const preamble = segs[0].trim().startsWith('PART') ? '' : segs.shift()!.trim();
  const parts: ExplainPart[] = [];
  for (const seg of segs) {
    const m = seg.match(/^PART\s+(\d+)\s*[—–-]\s*([\s\S]*)$/);
    if (!m) continue;
    const num = m[1];
    const rest = m[2].trim();
    // Heading = up to the first line break if present, else up to the first sentence end.
    let head = rest;
    let body = '';
    const nl = rest.indexOf('\n');
    if (nl >= 0) {
      head = rest.slice(0, nl).trim();
      body = rest.slice(nl + 1).trim();
    } else {
      const dot = rest.indexOf('. ');
      if (dot >= 0) {
        head = rest.slice(0, dot + 1).trim();
        body = rest.slice(dot + 2).trim();
      }
    }
    parts.push({ num, head, body });
  }
  return parts.length ? { preamble, parts } : null;
}

/**
 * Render an authored explanation. PART-structured ones become numbered, arrow-linked step cards
 * (the bottom-up sequence); anything else falls back to plain paragraphs split on blank lines.
 * Shared by the ⓘ Details panel and the lesson-complete "close-up of the material" recap so the
 * same material reads identically in both — never a single dumped wall of text.
 */
export function FormattedExplanation({ text }: { text: string }) {
  const parsed = parseParts(text);
  if (!parsed) {
    return (
      <>
        {text.split('\n\n').map((para, i) => (
          <p key={i} className="expl-para">
            <MathText>{para}</MathText>
          </p>
        ))}
      </>
    );
  }
  return (
    <div className="expl-parts">
      {parsed.preamble && (
        <p className="expl-para">
          <MathText>{parsed.preamble}</MathText>
        </p>
      )}
      {parsed.parts.map((p, i) => (
        <div key={i} className="expl-part-wrap">
          <div className="expl-part">
            <div className="expl-badge">{p.num}</div>
            <div className="expl-content">
              <div className="expl-head">
                <MathText>{p.head}</MathText>
              </div>
              {p.body &&
                p.body.split('\n\n').map((b, j) => (
                  <p key={j} className="expl-body">
                    <MathText>{b}</MathText>
                  </p>
                ))}
            </div>
          </div>
          {i < parsed.parts.length - 1 && (
            <div className="expl-arrow" aria-hidden="true">↓</div>
          )}
        </div>
      ))}
    </div>
  );
}
