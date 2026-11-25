/**
 * Couche d'écriture : toutes les mutations passent ici.
 * Chaque écriture marque la ligne `dirty` (à synchroniser) et déclenche requestSync().
 */
import { db, uid } from './db';
import { initialSrs, review } from './srs';
import { requestSync } from './sync';
import type {
  AiStatus,
  Card,
  Course,
  Grade,
  NewCard,
  Pace,
  SessionMode,
  Source,
  StudyPack,
  StudySession,
  Subject,
} from './types';
import { normalizeAnswer } from './text';

export const SUBJECT_COLORS = ['#5e6ad2', '#2f9e8f', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#dc2626'];

const stamp = () => ({ updatedAt: Date.now(), dirty: 1 as const });

// ── Matières ────────────────────────────────────────────────────────────────
export async function createSubject(input: { name: string; color?: string; examDate?: number | null }): Promise<string> {
  const id = uid();
  const t = Date.now();
  const count = await db.subjects.count();
  await db.subjects.add({
    id,
    name: input.name.trim(),
    color: input.color ?? SUBJECT_COLORS[count % SUBJECT_COLORS.length],
    examDate: input.examDate ?? null,
    createdAt: t,
    updatedAt: t,
    dirty: 1,
    deleted: 0,
  });
  requestSync();
  return id;
}

export async function updateSubject(
  id: string,
  patch: Partial<Pick<Subject, 'name' | 'color' | 'examDate'>>,
): Promise<void> {
  await db.subjects.update(id, { ...patch, ...stamp() });
  requestSync();
}

export async function deleteSubject(id: string): Promise<void> {
  await db.transaction('rw', db.subjects, db.courses, db.cards, async () => {
    const mark = { deleted: 1 as const, ...stamp() };
    await db.subjects.update(id, mark);
    await db.courses.where('subjectId').equals(id).modify(mark);
    await db.cards.where('subjectId').equals(id).modify(mark);
  });
  requestSync();
}

// ── Cours ───────────────────────────────────────────────────────────────────
export async function createCourse(input: {
  subjectId: string;
  title: string;
  content: string;
  source: Source;
}): Promise<string> {
  const id = uid();
  const t = Date.now();
  await db.courses.add({
    id,
    subjectId: input.subjectId,
    title: input.title.trim() || 'Sans titre',
    source: input.source,
    content: input.content,
    summary: '',
    keywords: [],
    audioScript: '',
    aiStatus: 'none',
    aiGeneratedAt: null,
    createdAt: t,
    updatedAt: t,
    dirty: 1,
    deleted: 0,
  });
  requestSync();
  return id;
}

export async function updateCourse(
  id: string,
  patch: Partial<Pick<Course, 'title' | 'content' | 'summary' | 'audioScript' | 'aiStatus' | 'subjectId'>>,
): Promise<void> {
  await db.courses.update(id, { ...patch, ...stamp() });
  requestSync();
}

export async function setAiStatus(id: string, aiStatus: AiStatus): Promise<void> {
  await db.courses.update(id, { aiStatus, ...stamp() });
  requestSync();
}

export async function deleteCourse(id: string): Promise<void> {
  await db.transaction('rw', db.courses, db.cards, async () => {
    const mark = { deleted: 1 as const, ...stamp() };
    await db.courses.update(id, mark);
    await db.cards.where('courseId').equals(id).modify(mark);
  });
  requestSync();
}

// ── Cartes ──────────────────────────────────────────────────────────────────
function toCard(courseId: string, subjectId: string, n: NewCard, t: number): Card {
  return {
    id: uid(),
    courseId,
    subjectId,
    type: n.type,
    question: n.question,
    options: n.options ?? [],
    pairs: n.pairs ?? [],
    answer: n.answer,
    explanation: n.explanation,
    critical: n.critical,
    origin: 'ai',
    ...initialSrs(t),
    createdAt: t,
    updatedAt: t,
    dirty: 1,
    deleted: 0,
  };
}

/**
 * Applique un pack généré par l'IA à un cours.
 * Les questions déjà connues (même énoncé) conservent leur progression SRS ;
 * les anciennes questions IA disparues sont supprimées.
 */
export async function applyStudyPack(courseId: string, pack: StudyPack): Promise<{ added: number; kept: number }> {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('Cours introuvable');
  const t = Date.now();
  let added = 0;
  let kept = 0;

  await db.transaction('rw', db.courses, db.cards, async () => {
    await db.courses.update(courseId, {
      summary: pack.summary || course.summary,
      keywords: pack.keywords.length ? pack.keywords : course.keywords,
      audioScript: pack.audioScript || course.audioScript,
      aiStatus: 'done',
      aiGeneratedAt: t,
      updatedAt: t,
      dirty: 1,
    });

    const existing = (await db.cards.where('courseId').equals(courseId).toArray()).filter(
      (c) => !c.deleted && c.origin === 'ai',
    );
    const byQuestion = new Map(existing.map((c) => [normalizeAnswer(c.question), c]));
    const matched = new Set<string>();
    const toAdd: Card[] = [];

    for (const n of pack.cards) {
      const old = byQuestion.get(normalizeAnswer(n.question));
      if (old && !matched.has(old.id)) {
        matched.add(old.id);
        kept += 1;
        await db.cards.update(old.id, {
          type: n.type,
          options: n.options ?? [],
          pairs: n.pairs ?? [],
          answer: n.answer,
          explanation: n.explanation,
          critical: n.critical,
          updatedAt: t,
          dirty: 1,
        });
      } else {
        toAdd.push(toCard(courseId, course.subjectId, n, t));
      }
    }
    added = toAdd.length;
    if (toAdd.length) await db.cards.bulkAdd(toAdd);

    const stale = existing.filter((c) => !matched.has(c.id)).map((c) => c.id);
    for (const id of stale) await db.cards.update(id, { deleted: 1, updatedAt: t, dirty: 1 });
  });
  requestSync();
  return { added, kept };
}

/** Note une carte (À revoir / Moyen / Acquis) et planifie la prochaine révision. */
export async function gradeCard(cardId: string, grade: Grade): Promise<Card | undefined> {
  const card = await db.cards.get(cardId);
  if (!card) return undefined;
  const subject = await db.subjects.get(card.subjectId);
  const next = review(card, grade, Date.now(), subject?.examDate);
  await db.cards.update(cardId, { ...next, ...stamp() });
  requestSync(4000);
  return { ...card, ...next };
}

export async function deleteCard(id: string): Promise<void> {
  await db.cards.update(id, { deleted: 1, ...stamp() });
  requestSync();
}

// ── Sessions ────────────────────────────────────────────────────────────────
export async function recordSession(input: {
  subjectId: string | null;
  mode: SessionMode;
  pace: Pace;
  durationSec: number;
  reviewed: number;
  correct: number;
  startedAt: number;
}): Promise<void> {
  const row: StudySession = { id: uid(), ...input, updatedAt: Date.now(), dirty: 1, deleted: 0 };
  await db.sessions.add(row);
  requestSync(4000);
}

// ── Export ──────────────────────────────────────────────────────────────────
export async function exportAll() {
  const [subjects, courses, cards, sessions] = await Promise.all([
    db.subjects.filter((r) => !r.deleted).toArray(),
    db.courses.filter((r) => !r.deleted).toArray(),
    db.cards.filter((r) => !r.deleted).toArray(),
    db.sessions.filter((r) => !r.deleted).toArray(),
  ]);
  return { app: 'omnistudy', version: 1, exportedAt: new Date().toISOString(), subjects, courses, cards, sessions };
}
