/**
 * Synchronisation offline-first IndexedDB (Dexie) ⇄ Supabase.
 *
 *  PUSH : toutes les lignes `dirty = 1` sont upsertées (parents avant enfants).
 *  PULL : on récupère les lignes dont `updated_at` (horodatage SERVEUR) ≥ curseur.
 *  Conflits : last-write-wins sur `modified_at` (client) — tranché côté serveur
 *             par le trigger SQL, et côté client avant d'écraser une ligne "dirty".
 *  Suppressions : logiques (`deleted`) pour se propager aux autres appareils.
 */
import type { Table } from 'dexie';
import { countDirty, db } from './db';
import { createStore } from './store';
import { authStore, supabase } from './supabase';
import type { Card, Course, StudySession, Subject } from './types';

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
}

export const syncStore = createStore<SyncState>({
  status: supabase ? 'idle' : 'local',
  pending: 0,
  lastSyncAt: Number(localStorage.getItem('omni:lastSync')) || null,
  error: null,
});

// ── Mapping local ⇄ distant ─────────────────────────────────────────────────
const iso = (t: number | null | undefined) => (t == null ? null : new Date(t).toISOString());
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : null);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

interface Mapper<T> {
  batch: number;
  to(r: T): Row;
  from(r: Row): T;
}

const subjectsMap: Mapper<Subject> = {
  batch: 200,
  to: (s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    exam_date: iso(s.examDate),
    created_at: iso(s.createdAt),
    modified_at: iso(s.updatedAt),
    deleted: !!s.deleted,
  }),
  from: (r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    examDate: ms(r.exam_date),
    createdAt: ms(r.created_at) ?? Date.now(),
    updatedAt: ms(r.modified_at) ?? Date.now(),
    dirty: 0,
    deleted: r.deleted ? 1 : 0,
  }),
};

const coursesMap: Mapper<Course> = {
  batch: 8, // le champ "content" peut être volumineux
  to: (c) => ({
    id: c.id,
    subject_id: c.subjectId,
    title: c.title,
    source: c.source,
    content: c.content,
    summary: c.summary,
    keywords: c.keywords,
    audio_script: c.audioScript,
    ai_status: c.aiStatus === 'pending' ? 'none' : c.aiStatus,
    ai_generated_at: iso(c.aiGeneratedAt),
    created_at: iso(c.createdAt),
    modified_at: iso(c.updatedAt),
    deleted: !!c.deleted,
  }),
  from: (r) => ({
    id: r.id,
    subjectId: r.subject_id,
    title: r.title,
    source: r.source,
    content: r.content ?? '',
    summary: r.summary ?? '',
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    audioScript: r.audio_script ?? '',
    aiStatus: r.ai_status ?? 'none',
    aiGeneratedAt: ms(r.ai_generated_at),
    createdAt: ms(r.created_at) ?? Date.now(),
    updatedAt: ms(r.modified_at) ?? Date.now(),
    dirty: 0,
    deleted: r.deleted ? 1 : 0,
  }),
};

const cardsMap: Mapper<Card> = {
  batch: 150,
  to: (c) => ({
    id: c.id,
    course_id: c.courseId,
    subject_id: c.subjectId,
    type: c.type,
    question: c.question,
    options: c.options,
    pairs: c.pairs,
    answer: c.answer,
    explanation: c.explanation,
    critical: c.critical,
    origin: c.origin,
    ease: c.ease,
    interval_days: c.intervalDays,
    due_at: iso(c.dueAt),
    reps: c.reps,
    lapses: c.lapses,
    mastery: c.mastery,
    last_reviewed_at: iso(c.lastReviewedAt),
    created_at: iso(c.createdAt),
    modified_at: iso(c.updatedAt),
    deleted: !!c.deleted,
  }),
  from: (r) => ({
    id: r.id,
    courseId: r.course_id,
    subjectId: r.subject_id,
    type: r.type,
    question: r.question,
    options: Array.isArray(r.options) ? r.options : [],
    pairs: Array.isArray(r.pairs) ? r.pairs : [],
    answer: r.answer ?? '',
    explanation: r.explanation ?? '',
    critical: !!r.critical,
    origin: r.origin ?? 'ai',
    ease: Number(r.ease) || 2.5,
    intervalDays: Number(r.interval_days) || 0,
    dueAt: ms(r.due_at) ?? Date.now(),
    reps: r.reps ?? 0,
    lapses: r.lapses ?? 0,
    mastery: (r.mastery ?? 0) as 0 | 1 | 2,
    lastReviewedAt: ms(r.last_reviewed_at),
    createdAt: ms(r.created_at) ?? Date.now(),
    updatedAt: ms(r.modified_at) ?? Date.now(),
    dirty: 0,
    deleted: r.deleted ? 1 : 0,
  }),
};

