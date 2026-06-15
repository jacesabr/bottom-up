/**
 * Exam-aware persona/level used in EVERY AI instruction (teaching + grading + hints).
 * Derived from a conceptId's segments: `exam:subject:chapter:slug`.
 *
 * Why: prompts used to hardcode "CBSE Class 10", so a JEE or CBSE-12 learner was taught and
 * graded by a tutor that called itself a Class-10 teacher. This makes the model know which exam
 * (and, later, which advanced track) it is in. CBSE-10 wording is preserved EXACTLY so the
 * already-validated Class-10 teaching does not regress.
 *
 * Covers every loaded maths exam: cbse10, cbse12, jee. (NEET is science-only — no maths — so it is
 * intentionally absent here; it would only matter once a Physics/Chemistry/Biology corpus is loaded.)
 */
export type Track = 'foundation' | 'advanced';

export interface ExamProfile {
  examId: string;
  subject: string; // prompt word: 'maths' | 'physics' | ...
  level: string; // e.g. 'CBSE Class 10', 'JEE Main', 'JEE Advanced'
  teacherAudience: string; // teachTurn: "...sitting beside <X>, chatting."
  studentLabel: string; // graders: "grading a <X>'s hand-drawn answer"
}

function subjectWord(seg: string): string {
  if (seg === 'mathematics' || seg === 'maths') return 'maths';
  return seg || 'maths';
}

/**
 * Build the persona for a conceptId, optionally specialised to a track. The only exam with an
 * advanced track today is JEE (JEE Main = foundation, JEE Advanced = advanced); other exams ignore
 * the track. CBSE-10 wording is preserved EXACTLY.
 */
export function examProfile(conceptId: string, track: Track = 'foundation'): ExamProfile {
  const [examId = 'cbse10', subjectSeg = 'maths'] = conceptId.split(':');
  const subject = subjectWord(subjectSeg);
  switch (examId) {
    case 'cbse12':
      return {
        examId,
        subject,
        level: 'CBSE Class 12',
        teacherAudience: 'a 17–18-year-old CBSE Class 12 student',
        studentLabel: 'CBSE Class 12 student',
      };
    case 'jee': {
      const advanced = track === 'advanced';
      return {
        examId,
        subject,
        level: advanced ? 'JEE Advanced' : 'JEE Main',
        teacherAudience: advanced
          ? 'a JEE Advanced aspirant (Class 11–12, exam-grade rigour)'
          : 'a JEE Main aspirant studying at Class 11–12 level',
        studentLabel: advanced ? 'JEE Advanced aspirant' : 'JEE Main aspirant',
      };
    }
    case 'cbse10':
    default:
      // EXACT original wording — do not change (validated Class-10 teaching).
      return {
        examId: 'cbse10',
        subject,
        level: 'CBSE Class 10',
        teacherAudience: 'a 15-year-old CBSE Class 10 student',
        studentLabel: 'CBSE Class 10 student',
      };
  }
}
