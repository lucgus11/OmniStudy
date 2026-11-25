import { DAY, dayKey, startOfDay } from './date';
import { isDue, masteryScore } from './srs';
import type { Card, StudySession } from './types';

/** Jours consécutifs avec au moins une session (aujourd'hui OU hier compte encore). */
export function computeStreak(sessions: Pick<StudySession, 'startedAt'>[], now = Date.now()): number {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor -= DAY; // la journée n'est pas encore perdue
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    // midi pour éviter les erreurs de DST lors du retrait d'un jour
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    cursor = startOfDay(d.getTime());
  }
  return streak;
}

/** Activité des 7 derniers jours (le plus ancien en premier). */
export function last7Days(
  sessions: Pick<StudySession, 'startedAt' | 'reviewed'>[],
  now = Date.now(),
): { key: string; label: string; count: number; today: boolean }[] {
  const out: { key: string; label: string; count: number; today: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    const count = sessions
      .filter((s) => dayKey(s.startedAt) === key)
      .reduce((a, s) => a + Math.max(1, s.reviewed), 0);
    out.push({ key, label: d.toLocaleDateString('fr-FR', { weekday: 'narrow' }), count, today: i === 0 });
  }
  return out;
}

export function todayStats(sessions: StudySession[], now = Date.now()) {
  const key = dayKey(now);
  const today = sessions.filter((s) => dayKey(s.startedAt) === key);
  return {
    sessions: today.length,
    reviewed: today.reduce((a, s) => a + s.reviewed, 0),
    seconds: today.reduce((a, s) => a + s.durationSec, 0),
  };
}

export function subjectStats(cards: Card[], now = Date.now()) {
  const live = cards.filter((c) => !c.deleted);
  return {
    total: live.length,
    acquired: live.filter((c) => c.mastery === 2).length,
    weak: live.filter((c) => c.mastery < 2).length,
    due: live.filter((c) => isDue(c, now)).length,
    progress: masteryScore(live),
  };
}
