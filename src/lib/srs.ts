/**
 * Répétition espacée (SRS) — variante simplifiée de SM-2 à 3 notes.
 *   0 = À revoir  → revient dans la session + dans 10 min
 *   1 = Moyen     → intervalle ×1,2 (min. 1 jour)
 *   2 = Acquis    → 1 j → 3 j → intervalle × facilité
 * Les révisions sont plafonnées à la veille de l'examen de la matière.
 */
import { DAY, HOUR, MIN } from './date';
import type { Card, Grade, Mastery, Pace } from './types';
import { shuffle } from './text';

export interface SrsState {
  ease: number;
  intervalDays: number;
  dueAt: number;
  reps: number;
  lapses: number;
  mastery: Mastery;
  lastReviewedAt: number | null;
}

export const MAX_INTERVAL = 365;

export function initialSrs(now = Date.now()): SrsState {
  return { ease: 2.5, intervalDays: 0, dueAt: now, reps: 0, lapses: 0, mastery: 0, lastReviewedAt: null };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ne jamais planifier une révision après la veille de l'examen. */
export function capByExam(dueAt: number, examDate: number | null | undefined, now: number): number {
  if (!examDate || examDate <= now) return dueAt;
  const latest = Math.max(examDate - DAY, now + 4 * HOUR);
  return Math.min(dueAt, latest);
}

export function review(
  s: Pick<SrsState, 'ease' | 'intervalDays' | 'reps' | 'lapses'>,
  grade: Grade,
  now = Date.now(),
  examDate?: number | null,
): SrsState {
  let { ease, intervalDays, reps, lapses } = s;
  let mastery: Mastery;
  let dueAt: number;

  if (grade === 0) {
    lapses += 1;
    reps = 0;
    intervalDays = 0;
    ease = clamp(ease - 0.2, 1.3, 3);
    mastery = 0;
    dueAt = now + 10 * MIN;
  } else if (grade === 1) {
    intervalDays = reps === 0 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    reps += 1;
    ease = clamp(ease - 0.05, 1.3, 3);
    mastery = 1;
    dueAt = now + intervalDays * DAY;
  } else {
    intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(intervalDays * ease);
    reps += 1;
    ease = clamp(ease + 0.05, 1.3, 3);
    mastery = 2;
    dueAt = now + intervalDays * DAY;
  }
  intervalDays = Math.min(intervalDays, MAX_INTERVAL);
  dueAt = capByExam(dueAt, examDate, now);
  return { ease, intervalDays, dueAt, reps, lapses, mastery, lastReviewedAt: now };
}

// ── Aides de sélection ──────────────────────────────────────────────────────
export const isNew = (c: Card) => c.reps === 0 && c.lastReviewedAt == null;
export const isDue = (c: Card, now = Date.now()) => c.dueAt <= now;
export const isWeak = (c: Card) => c.mastery < 2;

/** Nombre de cartes visées et durée selon le rythme choisi. */
export const PACE_CONFIG: Record<Pace, { label: string; hint: string; maxCards: number; seconds: number | null }> = {
  express: { label: 'Express', hint: '2 min', maxCards: 8, seconds: 120 },
  focus: { label: 'Focus', hint: '10 min', maxCards: 40, seconds: 600 },
  free: { label: 'Session libre', hint: 'sans limite', maxCards: 120, seconds: null },
  urgent: { label: 'Urgence J-1', hint: 'points faibles & critiques', maxCards: 80, seconds: null },
};

export function buildQueue(
  cards: Card[],
  opts: { pace: Pace; subjectId?: string | null; courseId?: string | null; now?: number },
): Card[] {
  const now = opts.now ?? Date.now();
  let pool = cards.filter(
    (c) =>
      !c.deleted &&
      (!opts.subjectId || c.subjectId === opts.subjectId) &&
      (!opts.courseId || c.courseId === opts.courseId),
  );
  const max = PACE_CONFIG[opts.pace].maxCards;

  if (opts.pace === 'urgent') {
    // uniquement les notions mal maîtrisées + les points critiques
    pool = pool.filter((c) => isWeak(c) || c.critical);
    return pool
      .sort((a, b) => {
        const wa = (a.critical && isWeak(a) ? 0 : 1) - (b.critical && isWeak(b) ? 0 : 1);
        if (wa) return wa;
        if (a.mastery !== b.mastery) return a.mastery - b.mastery;
        return a.dueAt - b.dueAt;
      })
      .slice(0, max);
  }

  const due = pool.filter((c) => !isNew(c) && isDue(c, now)).sort((a, b) => a.dueAt - b.dueAt);
  const fresh = shuffle(pool.filter(isNew));
  const queue = [...due, ...fresh];
  if (opts.pace === 'free' && queue.length < max) {
    // plus rien d'échu : on peut réviser en avance, les plus proches d'abord
    const ahead = pool.filter((c) => !isNew(c) && !isDue(c, now)).sort((a, b) => a.dueAt - b.dueAt);
    queue.push(...ahead);
  }
  return queue.slice(0, max);
}

/** Progression pondérée d'un ensemble de cartes (0..1). */
export function masteryScore(cards: Card[]): number {
  const live = cards.filter((c) => !c.deleted);
  if (!live.length) return 0;
  const sum = live.reduce((acc, c) => acc + (c.mastery === 2 ? 1 : c.mastery === 1 ? 0.5 : 0), 0);
  return sum / live.length;
}
