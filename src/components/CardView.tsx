import { AlertTriangle, Check, Eye, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isCloseEnough, shuffle } from '@/lib/text';
import type { Card, Grade, MatchPair } from '@/lib/types';

const TYPE_LABEL: Record<Card['type'], string> = {
  qcm: 'QCM',
  tf: 'Vrai / Faux',
  open: 'Question ouverte',
  match: 'Mini-jeu · Association',
};

const GRADES: { grade: Grade; label: string; key: string; cls: string }[] = [
  { grade: 0, label: 'À revoir', key: '1', cls: 'border-bad/40 text-bad hover:bg-bad/10' },
  { grade: 1, label: 'Moyen', key: '2', cls: 'border-warn/40 text-warn hover:bg-warn/10' },
  { grade: 2, label: 'Acquis', key: '3', cls: 'border-ok/40 text-ok hover:bg-ok/10' },
];

/** Mini-jeu : relier chaque notion à sa définition. */
function MatchGame({ pairs, onDone }: { pairs: MatchPair[]; onDone: (errors: number) => void }) {
  const rights = useMemo(() => shuffle(pairs.map((p, i) => ({ i, text: p.right }))), [pairs]);
  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState(0);
  const [flash, setFlash] = useState<{ l: number; r: number } | null>(null);

  const pickRight = (r: { i: number }) => {
    if (selected === null || matched.has(r.i)) return;
    if (r.i === selected) {
      const next = new Set(matched).add(selected);
      setMatched(next);
      setSelected(null);
      if (next.size === pairs.length) setTimeout(() => onDone(errors), 450);
    } else {
      setErrors((e) => e + 1);
      setFlash({ l: selected, r: r.i });
      setTimeout(() => setFlash(null), 450);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        {pairs.map((p, i) => (
          <button
            key={i}
            disabled={matched.has(i)}
            onClick={() => setSelected(i)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              matched.has(i)
                ? 'border-ok/40 bg-ok/10 text-ok'
                : selected === i
                  ? 'border-accent bg-accent/10'
                  : flash?.l === i
                    ? 'animate-shake border-bad/60 bg-bad/10'
                    : 'border-line hover:bg-subtle'
            }`}
          >
            {p.left}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {rights.map((r) => (
          <button
            key={r.i}
            disabled={matched.has(r.i) || selected === null}
            onClick={() => pickRight(r)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
              matched.has(r.i)
                ? 'border-ok/40 bg-ok/10 text-ok'
                : flash?.r === r.i
                  ? 'animate-shake border-bad/60 bg-bad/10'
                  : 'border-line hover:bg-subtle disabled:opacity-60 disabled:hover:bg-transparent'
            }`}
          >
            {r.text}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted sm:col-span-2">
        {matched.size}/{pairs.length} associés · {errors} erreur{errors > 1 ? 's' : ''} — choisis une notion à gauche,
        puis sa définition à droite.
      </p>
    </div>
  );
}

/**
 * Affiche une carte (QCM, Vrai/Faux, question ouverte, mini-jeu), révèle la réponse,
 * puis propose la notation SRS (raccourcis clavier 1 / 2 / 3).
 * À monter avec `key={card.id}` pour réinitialiser l'état entre deux cartes.
 */
export function CardView({ card, onGrade }: { card: Card; onGrade: (grade: Grade, correct: boolean | null) => void }) {
  const [picked, setPicked] = useState<string | null>(null); // QCM / VF
  const [typed, setTyped] = useState('');
  const [revealed, setRevealed] = useState(false); // question ouverte
  const [matchErrors, setMatchErrors] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const answered =
    card.type === 'open' ? revealed : card.type === 'match' ? matchErrors !== null : picked !== null;

  // Suggestion de note selon le résultat
  const correct: boolean | null = useMemo(() => {
    if (!answered) return null;
    if (card.type === 'qcm' || card.type === 'tf') return picked === card.answer;
    if (card.type === 'match') return (matchErrors ?? 0) === 0;
    return typed.trim() ? isCloseEnough(typed, card.answer) || null : null;
  }, [answered, card, picked, matchErrors, typed]);

  const suggested: Grade | null =
    card.type === 'match'
      ? matchErrors === null
        ? null
        : matchErrors === 0
          ? 2
          : matchErrors <= 2
            ? 1
            : 0
      : correct === true
        ? 2
        : correct === false
          ? 0
          : null;

  const choose = useCallback(
    (v: string) => {
      if (picked === null) setPicked(v);
    },
    [picked],
  );

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
      if (answered) {
        if (['1', '2', '3'].includes(e.key) && !typing) onGrade((Number(e.key) - 1) as Grade, correct);
        return;
      }
      if (typing && !(card.type === 'open' && e.key === 'Enter')) return;
      if (card.type === 'qcm' && /^[1-9]$/.test(e.key)) {
        const opt = card.options[Number(e.key) - 1];
        if (opt) choose(opt);
      } else if (card.type === 'tf') {
        if (e.key === '1' || e.key.toLowerCase() === 'v') choose('Vrai');
        if (e.key === '2' || e.key.toLowerCase() === 'f') choose('Faux');
      } else if (card.type === 'open' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setRevealed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, card, choose, correct, onGrade]);

  const optionClass = (opt: string) => {
    const base =
      'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition-colors disabled:cursor-default';
    if (picked === null) return `${base} border-line hover:bg-subtle active:bg-subtle`;
    if (opt === card.answer) return `${base} border-ok/50 bg-ok/10`;
    if (opt === picked) return `${base} border-bad/50 bg-bad/10`;
    return `${base} border-line opacity-60`;
  };

  return (
    <article className="animate-fade-in">
      <div className="mb-3 flex items-center gap-2">
        <span className="chip">{TYPE_LABEL[card.type]}</span>
        {card.critical && (
          <span className="chip !bg-warn/15 !text-warn">
            <AlertTriangle className="h-3 w-3" /> Point critique
          </span>
        )}
        {card.lapses > 0 && <span className="chip">{card.lapses} oubli{card.lapses > 1 ? 's' : ''}</span>}
      </div>

      <h2 className="text-lg font-medium leading-snug sm:text-xl">{card.question}</h2>

      <div className="mt-5">
        {card.type === 'qcm' && (
          <div className="space-y-2">
            {card.options.map((opt, i) => (
              <button key={opt} className={optionClass(opt)} disabled={picked !== null} onClick={() => choose(opt)}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-subtle text-xs font-semibold text-muted">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
                {picked !== null && opt === card.answer && <Check className="mt-0.5 h-4 w-4 text-ok" />}
                {picked !== null && opt === picked && opt !== card.answer && <X className="mt-0.5 h-4 w-4 text-bad" />}
              </button>
            ))}
          </div>
        )}

        {card.type === 'tf' && (
          <div className="grid grid-cols-2 gap-2">
            {['Vrai', 'Faux'].map((v) => (
              <button key={v} className={`${optionClass(v)} !justify-center font-medium`} disabled={picked !== null} onClick={() => choose(v)}>
                {v}
              </button>
            ))}
          </div>
        )}

        {card.type === 'open' && (
          <div className="space-y-3">
            {!revealed && (
              <>
                <input
                  ref={inputRef}
                  className="input"
                  placeholder="Ta réponse (facultatif) — Entrée pour vérifier"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setRevealed(true)}
                  autoComplete="off"
                />
                <button className="btn-secondary" onClick={() => setRevealed(true)}>
                  <Eye className="h-4 w-4" /> Afficher la réponse
                </button>
              </>
            )}
            {revealed && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">Réponse attendue</p>
                <p className="mt-1 text-[15px] font-medium">{card.answer}</p>
                {typed.trim() && (
                  <p className="mt-2 text-sm text-muted">
                    Ta réponse : « {typed} » {correct ? '— ✓ proche !' : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {card.type === 'match' && <MatchGame pairs={card.pairs} onDone={setMatchErrors} />}
      </div>

      {answered && card.explanation && (
        <p className="mt-4 rounded-xl bg-subtle px-4 py-3 text-sm text-muted">
          <span className="font-medium text-fg">À retenir · </span>
          {card.explanation}
        </p>
      )}

      {answered && (
        <div className="mt-6 animate-fade-in">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Comment c'était ?</p>
          <div className="grid grid-cols-3 gap-2">
            {GRADES.map(({ grade, label, key, cls }) => (
              <button
                key={grade}
                onClick={() => onGrade(grade, correct)}
                className={`btn border bg-bg py-3 ${cls} ${suggested === grade ? 'ring-2 ring-current/40' : ''}`}
              >
                {label}
                <kbd className="hidden rounded bg-subtle px-1.5 text-[10px] text-muted sm:inline">{key}</kbd>
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
