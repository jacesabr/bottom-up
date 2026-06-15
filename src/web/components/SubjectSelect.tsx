import '../styles/SubjectSelect.css';

/** Step 2 — pick the subject within the chosen exam. Maths is live; Science comes later. */
export default function SubjectSelect({
  exam,
  onSelect,
  onBack,
}: {
  exam: string;
  onSelect: (subject: string) => void;
  onBack: () => void;
}) {
  const examLabel =
    exam === 'cbse10' ? 'CBSE Class 10' : exam === 'cbse12' ? 'CBSE Class 12' : exam === 'jee' ? 'JEE (Main & Advanced)' : exam;
  // The maths corpus is stored under different subject keys per exam.
  const mathsSubject = exam === 'cbse12' ? 'mathematics' : 'maths';

  return (
    <div className="subject-select">
      <div className="page-content">
        <button className="back-btn" onClick={onBack}>← Exam</button>

        <div className="steps" style={{ marginTop: 18 }}>
          <div className="step">
            <div className="num">2</div>
            <div className="grow">
              <h2>Pick your subject</h2>
              <p>{examLabel} — choose a subject to begin.</p>

              <button className="exam-card" onClick={() => onSelect(mathsSubject)}>
                <div className="exam-label">Subject</div>
                <div className="exam-subject">Mathematics</div>
              </button>

              <div className="exam-card disabled">
                <div className="exam-label">Subject</div>
                <div className="exam-subject muted">Science</div>
                <div className="exam-note">Coming soon</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
