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
// "Learn from Scratch" persona by class band (the chapter segment of the conceptId). Teaching a
// 5-year-old and a high-schooler from one corpus needs the right voice/level per class.
const SCRATCH_BANDS: Record<string, { level: string; audience: string; label: string }> = {
  k: { level: 'Kindergarten', audience: 'a 5–6-year-old just starting school', label: 'Kindergarten learner' },
  g1: { level: 'Grade 1', audience: 'a 6–7-year-old in Grade 1', label: 'Grade 1 learner' },
  g2: { level: 'Grade 2', audience: 'a 7–8-year-old in Grade 2', label: 'Grade 2 learner' },
  g3: { level: 'Grade 3', audience: 'an 8–9-year-old in Grade 3', label: 'Grade 3 learner' },
  g4: { level: 'Grade 4', audience: 'a 9–10-year-old in Grade 4', label: 'Grade 4 learner' },
  g5: { level: 'Grade 5', audience: 'a 10–11-year-old in Grade 5', label: 'Grade 5 learner' },
  g6: { level: 'Grade 6', audience: 'an 11–12-year-old in Grade 6', label: 'Grade 6 learner' },
  g7: { level: 'Grade 7', audience: 'a 12–13-year-old in Grade 7', label: 'Grade 7 learner' },
  g8: { level: 'Grade 8', audience: 'a 13–14-year-old in Grade 8', label: 'Grade 8 learner' },
};
function scratchBand(chapterSeg: string): { level: string; audience: string; label: string } {
  if (SCRATCH_BANDS[chapterSeg]) return SCRATCH_BANDS[chapterSeg];
  if (chapterSeg.startsWith('hs-')) return { level: 'High School', audience: 'a 15–18-year-old high-school student', label: 'high-school student' };
  return { level: 'school maths', audience: 'a school student', label: 'student' };
}

export function examProfile(conceptId: string, track: Track = 'foundation'): ExamProfile {
  const [examId = 'cbse10', subjectSeg = 'maths', chapterSeg = ''] = conceptId.split(':');
  const subject = subjectWord(subjectSeg);
  if (examId === 'scratch') {
    const b = scratchBand(chapterSeg);
    return { examId, subject, level: b.level, teacherAudience: b.audience, studentLabel: b.label };
  }
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
