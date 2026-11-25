import Dexie, { type Table } from 'dexie';
import type { Card, Course, StudySession, Subject } from './types';

/**
 * Base locale IndexedDB (Dexie) — source de vérité de l'app.
 * Toute l'interface lit/écrit ici → réponse instantanée, 100 % hors-ligne.
 * La synchro avec Supabase (src/lib/sync.ts) se fait en arrière-plan.
 */
export class OmniDB extends Dexie {
  subjects!: Table<Subject, string>;
  courses!: Table<Course, string>;
  cards!: Table<Card, string>;
  sessions!: Table<StudySession, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('omnistudy');
    this.version(1).stores({
      subjects: 'id, dirty, deleted, updatedAt',
      courses: 'id, subjectId, dirty, deleted, updatedAt',
      cards: 'id, courseId, subjectId, dueAt, mastery, dirty, deleted, updatedAt',
      sessions: 'id, subjectId, startedAt, dirty, deleted, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new OmniDB();

/** UUID v4 (repli pour les contextes non sécurisés où crypto.randomUUID est absent). */
export function uid(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10).join('')}`;
}

export async function countDirty(): Promise<number> {
  const counts = await Promise.all([
    db.subjects.where('dirty').equals(1).count(),
    db.courses.where('dirty').equals(1).count(),
    db.cards.where('dirty').equals(1).count(),
    db.sessions.where('dirty').equals(1).count(),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
}
