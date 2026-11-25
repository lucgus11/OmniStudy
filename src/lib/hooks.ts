import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db';
import type { Card, Course, StudySession, Subject } from './types';

/** Les hooks renvoient `undefined` pendant le premier chargement IndexedDB. */

export function useSubjects(): Subject[] | undefined {
  return useLiveQuery(async () => (await db.subjects.filter((s) => !s.deleted).toArray()).sort((a, b) => a.createdAt - b.createdAt), []);
}

export function useSubject(id?: string | null): Subject | undefined | null {
  // null = introuvable / supprimée
  return useLiveQuery(async () => {
    if (!id) return null;
    const s = await db.subjects.get(id);
    return s && !s.deleted ? s : null;
  }, [id]);
}

export function useCourses(subjectId?: string | null): Course[] | undefined {
  return useLiveQuery(async () => {
    const all = subjectId ? await db.courses.where('subjectId').equals(subjectId).toArray() : await db.courses.toArray();
    return all.filter((c) => !c.deleted).sort((a, b) => b.createdAt - a.createdAt);
  }, [subjectId]);
}

export function useCourse(id?: string | null): Course | undefined | null {
  return useLiveQuery(async () => {
    if (!id) return null;
    const c = await db.courses.get(id);
    return c && !c.deleted ? c : null;
  }, [id]);
}

export function useCards(filter?: { subjectId?: string | null; courseId?: string | null }): Card[] | undefined {
  return useLiveQuery(async () => {
    let all: Card[];
    if (filter?.courseId) all = await db.cards.where('courseId').equals(filter.courseId).toArray();
    else if (filter?.subjectId) all = await db.cards.where('subjectId').equals(filter.subjectId).toArray();
    else all = await db.cards.toArray();
    return all.filter((c) => !c.deleted);
  }, [filter?.subjectId, filter?.courseId]);
}

export function useSessions(): StudySession[] | undefined {
  return useLiveQuery(() => db.sessions.filter((s) => !s.deleted).toArray(), []);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Horloge qui force un re-rendu toutes les `ms` (compte à rebours, "il y a x min"). */
export function useTick(ms = 1000, active = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return n;
}
