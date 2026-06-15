import '../styles/SubjectSelect.css';

interface SubjectSelectProps {
  onSelect: (exam: string, subject: string) => void;
}

export default function SubjectSelect({ onSelect }: SubjectSelectProps) {
  return (
    <div className="subject-select">
      <div className="kick">How it works · exam-prep</div>
      <h1>Learn it chapter by chapter. Then sit one clean exam.</h1>
      <p className="sub">
        A simpler path through CBSE 10 Maths: build the understanding from the ground up — one chapter, one concept at a time — then measure it with a real exam.
      </p>

      <div className="exams">
        <button
          className="exam-card"
          onClick={() => onSelect('cbse10', 'maths')}
        >
          <div className="exam-label">CBSE Class 10</div>
          <div className="exam-subject">Mathematics</div>
          <div className="exam-note">3-node prototype</div>
        </button>
      </div>

      <div className="info">
        <p>
          <strong>How this differs from the Socratic tutor.</strong> The tutor jumps <em>into</em> a hard question and digs down to the gap. This builds you up <em>before</em> the exam instead — so they stay two separate tools, each doing one job well.
        </p>
      </div>
    </div>
  );
}
