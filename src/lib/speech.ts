/**
 * Synthèse vocale (Web Speech API, TTS natif) — fonctionne hors-ligne avec les
 * voix installées sur l'appareil ("localService").
 */
import { useEffect, useState } from 'react';

export const ttsSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export interface VoiceOpts {
  rate: number;
  voiceURI?: string | null;
  /** langue de repli si aucune voix n'est choisie */
  lang?: string;
}

// ── Voix ────────────────────────────────────────────────────────────────────
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500); // certains navigateurs n'émettent jamais l'événement
  });
}

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    let alive = true;
    void loadVoices().then((v) => alive && setVoices(v));
    if (!ttsSupported()) return;
    const onChange = () => alive && setVoices(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', onChange);
    return () => {
      alive = false;
      speechSynthesis.removeEventListener('voiceschanged', onChange);
    };
  }, []);
  return voices;
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI?: string | null,
  lang = 'fr',
): SpeechSynthesisVoice | null {
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  return matching.find((v) => v.localService) ?? matching[0] ?? null;
}

// ── Découpage ───────────────────────────────────────────────────────────────
/**
 * Chrome interrompt les très longues énonciations (~15 s) : on parle phrase par phrase,
 * ce qui permet aussi pause / reprise / saut précis.
 */
export function splitForSpeech(text: string, max = 200): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…:;])\s+/)
    .filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur ? cur.length + 1 : 0) + s.length <= max) {
      cur = cur ? `${cur} ${s}` : s;
      continue;
    }
    if (cur) out.push(cur);
    cur = '';
    let rest = s;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(',', max);
      if (cut < 40) cut = rest.lastIndexOf(' ', max);
      if (cut <= 0) cut = max;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    cur = rest;
  }
  if (cur) out.push(cur);
  return out;
}

/** Durée estimée de lecture (≈ 15 caractères/seconde à vitesse 1×). */
export const estimateSeconds = (text: string, rate = 1): number => text.length / 15 / Math.max(0.5, rate);

// ── Lecture ─────────────────────────────────────────────────────────────────
function speakChunk(text: string, o: VoiceOpts, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!ttsSupported() || signal?.aborted) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(speechSynthesis.getVoices(), o.voiceURI, (o.lang ?? 'fr').slice(0, 2));
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = o.lang ?? 'fr-FR';
    }
    u.rate = o.rate;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      speechSynthesis.cancel();
      finish();
    };
    u.onend = finish;
    u.onerror = finish;
    signal?.addEventListener('abort', onAbort);
    speechSynthesis.speak(u);
  });
}

/** Lit un texte à voix haute ; se termine à la fin de la lecture ou à l'abandon du signal. */
export async function say(text: string, o: VoiceOpts, signal?: AbortSignal): Promise<void> {
  for (const chunk of splitForSpeech(text)) {
    if (signal?.aborted) return;
    await speakChunk(chunk, o, signal);
  }
}

export function stopSpeaking(): void {
  if (ttsSupported()) speechSynthesis.cancel();
}

/** Attente interruptible (compte à rebours silencieux de l'interro vocale). */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}

/**
 * Lecteur "podcast" : file de phrases avec lecture / pause / reprise / saut / changement de vitesse.
 * La pause = annulation + mémorisation de l'index (la pause native est peu fiable sur mobile).
 */
export class Narrator {
  private chunks: string[] = [];
  private idx = 0;
  private ctrl: AbortController | null = null;
  playing = false;

  constructor(
    private getOpts: () => VoiceOpts,
    private on: { onIndex?: (i: number) => void; onState?: (playing: boolean) => void; onEnd?: () => void },
  ) {}

  load(chunks: string[]): void {
    this.stop();
    this.chunks = chunks;
    this.idx = 0;
    this.on.onIndex?.(0);
  }

  get index(): number {
    return this.idx;
  }
  get length(): number {
    return this.chunks.length;
  }

  play(): void {
    if (this.playing || !this.chunks.length) return;
    if (this.idx >= this.chunks.length) this.idx = 0;
    this.playing = true;
    this.on.onState?.(true);
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    void (async () => {
      while (!ctrl.signal.aborted && this.idx < this.chunks.length) {
        this.on.onIndex?.(this.idx);
        await speakChunk(this.chunks[this.idx], this.getOpts(), ctrl.signal);
        if (ctrl.signal.aborted) return;
        this.idx += 1;
      }
      if (!ctrl.signal.aborted) {
        this.playing = false;
        this.on.onState?.(false);
        this.on.onIndex?.(this.chunks.length);
        this.on.onEnd?.();
      }
    })();
  }

  pause(): void {
    if (!this.playing) return;
    this.ctrl?.abort();
    this.playing = false;
    this.on.onState?.(false);
  }

  stop(): void {
    this.ctrl?.abort();
    stopSpeaking();
    this.playing = false;
    this.on.onState?.(false);
  }

  seek(i: number): void {
    const was = this.playing;
    this.pause();
    this.idx = Math.max(0, Math.min(this.chunks.length - 1, i));
    this.on.onIndex?.(this.idx);
    if (was) this.play();
  }

  /** Redémarre la phrase en cours (utile au changement de vitesse / de voix). */
  restartCurrent(): void {
    if (!this.playing) return;
    this.pause();
    this.play();
  }
}
