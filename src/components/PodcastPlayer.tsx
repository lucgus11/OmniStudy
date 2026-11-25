import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProgressBar } from './ui';
import { formatClock } from '@/lib/date';
import { recordSession } from '@/lib/repo';
import { updateSettings, useSettings } from '@/lib/settings';
import { Narrator, estimateSeconds, splitForSpeech, ttsSupported } from '@/lib/speech';
import type { Pace } from '@/lib/types';

export interface Track {
  id: string;
  title: string;
  text: string;
  subjectId?: string | null;
}

const RATES = [0.85, 1, 1.25, 1.5, 1.75];

/**
 * Mode Podcast : lecture vocale continue (TTS natif, hors-ligne) avec vitesse réglable.
 * `budgetSec` limite la durée totale (Express 2 min / Focus 10 min).
 */
export function PodcastPlayer({
  tracks,
  budgetSec,
  pace,
  subjectId,
}: {
  tracks: Track[];
  budgetSec: number | null;
  pace: Pace;
  subjectId: string | null;
}) {
  const settings = useSettings();
  const rateRef = useRef(settings.ttsRate);
  const voiceRef = useRef(settings.voiceURI);
  rateRef.current = settings.ttsRate;
  voiceRef.current = settings.voiceURI;

  // Phrases + index de piste, tronqués au budget de temps
  const { chunks, owner } = useMemo(() => {
    const chunks: string[] = [];
    const owner: number[] = [];
    let total = 0;
    outer: for (let t = 0; t < tracks.length; t++) {
      for (const c of splitForSpeech(tracks[t].text)) {
        const d = estimateSeconds(c, 1);
        if (budgetSec && total + d > budgetSec && chunks.length) break outer;
        chunks.push(c);
        owner.push(t);
        total += d;
      }
    }
    return { chunks, owner };
  }, [tracks, budgetSec]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const narrator = useRef<Narrator | null>(null);
  const listened = useRef({ ms: 0, since: 0 });
  const recorded = useRef(false);

  const flushListened = () => {
    if (listened.current.since) {
      listened.current.ms += Date.now() - listened.current.since;
      listened.current.since = 0;
    }
  };

  const record = () => {
    flushListened();
    const sec = Math.round(listened.current.ms / 1000);
    if (recorded.current || sec < 15) return;
    recorded.current = true;
    void recordSession({
      subjectId,
      mode: 'podcast',
      pace,
      durationSec: sec,
      reviewed: new Set(owner.slice(0, Math.max(1, idx + 1))).size,
      correct: 0,
      startedAt: Date.now() - sec * 1000,
    });
  };
  const recordRef = useRef(record);
  recordRef.current = record;

  useEffect(() => {
    const n = new Narrator(
      () => ({ rate: rateRef.current, voiceURI: voiceRef.current }),
      {
        onIndex: setIdx,
        onState: (p) => {
          setPlaying(p);
          if (p) {
            setEnded(false);
            listened.current.since = Date.now();
          } else flushListened();
        },
        onEnd: () => {
          setEnded(true);
          recordRef.current();
        },
      },
    );
    n.load(chunks);
    narrator.current = n;
    return () => {
      n.stop();
      recordRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks]);

  if (!ttsSupported()) {
    return <p className="card-pad text-sm text-muted">La synthèse vocale n'est pas disponible sur ce navigateur.</p>;
  }
  if (!chunks.length) {
    return <p className="card-pad text-sm text-muted">Rien à lire : importe un cours (ou génère la synthèse avec l'IA).</p>;
  }

  const n = narrator.current;
  const track = tracks[owner[Math.min(idx, owner.length - 1)]];
  // (curTrack / trackCount sont calculés plus bas, avant leur utilisation)
  const total = chunks.reduce((a, c) => a + estimateSeconds(c, settings.ttsRate), 0);
  const done = chunks.slice(0, idx).reduce((a, c) => a + estimateSeconds(c, settings.ttsRate), 0);

  const curTrack = owner[Math.min(idx, owner.length - 1)];
  const trackCount = new Set(owner).size;

  const jumpTrack = (dir: -1 | 1) => {
    if (!n) return;
    if (dir === 1) {
      const next = owner.indexOf(curTrack + 1);
      if (next >= 0) n.seek(next);
      return;
    }
    // "précédent" : début de la piste si on a déjà avancé, sinon piste d'avant
    const start = owner.indexOf(curTrack);
    const target = idx - start > 2 ? curTrack : Math.max(0, curTrack - 1);
    n.seek(Math.max(0, owner.indexOf(target)));
  };

  const setRate = (r: number) => {
    updateSettings({ ttsRate: r });
    rateRef.current = r;
    n?.restartCurrent();
  };

  return (
    <div className="card-pad">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Volume2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{track?.title ?? 'Podcast'}</p>
          <p className="text-xs text-muted">
            Piste {curTrack + 1}/{trackCount} · {formatClock(total)} au total
          </p>
        </div>
      </div>

      <div className="mt-5 min-h-[4.5rem] rounded-xl bg-subtle px-4 py-3 text-[15px] leading-relaxed">
        {ended ? 'Lecture terminée ✓' : (chunks[Math.min(idx, chunks.length - 1)] ?? '')}
      </div>

      <div className="mt-4">
        <ProgressBar value={ended ? 1 : done / Math.max(1, total)} />
        <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted">
          <span>{formatClock(ended ? total : done)}</span>
          <span>{formatClock(total)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3">
        <button className="btn-icon h-11 w-11" aria-label="Piste précédente" onClick={() => jumpTrack(-1)}>
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-90 active:scale-95"
          aria-label={playing ? 'Pause' : 'Lecture'}
          onClick={() => (playing ? n?.pause() : n?.play())}
        >
          {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
        </button>
        <button className="btn-icon h-11 w-11" aria-label="Piste suivante" onClick={() => jumpTrack(1)}>
          <SkipForward className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5" role="radiogroup" aria-label="Vitesse de lecture">
        {RATES.map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={settings.ttsRate === r}
            data-active={settings.ttsRate === r}
            className="chip-btn !px-2.5 !py-1 tabular-nums"
            onClick={() => setRate(r)}
          >
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}