const sessionsMap: Mapper<StudySession> = {
  batch: 200,
  to: (s) => ({
    id: s.id,
    subject_id: s.subjectId,
    mode: s.mode,
    pace: s.pace,
    duration_sec: s.durationSec,
    reviewed: s.reviewed,
    correct: s.correct,
    started_at: iso(s.startedAt),
    modified_at: iso(s.updatedAt),
    deleted: !!s.deleted,
  }),
  from: (r) => ({
    id: r.id,
    subjectId: r.subject_id ?? null,
    mode: r.mode,
    pace: r.pace ?? 'free',
    durationSec: r.duration_sec ?? 0,
    reviewed: r.reviewed ?? 0,
    correct: r.correct ?? 0,
    startedAt: ms(r.started_at) ?? Date.now(),
    updatedAt: ms(r.modified_at) ?? Date.now(),
    dirty: 0,
    deleted: r.deleted ? 1 : 0,
  }),
};

type TableName = 'subjects' | 'courses' | 'cards' | 'sessions';
/** L'ordre compte : parents avant enfants (clés étrangères Postgres). */
const ORDER: TableName[] = ['subjects', 'courses', 'cards', 'sessions'];
const MAPS: Record<TableName, Mapper<any>> = {
  subjects: subjectsMap,
  courses: coursesMap,
  cards: cardsMap,
  sessions: sessionsMap,
};
const PAGE = 1000;

const localTable = (name: TableName) => db[name] as unknown as Table<any, string>;

// ── PUSH ────────────────────────────────────────────────────────────────────
async function pushTable(name: TableName): Promise<void> {
  if (!supabase) return;
  const table = localTable(name);
  const map = MAPS[name];
  const dirty = await table.where('dirty').equals(1).toArray();
  for (let i = 0; i < dirty.length; i += map.batch) {
    const slice = dirty.slice(i, i + map.batch);
    const { error } = await supabase.from(name).upsert(slice.map(map.to), { onConflict: 'id' });
    if (error) throw new Error(`${name}: ${error.message}`);
    // On ne "nettoie" que les lignes non modifiées pendant l'envoi.
    await db.transaction('rw', table, async () => {
      const current = await table.bulkGet(slice.map((r) => r.id));
      const unchanged = slice.filter((r, idx) => current[idx] && current[idx].updatedAt === r.updatedAt);
      await Promise.all(unchanged.map((r) => table.update(r.id, { dirty: 0 })));
    });
  }
}

// ── PULL ────────────────────────────────────────────────────────────────────
async function pullTable(name: TableName, userId: string): Promise<void> {
  if (!supabase) return;
  const table = localTable(name);
  const map = MAPS[name];
  const key = `cursor:${userId}:${name}`;
  let cursor = ((await db.meta.get(key))?.value as string | undefined) ?? '1970-01-01T00:00:00Z';

  for (;;) {
    const { data, error } = await supabase
      .from(name)
      .select('*')
      .gte('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(`${name}: ${error.message}`);
    if (!data?.length) break;

    const rows = data.map(map.from);
    await db.transaction('rw', table, async () => {
      const existing = await table.bulkGet(rows.map((r) => r.id));
      // Une modification locale en attente et plus récente l'emporte (elle sera poussée).
      const toPut = rows.filter((r, i) => {
        const e = existing[i];
        if (!e) return true;
        // Une modification locale en attente, plus récente, l'emporte.
        if (e.dirty && e.updatedAt > r.updatedAt) return false;
        // Ligne déjà à jour : ne pas la réécrire (évite de relancer les requêtes live de l'UI).
        if (!e.dirty && e.updatedAt === r.updatedAt) return false;
        return true;
      });
      if (toPut.length) await table.bulkPut(toPut);
    });

    const last = data[data.length - 1].updated_at as string;
    const advanced = last !== cursor;
    cursor = last;
    await db.meta.put({ key, value: cursor });
    if (data.length < PAGE || !advanced) break;
  }
}

// ── Orchestration ───────────────────────────────────────────────────────────
let running: Promise<void> | null = null;
let queued = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export async function refreshPending(): Promise<void> {
  syncStore.set({ pending: await countDirty() });
}

async function runOnce(): Promise<void> {
  const { userId } = authStore.get();
  if (!supabase || !userId) {
    syncStore.set({ status: 'local', error: null });
    await refreshPending();
    return;
  }
  if (!navigator.onLine) {
    syncStore.set({ status: 'offline' });
    await refreshPending();
    return;
  }
  syncStore.set({ status: 'syncing', error: null });
  try {
    for (const t of ORDER) await pushTable(t);
    for (const t of ORDER) await pullTable(t, userId);
    const now = Date.now();
    localStorage.setItem('omni:lastSync', String(now));
    syncStore.set({ status: 'idle', lastSyncAt: now, error: null });
  } catch (e) {
    syncStore.set({
      status: navigator.onLine ? 'error' : 'offline',
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    await refreshPending();
  }
}

/** Lance une synchro maintenant (les appels concurrents sont fusionnés). */
export function syncNow(): Promise<void> {
  if (running) {
    queued = true;
    return running;
  }
  running = (async () => {
    do {
      queued = false;
      await runOnce();
    } while (queued);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Planifie une synchro (debounce) — appelée après chaque écriture locale. */
export function requestSync(delay = 1500): void {
  void refreshPending();
  if (!supabase || !authStore.get().userId) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

let started = false;
/** À appeler une fois au démarrage : écoute réseau, visibilité, minuterie. */
export function startSyncLoop(): void {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => {
    syncStore.set({ status: supabase && authStore.get().userId ? 'offline' : 'local' });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  authStore.subscribe(() => void syncNow());
  void syncNow();
}
