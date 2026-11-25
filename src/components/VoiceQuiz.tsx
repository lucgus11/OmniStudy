import { Mic, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProgressBar } from './ui';
import { gradeCard, recordSession } from '@/lib/repo';
import { settingsStore } from '@/lib/settings';
import { say, stopSpeaking, ttsSupported, wait } from '@/lib/speech';
import type { Card, Grade, Pace } from '@/lib/types';

interface VoiceQA {
  /** Texte lu avant le compte à rebours */
  ask: string;
  /** Texte lu après le compte à rebours */
  reveal: string;
  /** Affichage écran */
  shownQuestion: string;
  shownAnswer: string;
}

const LETTERS = 'ABCDEFGH';

/** Transforme n'importe quelle carte en couple question / réponse à dire à voix haute. */
export function toVoiceQA(card: Card, readOptions: boolean, readExplanation: boolean): VoiceQA {
  const expl = readExplanation && card.explanation ? ` ${card.explanation}` : '';
  switch (card.type) {
    case 'qcm': {
      const opts = readOptions ? ' ' + card.options.map((o, i) => `Option ${LETTERS[i]} : ${o}.`).join(' ') : '';
      const letter = LETTERS[Math.max(0, card.options.indexOf(card.answer))];
      return {
        ask: `${card.question}${opts}`,
        reveal: `La bonne réponse est ${letter} : ${card.answer}.${expl}`,
        shownQuestion: card.question,
        shownAnswer: `${letter} · ${card.answer}`,
      };
    }
    case 'tf':
      return {
        ask: `Vrai ou faux ? ${card.question}`,
        reveal: `${card.answer}.${expl}`,
        shownQuestion: card.question,
        shownAnswer: card.answer,
      };
    case 'match': {
      const p = card.pairs[Math.floor(Math.random() * card.pairs.length)];
      return {
        ask: `Définis : ${p.left}`,
        reveal: `${p.right}.`,
        shownQuestion: `Définis : ${p.left}`,
        shownAnswer: p.right,
      };
    }
    default:
      return {
        ask: card.question,
        reveal: `${card.answer}.${expl}`,
        shownQuestion: card.question,
        shownAnswer: card.answer,
      };
  }
}

type Phase = 'idle' | 'ask' | 'think' | 'answer' | 'between';

/**
 * Mode Interro vocale : l'app lit la question, laisse un compte à rebours silencieux
 * (configurable) pour réfléchir, puis énonce la bonne réponse. Mains libres, hors-ligne.
 */
