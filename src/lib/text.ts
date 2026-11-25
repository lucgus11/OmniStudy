/**
 * Utilitaires texte : mini-parseur Markdown (avec jetons de flou {{...}}),
 * génération des termes à flouter, comparaison tolérante des réponses tapées,
 * conversion en texte "prononçable".
 */

// ── Markdown → blocs ────────────────────────────────────────────────────────
export type Inline =
  | { t: 'text'; v: string; b?: boolean; i?: boolean }
  | { t: 'blur'; id: number; v: string; b?: boolean };

export type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'oli' | 'quote' | 'hr';

export interface Block {
  type: BlockType;
  level?: number;
  num?: number;
  inline: Inline[];
}

export function parseInline(src: string, nextId: () => number): Inline[] {
  const out: Inline[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf, b: bold || undefined, i: italic || undefined });
      buf = '';
    }
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('{{', i)) {
      const end = src.indexOf('}}', i + 2);
      if (end !== -1) {
        const raw = src.slice(i + 2, end).replace(/\*\*|__|\*/g, '').trim();
        if (raw) {
          flush();
          out.push({ t: 'blur', id: nextId(), v: raw, b: bold || undefined });
        }
        i = end + 2;
        continue;
      }
    }
    if (src.startsWith('**', i)) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (src[i] === '*' && (italic || (src[i + 1] && !/\s/.test(src[i + 1])))) {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buf += src[i];
    i += 1;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): { blocks: Block[]; blurCount: number } {
  const blocks: Block[] = [];
  let counter = 0;
  const nextId = () => counter++;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', inline: parseInline(para.join(' '), nextId) });
      para = [];
    }
  };

  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flushPara();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flushPara();
      const lvl = Math.min(m[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: `h${lvl}`, inline: parseInline(m[2], nextId) });
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara();
      blocks.push({ type: 'hr', inline: [] });
    } else if ((m = /^(\s*)([-*•–])\s+(.*)$/.exec(line))) {
      flushPara();
      blocks.push({
        type: 'li',
        level: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)),
        inline: parseInline(m[3], nextId),
      });
    } else if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      blocks.push({
        type: 'oli',
        level: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)),
        num: Number(m[2]),
        inline: parseInline(m[3], nextId),
      });
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushPara();
      blocks.push({ type: 'quote', inline: parseInline(m[1], nextId) });
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  return { blocks, blurCount: counter };
}

// ── Marqueurs de flou {{ }} ─────────────────────────────────────────────────
export const hasMarkers = (s: string) => /\{\{[^{}]+?\}\}/.test(s);
export const stripMarkers = (s: string) => s.replace(/\{\{([^{}]+?)\}\}/g, '$1');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Applique `fn` uniquement aux segments qui ne sont pas déjà dans {{ }}. */
function mapOutsideMarkers(line: string, fn: (seg: string) => string): string {
  return line
    .split(/(\{\{[^}]*\}\})/)
    .map((seg) => (seg.startsWith('{{') ? seg : fn(seg)))
    .join('');
}

/**
 * Entoure de {{ }} les occurrences des termes fournis (mots-clés extraits par l'IA).
 * Utilisé pour flouter le "cours complet" à partir de la liste de mots-clés.
 */
export function wrapKeywords(text: string, terms: string[], maxPerTerm = 3): string {
  const uniq = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))].sort(
    (a, b) => b.length - a.length,
  );
  if (!uniq.length) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${uniq.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const counts = new Map<string, number>();
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) return line;
      return mapOutsideMarkers(line, (seg) =>
        seg.replace(re, (m) => {
          const k = m.toLowerCase();
          const c = counts.get(k) ?? 0;
          if (c >= maxPerTerm) return m;
          counts.set(k, c + 1);
          return `{{${m}}}`;
        }),
      );
    })
    .join('\n');
}

/**
 * Heuristique hors-ligne / sans IA : marque le gras, les années, les nombres avec unité
 * et les noms propres au milieu d'une phrase.
 */
export function autoMark(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) return line;
      let l = line.replace(/\*\*([^*\n]{2,40})\*\*/g, '**{{$1}}**');
      l = mapOutsideMarkers(l, (seg) =>
        seg
          .replace(/(?<![\p{L}\p{N}])(1[5-9]\d{2}|20\d{2})(?![\p{L}\p{N}])/gu, '{{$1}}')
          .replace(
            /(?<![\p{L}\p{N}.,])\d+(?:[.,]\d+)?\s?(?:%|€|\$|°C|km|kg|ans|jours|mois|heures)(?![\p{L}\p{N}])/gu,
            '{{$&}}',
          ),
      );
      l = mapOutsideMarkers(l, (seg) =>
        seg.replace(
          /(?<=[\p{Ll},;:] )(\p{Lu}[\p{L}'’-]{2,}(?: \p{Lu}[\p{L}'’-]{2,}){0,2})(?![\p{L}])/gu,
          '{{$1}}',
        ),
      );
      return l;
    })
    .join('\n');
}

// ── Réponses tapées ─────────────────────────────────────────────────────────
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripArticle = (s: string) => s.replace(/^(le|la|les|l|un|une|des|du|de|d|the|a|an) /, '');

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Compare une saisie à la cible, insensible à la casse, aux accents et aux petites fautes. */
export function isCloseEnough(input: string, target: string): boolean {
  const a = stripArticle(normalizeAnswer(input));
  const b = stripArticle(normalizeAnswer(target));
  if (!a || !b) return false;
  if (a === b) return true;
  const tol = b.length <= 4 ? 0 : b.length <= 8 ? 1 : 2;
  return levenshtein(a, b) <= tol;
}

// ── Synthèse vocale ─────────────────────────────────────────────────────────
/** Markdown (avec {{ }}) → texte brut agréable à lire à voix haute. */
export function mdToSpeech(md: string): string {
  return stripMarkers(md)
    .replace(/^#{1,6}\s*(.*)$/gm, (_m, t: string) => (/[.!?:]$/.test(t.trim()) ? t : `${t.trim()}.`))
    .replace(/^\s*[-*•–]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*|__|\*|`/g, '')
    .replace(/([^.!?:;\n])\n(?!\n)/g, '$1. ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Texte de cours → extrait court pour les aperçus. */
export function excerpt(text: string, max = 140): string {
  const t = stripMarkers(text).replace(/[#*>\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
