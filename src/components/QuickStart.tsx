import { AudioLines, Brain, EyeOff, Flame, Layers, Play, Zap, Timer, Infinity as InfinityIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from './ui';
import { db } from '@/lib/db';
import { daysUntil } from '@/lib/date';
import { useCards, useSubjects } from '@/lib/hooks';
import { PACE_CONFIG, buildQueue } from '@/lib/srs';
import type { Pace, SessionMode } from '@/lib/types';

const PACES: { value: Pace; icon: typeof Zap; sub: string }[] = [
  { value: 'express', icon: Zap, sub: '2 min' },
  { value: 'focus', icon: Timer, sub: '10 min' },
  { value: 'free', icon: InfinityIcon, sub: 'à ton rythme' },
  { value: 'urgent', icon: Flame, sub: 'J-1' },
];

const FORMATS: { value: SessionMode; label: string; icon: typeof Layers; hint: string }[] = [
  { value: 'cards', label: 'Cartes & quiz', icon: Layers, hint: 'Répétition espacée' },
  { value: 'blur', label: 'Blur-Recall', icon: EyeOff, hint: 'Rappel flou' },
  { value: 'podcast', label: 'Podcast', icon: AudioLines, hint: 'Écoute continue' },
  { value: 'voice', label: 'Interro vocale', icon: Brain, hint: 'Questions à voix haute' },
];

/** Sélecteur rapide : durée / contexte + format → démarre une session en un clic. */
export function QuickStart({ compact = false, defaultSubjectId = null }: { compact?: boolean; defaultSubjectId?: string | null }) {
  const nav = useNavigate();
  const toast = useToast();
  const subjects = useSubjects();
  const cards = useCards();

  // Examen dans ≤ 1 jour → on propose directement le mode urgence
  const urgentSuggested = useMemo(
    () => !!subjects?.some((s) => s.examDate != null && daysUntil(s.examDate) >= 0 && daysUntil(s.examDate) <= 1),
    [subjects],
  );

  const [pace, setPace] = useState<Pace>('express');
  const [format, setFormat] = useState<SessionMode>('cards');
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ?? '');
  const [touched, setTouched] = useState(false);
  const [showOptions, setShowOptions] = useState(!compact);

  useEffect(() => {
    if (urgentSuggested && !touched) setPace('urgent');
  }, [urgentSuggested, touched]);

  const available = useMemo(
    () => (cards ? buildQueue(cards, { pace, subjectId: subjectId || null }).length : 0),
    [cards, pace, subjectId],
  );

  const start = async () => {
    const sid = subjectId || null;
    const q = new URLSearchParams({ pace });
    if (sid) q.set('subject', sid);

    if (format === 'cards') return nav(`/session?${q}`);
    if (format === 'podcast' || format === 'voice') {
      q.set('kind', format);
      return nav(`/audio?${q}`);
    }
    // Blur-Recall : cours de la matière dont l'examen est le plus proche
    const courses = (await db.courses.filter((c) => !c.deleted && (!sid || c.subjectId === sid) && c.content.length > 80).toArray());
    if (!courses.length) {
      toast("Importe d'abord un cours pour utiliser le Blur-Recall.", 'info');
      return nav('/import');
    }
    const exam = new Map((subjects ?? []).map((s) => [s.id, s.examDate ?? Infinity]));
    courses.sort((a, b) => (exam.get(a.subjectId) ?? Infinity) - (exam.get(b.subjectId) ?? Infinity) || Math.random() - 0.5);
    nav(`/recall/${courses[0].id}`);
  };

  return (
    <section className="card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>{compact ? 'Réviser maintenant' : 'Que veux-tu faire ?'}</h2>
        {urgentSuggested && (
          <span className="chip !bg-warn/15 !text-warn">
            <Flame className="h-3 w-3" /> Examen imminent
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Durée de la session">
        {PACES.map(({ value, icon: Icon, sub }) => (
          <button
            key={value}
            role="radio"
            aria-checked={pace === value}
            data-active={pace === value}
            onClick={() => {
              setPace(value);
              setTouched(true);
            }}
            className="chip-btn !flex-col !items-start !gap-1 !py-2.5 text-left"
          >
            <Icon className="h-4 w-4" />
            <span className="text-fg">{PACE_CONFIG[value].label}</span>
            <span className="text-xs font-normal opacity-70">{sub}</span>
          </button>
        ))}
      </div>

      {showOptions && (
        <div className="mt-4 space-y-4">
          <div>
            <span className="label">Format</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Format de révision">
              {FORMATS.map(({ value, label, icon: Icon, hint }) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={format === value}
                  data-active={format === value}
                  onClick={() => setFormat(value)}
                  className="chip-btn !flex-col !items-start !gap-1 !py-2.5 text-left"
                  title={hint}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-fg">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="qs-subject">
              Matière
            </label>
            <select id="qs-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Toutes les matières</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn-primary btn-lg" onClick={() => void start()}>
          <Play className="h-4 w-4" /> Lancer une micro-session
        </button>
        {format === 'cards' && (
          <span className="text-sm text-muted">
            {available > 0 ? `${available} carte${available > 1 ? 's' : ''} prête${available > 1 ? 's' : ''}` : 'Aucune carte pour ce filtre'}
          </span>
        )}
        {compact && (
          <button className="btn-ghost ml-auto" onClick={() => setShowOptions((v) => !v)}>
            {showOptions ? 'Moins d’options' : 'Format & matière'}
          </button>
        )}
      </div>
    </section>
  );
}
