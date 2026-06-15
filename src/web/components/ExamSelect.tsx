import '../styles/SubjectSelect.css';

/** Step 1 — pick the exam/board. CBSE 10 is live; others come later (cbse12, …). */
export default function ExamSelect({ onSelect }: { onSelect: (exam: string) => void }) {
  return (
    <div className="subject-select">
      <div className="page-content">
        <div className="doc-bar">
          <div className="kick">How it works · exam-prep</div>
          <a className="doc-link" href="/how-it-works.html" target="_blank" rel="noreferrer">📖 Documentation</a>
        </div>
        <h1>Learn it chapter by chapter. Then sit one clean exam.</h1>
        <p className="sub">
          Build the understanding from the ground up — one chapter, one concept at a time — then measure it with a real exam.
        </p>

        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <div className="grow">
              <h2>Pick your exam</h2>
              <p>Choose your board and class.</p>

              <button className="exam-card" onClick={() => onSelect('cbse10')}>
                <div className="exam-label">Board</div>
                <div className="exam-subject">CBSE Class 10</div>
                <div className="exam-note">Live now</div>
              </button>

              <button className="exam-card" onClick={() => onSelect('cbse12')}>
                <div className="exam-label">Board</div>
                <div className="exam-subject">CBSE Class 12</div>
                <div className="exam-note">Live now · Mathematics</div>
              </button>

              <button className="exam-card" onClick={() => onSelect('jee')}>
                <div className="exam-label">Entrance</div>
                <div className="exam-subject">JEE (Main &amp; Advanced)</div>
                <div className="exam-note">Live now · Mathematics</div>
              </button>
            </div>
          </div>
        </div>

        <div className="track">
          <h3>How this differs from the A.I tutor cheaper than the price of a tiffin</h3>
          <p>The tutor jumps <em>into</em> a hard question and digs down to the gap. This builds you up <em>before</em> the exam instead — so they stay two separate tools, each doing one job well.</p>
        </div>
      </div>
    </div>
  );
}
