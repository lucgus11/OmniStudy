import { Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RichText, type BlurInline } from '@/components/RichText';
import { Loading, ProgressBar, Segmented } from '@/components/ui';
import { useCourse } from '@/lib/hooks';
import { recordSession } from '@/lib/repo';
import { autoMark, hasMarkers, isCloseEnough, parseMarkdown, wrapKeywords } from '@/lib/text';

type TokState = 'hidden' | 'peek' | 'ok' | 'ko';
type Source = 'summary' | 'full';

/**
 * Mode Blur-Recall : le texte s'affiche avec les termes critiques floutés.
 * Clique sur un terme pour le dévoiler (compté "indice"), ou tape-le dans la zone de saisie
 * pour le déflouter (validation tolérante aux accents / petites fautes).
 */
export default function Recall() {
  const { courseId } = useParams();
  const nav = useNavigate();
  const course = useCourse(courseId);
  const [source, setSource] = useState<Source>('summary');
  const [states, setStates] = useState<Record<number, TokState>>({});
  const [typed, setTyped] = useState('');
  const [shake, setShake] = useState(false);
  const startedAt = useRef(Date.now());
  const recorded = useRef(false);

  const text = useMemo(() => {
    if (!course) return '';
    if (source === 'summary' && course.summary) return course.summary;
    // Cours complet : on floute les mots-clés IA, sinon une heuristique locale
    const base = course.content;
    const marked = course.keywords.length ? wrapKeywords(base, course.keywords.map((k) => k.term)) : base;
    return hasMarkers(marked) ? marked : autoMark(base);
  }, [course, source]);

  const parsed = useMemo(() => parseMarkdown(text), [text]);

  // Liste des termes (id → texte), pour la saisie
  const terms = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of parsed.blocks) for (const t of b.inline) if (t.t === 'blur') m.set(t.id, t.v);
    return m;
  }, [parsed]);

  useEffect(() => {
    setStates({});
    setTyped('');
  }, [text]);

  const total = terms.size;
  const count = (s: TokState) => Object.values(states).filter((x) => x === s).length;
  const found = count('ok');
  const peeked = count('peek');
  const revealed = found + peeked + count('ko');
  const finished = total > 0 && revealed === total;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = typed.trim();
    if (!v) return;
    const hit = [...terms].find(([id, t]) => (states[id] ?? 'hidden') === 'hidden' && isCloseEnough(v, t));
    if (hit) {
      // déflouter aussi les autres occurrences identiques
      setStates((s) => {
        const n = { ...s };
        for (const [id, t] of terms) if ((n[id] ?? 'hidden') === 'hidden' && isCloseEnough(v, t)) n[id] = 'ok';
        return n;
      });
      setTyped('');
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  const cycle = (id: number) => {
    setStates((s) => {
      const cur = s[id] ?? 'hidden';
      return { ...s, [id]: cur === 'hidden' ? 'peek' : cur === 'peek' ? 'hidden' : cur };
    });
  };

  const revealAll = () =>
    setStates((s) => {
      const n = { ...s };
      for (const id of terms.keys()) if ((n[id] ?? 'hidden') === 'hidden') n[id] = 'ko';
      return n;
    });

  const record = () => {
    if (recorded.current || revealed === 0) return;
    recorded.current = true;
    void recordSession({
      subjectId: course?.subjectId ?? null,
      mode: 'blur',
      pace: 'free',
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      reviewed: revealed,
      correct: found,
      startedAt: startedAt.current,
    });
  };
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => () => recordRef.current(), []);
  useEffect(() => {
    if (finished) recordRef.current();
  }, [finished]);

  if (course === undefined) return <Loading />;
  if (course === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p>Cours introuvable.</p>
        <Link to="/" className="btn-secondary mt-4">
          Accueil
        </Link>
      </div>
    );
  }

  const renderBlur = (tok: BlurInline) => {
    const st = states[tok.id] ?? 'hidden';
    return (
      <span
        role="button"
        tabIndex={0}
        className="blur-token"
        data-state={st}
        aria-label={st === 'hidden' ? 'Terme masqué, cliquer pour révéler' : tok.v}
        onClick={() => cycle(tok.id)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), cycle(tok.id))}
      >
        {tok.v}
      </span>
    );
  };

  const score = total ? Math.round((found / total) * 100) : 0;

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-3xl flex-col px-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/95 px-4 pb-3 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            className="btn-icon -ml-2"
            aria-label="Quitter"
            onClick={() => {
              recordRef.current();
              nav(-1);
            }}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{course.title}</p>
            <p className="text-xs text-muted tabular-nums">
              {found} trouvé{found > 1 ? 's' : ''} · {peeked} indice{peeked > 1 ? 's' : ''} · {total - revealed} restant
              {total - revealed > 1 ? 's' : ''}
            </p>
          </div>
          {course.summary && (
            <Segmented
              value={source}
              onChange={setSource}
              options={[
                { value: 'summary', label: 'Synthèse' },
                { value: 'full', label: 'Cours' },
              ]}
            />
          )}
        </div>
        <ProgressBar value={total ? revealed / total : 0} className="mt-3" />
      </header>

      <main className="flex-1 py-6">
        {total === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            Aucun terme à flouter dans ce texte. Lance l'analyse IA du cours pour générer une version Blur-Recall.
          </p>
        ) : (
          <>
            <RichText text={text} renderBlur={renderBlur} />
            {finished && (
              <div className="card-pad mt-8 animate-fade-in text-center">
                <p className="text-2xl font-semibold">{score} %</p>
                <p className="mt-1 text-sm text-muted">
                  {found} terme{found > 1 ? 's' : ''} retrouvé{found > 1 ? 's' : ''} sur {total}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      recordRef.current();
                      recorded.current = false;
                      startedAt.current = Date.now();
                      setStates({});
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Recommencer
                  </button>
                  <button className="btn-primary" onClick={() => nav(-1)}>
                    Terminer
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {total > 0 && !finished && (
        <footer className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <form onSubmit={submit} className="flex gap-2">
            <input
              className={`input ${shake ? 'animate-shake !border-bad' : ''}`}
              placeholder="Tape un terme flouté pour le révéler…"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              enterKeyHint="send"
              aria-label="Terme à retrouver"
            />
            <button type="submit" className="btn-primary shrink-0">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Valider</span>
            </button>
            <button type="button" className="btn-secondary shrink-0" onClick={revealAll} title="Tout révéler">
              <EyeOff className="h-4 w-4" />
              <span className="hidden sm:inline">Tout voir</span>
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}
