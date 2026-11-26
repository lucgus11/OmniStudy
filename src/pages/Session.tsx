import { Flame, Timer, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CardView } from '@/components/CardView';
import { Loading, ProgressBar } from '@/components/ui';
import { db } from '@/lib/db';
import { formatClock, formatDuration } from '@/lib/date';
import { useTick } from '@/lib/hooks';
import { gradeCard, recordSession } from '@/lib/repo';
import { PACE_CONFIG, buildQueue } from '@/lib/srs';
import type { Card, Grade, Pace } from '@/lib/types';

function Shell({
  children,
  pace,
  done,
  progress,
  remaining,
  onQuit,
}: {
  children: React.ReactNode;
  pace: Pace;
  done: boolean;
  progress: number;
  remaining: number | null;
  onQuit: () => void;
}) {
  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <button className="btn-icon -ml-2" aria-label="Quitter la session" onClick={onQuit}>
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <ProgressBar value={done ? 1 : progress} />
        </div>
        <span className="chip tabular-nums">
          {pace === 'urgent' ? <Flame className="h-3 w-3 text-warn" /> : <Timer className="h-3 w-3" />}
          {remaining != null && !done ? formatClock(remaining) : PACE_CONFIG[pace].label}
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Session de cartes plein écran (SRS) : Express / Focus / Libre / Urgence J-1. */
export default function Session() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const pace = (['express', 'focus', 'free', 'urgent'].includes(params.get('pace') ?? '') ? params.get('pace') : 'express') as Pace;
  const subjectId = params.get('subject');
  const courseId = params.get('course');
  const force = params.get('force') === '1';

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, again: 0 });
  const startedAt = useRef(Date.now());
  const recorded = useRef(false);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Les cartes "À revoir" reviennent en fin de file dans la même session
  useEffect(() => {
    let alive = true;
    void (async () => {
      const cards = await db.cards.filter((c) => !c.deleted).toArray();
      if (alive) setQueue(buildQueue(cards, { pace, subjectId, courseId, force }));
    })();
    return () => {
      alive = false;
    };
  }, [pace, subjectId, courseId, force]);

  const limit = PACE_CONFIG[pace].seconds;
  useTick(1000, !done && !!queue?.length);
  const elapsed = Math.round((Date.now() - startedAt.current) / 1000);
  const timeUp = limit != null && elapsed >= limit;

  const finish = useCallback(() => {
    setDone(true);
    if (recorded.current) return;
    recorded.current = true;
    const s = statsRef.current;
    if (s.reviewed > 0) {
      void recordSession({
        subjectId,
        mode: 'cards',
        pace,
        durationSec: Math.round((Date.now() - startedAt.current) / 1000),
        reviewed: s.reviewed,
        correct: s.correct,
        startedAt: startedAt.current,
      });
    }
  }, [pace, subjectId]);

  // Fin automatique quand le temps imparti est écoulé (la carte en cours est terminée avant)
  const card = queue?.[i];
  const advance = useCallback(
    async (grade: Grade, correct: boolean | null) => {
      if (!card || !queue) return;
      const updated = await gradeCard(card.id, grade);
      setStats((s) => ({
        reviewed: s.reviewed + 1,
        correct: s.correct + (grade === 2 ? 1 : 0),
        again: s.again + (grade === 0 ? 1 : 0),
      }));
      void correct;
      let next = queue;
      if (grade === 0 && updated) next = [...queue, { ...updated }]; // revient en fin de session
      setQueue(next);
      if (i + 1 >= next.length || timeUp) finish();
      else setI(i + 1);
    },
    [card, queue, i, finish, timeUp],
  );

  // Enregistre aussi si l'utilisateur quitte en cours de route
  useEffect(
    () => () => {
      if (!recorded.current && statsRef.current.reviewed > 0) {
        recorded.current = true;
        void recordSession({
          subjectId,
          mode: 'cards',
          pace,
          durationSec: Math.round((Date.now() - startedAt.current) / 1000),
          reviewed: statsRef.current.reviewed,
          correct: statsRef.current.correct,
          startedAt: startedAt.current,
        });
      }
    },
    [pace, subjectId],
  );

  const progress = useMemo(() => (queue?.length ? Math.min(1, i / queue.length) : 0), [queue, i]);

  if (!queue) return <Loading />;

  if (!queue.length) {
    return (
      <Shell pace={pace} done={done} progress={progress} remaining={limit != null ? Math.max(0, limit - elapsed) : null} onQuit={() => (done ? nav('/') : finish())}>
        <div className="mt-16 text-center">
          <p className="text-lg font-medium">{pace === 'urgent' ? 'Aucun point faible 🎉' : 'Rien à réviser pour le moment'}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {pace === 'urgent'
              ? 'Toutes tes notions sont acquises et aucun point critique n’est en suspens.'
              : 'Importe un cours et génère un quiz avec l’IA, ou essaie le mode Session libre.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {pace === 'urgent' && !force ? (
              <button
                className="btn-primary"
                onClick={() => {
                  const q = new URLSearchParams(params);
                  q.set('force', '1');
                  nav(`/session?${q}`, { replace: true });
                }}
              >
                Réviser quand même toutes mes cartes
              </button>
            ) : (
              <Link to="/import" className="btn-primary">
                Importer un cours
              </Link>
            )}
            <Link to="/" className="btn-secondary">
              Accueil
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (done) {
    const rate = stats.reviewed ? Math.round((stats.correct / stats.reviewed) * 100) : 0;
    return (
      <Shell pace={pace} done={done} progress={progress} remaining={limit != null ? Math.max(0, limit - elapsed) : null} onQuit={() => (done ? nav('/') : finish())}>
        <div className="mt-12 text-center">
          <p className="text-3xl">🎯</p>
          <h1 className="mt-3">Session terminée</h1>
          <p className="mt-1 text-sm text-muted">{formatDuration(Math.round((Date.now() - startedAt.current) / 1000))}</p>
          <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-3">
            {[
              ['Cartes', stats.reviewed],
              ['Acquises', `${rate} %`],
              ['À revoir', stats.again],
            ].map(([l, v]) => (
              <div key={l as string} className="card p-3">
                <p className="text-xl font-semibold tabular-nums">{v}</p>
                <p className="text-xs text-muted">{l}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-center gap-2">
            <Link to="/" className="btn-primary">
              Terminer
            </Link>
            <button className="btn-secondary" onClick={() => nav(0)}>
              Encore une session
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell pace={pace} done={done} progress={progress} remaining={limit != null ? Math.max(0, limit - elapsed) : null} onQuit={() => (done ? nav('/') : finish())}>
      {card && <CardView key={`${card.id}-${i}`} card={card} onGrade={(g, c) => void advance(g, c)} />}
      {timeUp && (
        <p className="mt-6 text-center text-xs text-muted">
          Temps écoulé — termine cette carte, la session s'arrêtera ensuite.
        </p>
      )}
    </Shell>
  );
}
