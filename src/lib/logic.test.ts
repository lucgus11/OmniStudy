import { describe, expect, it } from 'vitest';
import { chunkText, normalizePack, mergePacks } from './aiParse';
import { review, buildQueue, initialSrs } from './srs';
import { DAY } from './date';
import { isCloseEnough, parseMarkdown, wrapKeywords, stripMarkers, mdToSpeech } from './text';
import { splitForSpeech } from './speech';
import { computeStreak, last7Days, todayStats } from './stats';
import type { Card } from './types';

const mk = (o: Partial<Card>): Card => ({
  id: Math.random().toString(), courseId: 'c', subjectId: 's', type: 'open', question: 'q', options: [], pairs: [],
  answer: 'a', explanation: '', critical: false, origin: 'ai', ...initialSrs(0), createdAt: 0, updatedAt: 0, dirty: 0, deleted: 0, ...o,
});

describe('SRS', () => {
  it('acquis : 1 j puis 3 j puis x ease', () => {
    const now = 1_000_000;
    const a = review(initialSrs(now), 2, now);
    expect(a.intervalDays).toBe(1);
    const b = review(a, 2, now);
    expect(b.intervalDays).toBe(3);
    expect(review(b, 2, now).intervalDays).toBeGreaterThanOrEqual(7);
  });
  it('à revoir : revient dans 10 min, lapse++', () => {
    const r = review({ ease: 2.5, intervalDays: 10, reps: 4, lapses: 0 }, 0, 0);
    expect(r.dueAt).toBe(10 * 60_000);
    expect(r.lapses).toBe(1);
    expect(r.mastery).toBe(0);
  });
  it('plafonné à la veille de l’examen', () => {
    const now = 0;
    const r = review({ ease: 2.5, intervalDays: 30, reps: 5, lapses: 0 }, 2, now, 3 * DAY);
    expect(r.dueAt).toBeLessThanOrEqual(2 * DAY);
  });
  it('urgence : uniquement faibles ou critiques', () => {
    const cards = [mk({ mastery: 2 }), mk({ mastery: 0 }), mk({ mastery: 2, critical: true }), mk({ mastery: 1 })];
    expect(buildQueue(cards, { pace: 'urgent' })).toHaveLength(3);
    expect(buildQueue(cards.slice(0, 1), { pace: 'urgent' })).toHaveLength(0);
  });
});

describe('files de révision', () => {
  const reviewed = (o: Partial<Card> = {}) =>
    mk({ reps: 3, lastReviewedAt: 1, mastery: 2, dueAt: 5 * DAY, ...o });
  it('express : repli en révision anticipée quand plus rien n’est échu', () => {
    const cards = [reviewed(), reviewed(), reviewed()];
    expect(buildQueue(cards, { pace: 'express', now: 0 })).toHaveLength(3);
  });
  it('anticipation : notions fragiles d’abord', () => {
    const strong = reviewed({ id: 'strong', mastery: 2, dueAt: 2 * DAY });
    const weak = reviewed({ id: 'weak', mastery: 1, dueAt: 9 * DAY });
    expect(buildQueue([strong, weak], { pace: 'express', now: 0 })[0].id).toBe('weak');
  });
  it('urgence : vide si tout est acquis, sauf avec force', () => {
    const cards = [reviewed(), reviewed()];
    expect(buildQueue(cards, { pace: 'urgent', now: 0 })).toHaveLength(0);
    expect(buildQueue(cards, { pace: 'urgent', now: 0, force: true })).toHaveLength(2);
  });
});

describe('stats du jour', () => {
  const now = new Date(2026, 10, 26, 12).getTime();
  const sess = (mode: 'cards' | 'voice' | 'blur' | 'podcast', reviewed: number, durationSec: number) =>
    ({ id: mode, subjectId: null, mode, pace: 'free' as const, durationSec, reviewed, correct: 0, startedAt: now, updatedAt: now, dirty: 0 as const, deleted: 0 as const });
  it('ne compte comme cartes que les modes cartes et interro vocale', () => {
    const t = todayStats([sess('cards', 10, 120), sess('voice', 4, 60), sess('blur', 30, 90), sess('podcast', 5, 300)], now);
    expect(t.cards).toBe(14);
    expect(t.seconds).toBe(570);
  });
  it('graphique en secondes d’étude', () => {
    const w = last7Days([sess('podcast', 5, 300)], now);
    expect(w[6].seconds).toBe(300);
    expect(w[5].seconds).toBe(0);
  });
});

