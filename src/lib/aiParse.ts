/**
 * Fonctions pures du service IA : découpage du cours en parties, validation /
 * normalisation du JSON renvoyé par le modèle, fusion des packs de plusieurs parties.
 */
import type { Keyword, MatchPair, NewCard, StudyPack } from './types';
import { normalizeAnswer, shuffle } from './text';

export const CHUNK_SIZE = 12_000;
export const MAX_PARTS = 10;
export const MAX_CARDS = 250;

// ── Découpage ───────────────────────────────────────────────────────────────
/** Découpe un long texte en parties ≤ size, en respectant paragraphes puis phrases. */
export function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];

  const pieces: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length <= size) {
      pieces.push(para);
      continue;
    }
    // paragraphe géant (PDF sans sauts de ligne) → par phrases, puis coupe dure
    let cur = '';
    for (const sentence of para.split(/(?<=[.!?…])\s+/)) {
      if ((cur + ' ' + sentence).length > size && cur) {
        pieces.push(cur);
        cur = '';
      }
      if (sentence.length > size) {
        for (let i = 0; i < sentence.length; i += size) pieces.push(sentence.slice(i, i + size));
      } else {
        cur = cur ? `${cur} ${sentence}` : sentence;
      }
    }
    if (cur) pieces.push(cur);
  }

  const chunks: string[] = [];
  let buf = '';
  for (const p of pieces) {
    if (buf && buf.length + p.length + 2 > size) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);

  // fusionne une dernière partie minuscule avec la précédente
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 400) {
    const last = chunks.pop() as string;
    chunks[chunks.length - 1] += `\n\n${last}`;
  }
  return chunks;
}

// ── Validation du JSON de l'IA ──────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'vrai', 'yes', 'oui'].includes(s)) return true;
    if (['false', 'faux', 'no', 'non'].includes(s)) return false;
  }
  return null;
}

function normalizeCard(q: any): NewCard | null {
  if (!q || typeof q !== 'object') return null;
  const question = str(q.question, 500);
  if (!question) return null;
  const explanation = str(q.explanation, 400);
  const critical = toBool(q.critical) === true;

  switch (q.type) {
    case 'qcm': {
      const raw: unknown[] = Array.isArray(q.options) ? q.options : [];
      const options = [...new Set(raw.map((o) => str(o, 300)).filter(Boolean))];
      if (options.length < 3) return null;
      let idx = Number(q.answer_index ?? q.answerIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= raw.length) {
        // l'IA a peut-être donné le texte de la bonne réponse
        const byText = options.findIndex((o) => normalizeAnswer(o) === normalizeAnswer(str(q.answer, 300)));
        if (byText === -1) return null;
        idx = byText;
      }
      const correct = str(raw[idx], 300) || options[idx];
      if (!correct || !options.includes(correct)) return null;
      return { type: 'qcm', question, options: shuffle(options), answer: correct, explanation, critical };
    }
    case 'tf': {
      const v = toBool(q.answer);
      if (v === null) return null;
      return { type: 'tf', question, answer: v ? 'Vrai' : 'Faux', explanation, critical };
    }
    case 'open': {
      const answer = str(q.answer, 500);
      if (!answer) return null;
      return { type: 'open', question, answer, explanation, critical };
    }
    case 'match': {
      const raw: unknown[] = Array.isArray(q.pairs) ? q.pairs : [];
      const seen = new Set<string>();
      const pairs: MatchPair[] = [];
      for (const p of raw as any[]) {
        const left = str(p?.left, 120);
        const right = str(p?.right, 240);
        const k = normalizeAnswer(left);
        if (left && right && !seen.has(k)) {
          seen.add(k);
          pairs.push({ left, right });
        }
      }
      if (pairs.length < 3) return null;
      return { type: 'match', question, pairs: pairs.slice(0, 6), answer: '', explanation, critical };
    }
    default:
      return null;
  }
}

/** Valide et nettoie la réponse brute du modèle (jamais de crash sur un JSON imparfait). */
export function normalizePack(raw: unknown): StudyPack {
  const o: any = raw && typeof raw === 'object' ? raw : {};
  const keywords: Keyword[] = (Array.isArray(o.keywords) ? o.keywords : [])
    .map((k: any) => ({ term: str(k?.term, 120), definition: str(k?.definition, 400) }))
    .filter((k: Keyword) => k.term && k.definition)
    .slice(0, 25);
  const cards: NewCard[] = (Array.isArray(o.quiz) ? o.quiz : [])
    .map(normalizeCard)
    .filter((c: NewCard | null): c is NewCard => c !== null);
  return {
    summary: str(o.summary, 30_000),
    keywords,
    audioScript: str(o.audio_script ?? o.audioScript, 15_000),
    cards,
  };
}

/** Fusionne les packs de plusieurs parties (dédoublonnage des termes et des questions). */
export function mergePacks(packs: StudyPack[]): StudyPack {
  const kwSeen = new Set<string>();
  const qSeen = new Set<string>();
  const keywords: Keyword[] = [];
  const cards: NewCard[] = [];
  for (const p of packs) {
    for (const k of p.keywords) {
      const key = normalizeAnswer(k.term);
      if (!kwSeen.has(key)) {
        kwSeen.add(key);
        keywords.push(k);
      }
    }
    for (const c of p.cards) {
      const key = normalizeAnswer(c.question);
      if (!qSeen.has(key)) {
        qSeen.add(key);
        cards.push(c);
      }
    }
  }
  return {
    summary: packs.map((p) => p.summary).filter(Boolean).join('\n\n'),
    keywords: keywords.slice(0, 60),
    audioScript: packs.map((p) => p.audioScript).filter(Boolean).join('\n\n'),
    cards: cards.slice(0, MAX_CARDS),
  };
}