export function VoiceQuiz({ cards, pace, subjectId }: { cards: Card[]; pace: Pace; subjectId: string | null }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const ctrl = useRef<AbortController | null>(null);
  const spoken = useRef(0);
  const startedAt = useRef(0);
  const recorded = useRef(false);
  const gradesRef = useRef(grades);
  gradesRef.current = grades;

  // On fige la mise en forme de chaque carte pour que l'écran reste cohérent avec la voix
  const qas = useMemo(() => {
    const s = settingsStore.get();
    return cards.map((c) => toVoiceQA(c, s.interroReadOptions, s.interroReadExplanation));
  }, [cards]);

  const record = () => {
    if (recorded.current || spoken.current === 0) return;
    recorded.current = true;
    const g = Object.values(gradesRef.current);
    void recordSession({
      subjectId,
      mode: 'voice',
      pace,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      reviewed: spoken.current,
      correct: g.filter((x) => x === 2).length,
      startedAt: startedAt.current,
    });
  };
  const recordRef = useRef(record);
  recordRef.current = record;

  useEffect(
    () => () => {
      ctrl.current?.abort();
      stopSpeaking();
      recordRef.current();
    },
    [],
  );

  const run = (from: number) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!startedAt.current) startedAt.current = Date.now();
    setRunning(true);
    setFinished(false);

    void (async () => {
      for (let k = from; k < qas.length; k++) {
        if (c.signal.aborted) return;
        setI(k);
        const s = settingsStore.get();
        const voice = { rate: s.ttsRate, voiceURI: s.voiceURI };

        setPhase('ask');
        await say(qas[k].ask, voice, c.signal);
        if (c.signal.aborted) return;

        setPhase('think');
        for (let r = s.interroSeconds; r > 0; r--) {
          setRemaining(r);
          await wait(1000, c.signal);
          if (c.signal.aborted) return;
        }

        setPhase('answer');
        await say(qas[k].reveal, { rate: settingsStore.get().ttsRate, voiceURI: settingsStore.get().voiceURI }, c.signal);
        if (c.signal.aborted) return;
        spoken.current = k + 1;

        setPhase('between');
        await wait(1800, c.signal);
      }
      if (c.signal.aborted) return;
      setRunning(false);
      setPhase('idle');
      setFinished(true);
      recordRef.current();
    })();
  };

  const pause = () => {
    ctrl.current?.abort();
    stopSpeaking();
    setRunning(false);
  };

  const skip = () => {
    if (i + 1 >= qas.length) {
      pause();
      setFinished(true);
      recordRef.current();
    } else run(i + 1);
  };

  const rate = async (grade: Grade) => {
    const card = cards[i];
    if (!card) return;
    setGrades((g) => ({ ...g, [card.id]: grade }));
    await gradeCard(card.id, grade);
  };

  if (!ttsSupported()) {
    return <p className="card-pad text-sm text-muted">La synthèse vocale n'est pas disponible sur ce navigateur.</p>;
  }
  if (!cards.length) {
    return (
      <p className="card-pad text-sm text-muted">
        Aucune question disponible pour ce filtre. Génère un quiz avec l'IA depuis la page d'un cours.
      </p>
    );
  }

  const qa = qas[Math.min(i, qas.length - 1)];
  const card = cards[Math.min(i, cards.length - 1)];
  const secs = settingsStore.get().interroSeconds;
  const showAnswer = phase === 'answer' || phase === 'between';

  return (
    <div className="card-pad">
      <div className="mb-4 flex items-center justify-between text-sm text-muted">
        <span className="chip">
          <Mic className="h-3 w-3" /> Interro vocale
        </span>
        <span className="tabular-nums">
          {Math.min(i + 1, qas.length)}/{qas.length}
        </span>
      </div>
      <ProgressBar value={(finished ? qas.length : i + (showAnswer ? 1 : 0)) / qas.length} className="mb-5" />

      {finished ? (
        <div className="py-6 text-center">
          <p className="text-lg font-medium">Interro terminée 🎉</p>
          <p className="mt-1 text-sm text-muted">
            {spoken.current} question{spoken.current > 1 ? 's' : ''} posée{spoken.current > 1 ? 's' : ''}.
          </p>
          <button
            className="btn-secondary mt-5"
            onClick={() => {
              recorded.current = false;
              spoken.current = 0;
              startedAt.current = 0;
              setGrades({});
              run(0);
            }}
          >
            <RotateCcw className="h-4 w-4" /> Recommencer
          </button>
        </div>
      ) : phase === 'idle' && !running && i === 0 && !startedAt.current ? (
        <div className="py-6 text-center">
          <p className="text-sm text-muted">
            {qas.length} question{qas.length > 1 ? 's' : ''} · {secs} s de réflexion silencieuse entre la question et la réponse.
          </p>
          <button className="btn-primary btn-lg mt-5" onClick={() => run(0)}>
            <Play className="h-4 w-4" /> Démarrer l'interro
          </button>
        </div>
      ) : (
        <>
          <p className="text-lg font-medium leading-snug">{qa.shownQuestion}</p>

          <div className="mt-5 flex min-h-[6.5rem] items-center justify-center rounded-xl bg-subtle px-4 py-4 text-center">
            {phase === 'think' ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-4xl font-semibold tabular-nums text-accent">{remaining}</span>
                <span className="text-xs text-muted">Réfléchis…</span>
              </div>
            ) : showAnswer ? (
              <p className="animate-fade-in text-[15px] font-medium">{qa.shownAnswer}</p>
            ) : phase === 'ask' ? (
              <span className="text-sm text-muted">🔊 Lecture de la question…</span>
            ) : (
              <span className="text-sm text-muted">En pause</span>
            )}
          </div>

          {showAnswer && (
            <div className="mt-4 grid animate-fade-in grid-cols-3 gap-2">
              {([
                [0, 'À revoir', 'border-bad/40 text-bad'],
                [1, 'Moyen', 'border-warn/40 text-warn'],
                [2, 'Acquis', 'border-ok/40 text-ok'],
              ] as const).map(([g, label, cls]) => (
                <button
                  key={g}
                  onClick={() => void rate(g)}
                  className={`btn border bg-bg ${cls} ${grades[card.id] === g ? 'ring-2 ring-current/40' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg hover:opacity-90"
              aria-label={running ? 'Pause' : 'Reprendre'}
              onClick={() => (running ? pause() : run(i))}
            >
              {running ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <button className="btn-icon h-11 w-11" aria-label="Question suivante" onClick={skip}>
              <SkipForward className="h-5 w-5" />
            </button>
            <button
              className="btn-icon h-11 w-11"
              aria-label="Arrêter"
              onClick={() => {
                pause();
                setFinished(true);
                recordRef.current();
              }}
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