describe('texte', () => {
  it('markdown + jetons de flou', () => {
    const { blocks, blurCount } = parseMarkdown('## T\nLa {{photosynthèse}} a lieu dans les **{{chloroplastes}}**.');
    expect(blurCount).toBe(2);
    expect(blocks[0].type).toBe('h2');
  });
  it('wrapKeywords ne double pas les marqueurs', () => {
    const out = wrapKeywords('La {{mitose}} et la méiose. Mitose encore.', ['mitose', 'méiose']);
    expect(stripMarkers(out)).toBe('La mitose et la méiose. Mitose encore.');
    expect(out).not.toContain('{{{{');
  });
  it('réponses tolérantes', () => {
    expect(isCloseEnough('Chloroplaste', 'les chloroplastes')).toBe(true);
    expect(isCloseEnough('ribosome', 'mitochondrie')).toBe(false);
    expect(isCloseEnough('Eléphant', 'éléphant')).toBe(true);
  });
  it('mdToSpeech', () => {
    expect(mdToSpeech('## Titre\n- a {{b}}\n- **c**')).not.toMatch(/[#*{}]/);
  });
  it('splitForSpeech ≤ 200', () => {
    const t = 'Phrase un. '.repeat(100) + 'x'.repeat(500);
    expect(splitForSpeech(t).every((c) => c.length <= 201)).toBe(true);
  });
});

describe('IA', () => {
  it('chunkText respecte la taille', () => {
    const t = ('Mot '.repeat(50) + '\n\n').repeat(300);
    const ch = chunkText(t, 12000);
    expect(ch.length).toBeGreaterThan(1);
    expect(ch.every((c) => c.length <= 12500)).toBe(true);
  });
  it('normalizePack : valide, corrige, rejette', () => {
    const p = normalizePack({
      summary: 'S', keywords: [{ term: 'a', definition: 'b' }, { term: '', definition: 'x' }],
      quiz: [
        { type: 'qcm', question: 'Q?', options: ['A', 'B', 'C', 'D'], answer_index: 2, explanation: 'e', critical: true },
        { type: 'qcm', question: 'Mauvais', options: ['A', 'B'], answer_index: 0 },
        { type: 'tf', question: 'V?', answer: 'faux' },
        { type: 'open', question: 'O?', answer: 'rep' },
        { type: 'match', question: 'M', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }] },
        { type: 'inconnu', question: 'x' },
      ],
      audio_script: 'audio',
    });
    expect(p.cards.map((c) => c.type)).toEqual(['qcm', 'tf', 'open', 'match']);
    expect(p.cards[0].answer).toBe('C');
    expect(p.cards[1].answer).toBe('Faux');
    expect(p.keywords).toHaveLength(1);
    expect(normalizePack(null).cards).toEqual([]);
  });
  it('mergePacks dédoublonne', () => {
    const a = normalizePack({ summary: 'A', quiz: [{ type: 'open', question: 'Même ?', answer: 'x' }] });
    const b = normalizePack({ summary: 'B', quiz: [{ type: 'open', question: 'même', answer: 'y' }] });
    expect(mergePacks([a, b]).cards).toHaveLength(1);
  });
});

describe('streak', () => {
  it('compte hier + aujourd’hui', () => {
    const now = new Date(2026, 10, 23, 12).getTime();
    const s = [0, 1, 2].map((i) => ({ startedAt: now - i * DAY }));
    expect(computeStreak(s, now)).toBe(3);
    expect(computeStreak([{ startedAt: now - 3 * DAY }], now)).toBe(0);
  });
});
