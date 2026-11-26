/**
 * Service IA (client) — génère un "pack d'étude" via /api/ai (proxy Groq,
 * modèle openai/gpt-oss-120b). Les cours longs sont découpés en parties
 * traitées séquentiellement puis fusionnées.
 */
import { CHUNK_SIZE, MAX_PARTS, chunkText, mergePacks, normalizePack } from './aiParse';
import { supabase } from './supabase';
import type { NewCard, StudyPack } from './types';

export class AiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface GenerateProgress {
  part: number;
  parts: number;
}

export interface GenerateResult {
  pack: StudyPack;
  parts: number;
  /** true si le cours dépassait la limite et a été tronqué */
  truncated: boolean;
}

async function getToken(): Promise<string> {
  if (!supabase) throw new AiError('no_backend', "Supabase n'est pas configuré : l'IA nécessite un compte.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError('unauthorized', "Connecte-toi pour utiliser l'IA.", 401);
  return token;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Annulé', 'AbortError'));
    });
  });

async function callPart(
  body: { text: string; title: string; subject: string; part: number; parts: number; mode?: 'full' | 'more'; existing?: string[] },
  signal?: AbortSignal,
): Promise<StudyPack> {
  const maxAttempts = 3;
  let lastErr: AiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!navigator.onLine) throw new AiError('offline', "Hors-ligne : la génération IA nécessite internet.");
    const token = await getToken();

    let res: Response;
    try {
      res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      lastErr = new AiError('network', 'Connexion au serveur impossible.');
      await sleep(1500 * attempt, signal);
      continue;
    }

    if (res.status === 404) {
      throw new AiError(
        'no_api',
        "API IA introuvable. En local, lance `npx vercel dev` ; sinon déploie le projet sur Vercel.",
        404,
      );
    }

    const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: string; message?: string };

    if (res.ok && json.data) {
      const pack = normalizePack(json.data);
      if (!pack.summary && !pack.cards.length) {
        lastErr = new AiError('empty', "L'IA n'a rien produit d'exploitable.");
      } else {
        return pack;
      }
    } else {
      const code = json.error ?? 'server_error';
      const err = new AiError(code, json.message ?? `Erreur ${res.status}`, res.status);
      // erreurs définitives : inutile de réessayer
      if ([400, 401, 413].includes(res.status) || code === 'missing_groq_key') throw err;
      lastErr = err;
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Math.min(20_000, (ra > 0 ? ra : 4) * 1000), signal);
        continue;
      }
    }
    if (attempt < maxAttempts) await sleep(1500 * attempt, signal);
  }
  throw lastErr ?? new AiError('unknown', 'Échec de la génération.');
}

export async function generateStudyPack(opts: {
  text: string;
  title: string;
  subject?: string;
  onProgress?: (p: GenerateProgress) => void;
  signal?: AbortSignal;
}): Promise<GenerateResult> {
  const all = chunkText(opts.text, CHUNK_SIZE);
  if (!all.length) throw new AiError('too_short', 'Le cours est vide.');
  const truncated = all.length > MAX_PARTS;
  const parts = all.slice(0, MAX_PARTS);

  const packs: StudyPack[] = [];
  for (let i = 0; i < parts.length; i++) {
    opts.onProgress?.({ part: i + 1, parts: parts.length });
    packs.push(
      await callPart(
        { text: parts[i], title: opts.title, subject: opts.subject ?? '', part: i + 1, parts: parts.length },
        opts.signal,
      ),
    );
  }
  return { pack: mergePacks(packs), parts: parts.length, truncated };
}

/**
 * Génère des questions SUPPLÉMENTAIRES pour un cours déjà analysé.
 * Les questions existantes sont transmises à l'IA pour qu'elle évite les doublons.
 */
export async function generateMoreCards(opts: {
  text: string;
  title: string;
  subject?: string;
  existing: string[];
  onProgress?: (p: GenerateProgress) => void;
  signal?: AbortSignal;
}): Promise<{ cards: NewCard[]; truncated: boolean }> {
  const all = chunkText(opts.text, CHUNK_SIZE);
  if (!all.length) throw new AiError('too_short', 'Le cours est vide.');
  const truncated = all.length > MAX_PARTS;
  const parts = all.slice(0, MAX_PARTS);

  const packs: StudyPack[] = [];
  for (let i = 0; i < parts.length; i++) {
    opts.onProgress?.({ part: i + 1, parts: parts.length });
    packs.push(
      await callPart(
        {
          text: parts[i],
          title: opts.title,
          subject: opts.subject ?? '',
          part: i + 1,
          parts: parts.length,
          mode: 'more',
          existing: [...opts.existing, ...packs.flatMap((p) => p.cards.map((c) => c.question))].slice(-120),
        },
        opts.signal,
      ),
    );
  }
  return { cards: mergePacks(packs).cards, truncated };
}
