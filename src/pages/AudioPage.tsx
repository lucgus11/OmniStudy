import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PodcastPlayer, type Track } from '@/components/PodcastPlayer';
import { VoiceQuiz } from '@/components/VoiceQuiz';
import { Loading, PageHeader, Segmented } from '@/components/ui';
import { useCards, useCourses, useSubjects } from '@/lib/hooks';
import { PACE_CONFIG, buildQueue } from '@/lib/srs';
import { settingsStore, updateSettings, useSettings } from '@/lib/settings';
import { mdToSpeech } from '@/lib/text';
import type { Pace } from '@/lib/types';

type Kind = 'podcast' | 'voice';

/** Mode Audio : Podcast (lecture continue) ou Interro vocale (question → silence → réponse). */
export default function AudioPage() {
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get('kind') === 'voice' ? 'voice' : 'podcast';
  const pace = (['express', 'focus', 'free', 'urgent'].includes(params.get('pace') ?? '') ? params.get('pace') : 'free') as Pace;
  const subjectId = params.get('subject') || null;
  const courseId = params.get('course') || null;

  const subjects = useSubjects();
  const courses = useCourses();
  const cards = useCards();
  const settings = useSettings();
  const [run, setRun] = useState(0);

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
    setRun((x) => x + 1);
  };

  const tracks = useMemo<Track[]>(() => {
    if (!courses) return [];
    return courses
      .filter((c) => (!courseId || c.id === courseId) && (!subjectId || c.subjectId === subjectId))
      .map((c) => ({
        id: c.id,
        title: c.title,
        subjectId: c.subjectId,
        // script "mini-podcast" de l'IA, sinon synthèse, sinon cours brut
        text: c.audioScript || (c.summary ? mdToSpeech(c.summary) : mdToSpeech(c.content.slice(0, 6000))),
      }))
      .filter((t) => t.text.length > 40);
  }, [courses, courseId, subjectId]);

  const queue = useMemo(
    () => (cards ? buildQueue(cards, { pace, subjectId, courseId }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards === undefined, pace, subjectId, courseId, run],
  );

  if (!subjects || !courses || !cards) return <Loading />;

  return (
    <>
      <PageHeader title="Audio" subtitle="Écoute ou fais-toi interroger, sans les yeux — fonctionne hors-ligne." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={kind}
          onChange={(v) => setParam('kind', v)}
          options={[
            { value: 'podcast', label: 'Podcast' },
            { value: 'voice', label: 'Interro vocale' },
          ]}
        />
        <select
          className="input !w-auto"
          value={subjectId ?? ''}
          onChange={(e) => {
            const n = new URLSearchParams(params);
            n.delete('course');
            if (e.target.value) n.set('subject', e.target.value);
            else n.delete('subject');
            setParams(n, { replace: true });
            setRun((x) => x + 1);
          }}
          aria-label="Matière"
        >
          <option value="">Toutes les matières</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto" value={pace} onChange={(e) => setParam('pace', e.target.value)} aria-label="Durée">
          {(Object.keys(PACE_CONFIG) as Pace[]).map((p) => (
            <option key={p} value={p}>
              {PACE_CONFIG[p].label} · {PACE_CONFIG[p].hint}
            </option>
          ))}
        </select>
      </div>

      {kind === 'podcast' ? (
        <PodcastPlayer
          key={`${subjectId}-${courseId}-${pace}-${run}`}
          tracks={tracks}
          budgetSec={PACE_CONFIG[pace].seconds}
          pace={pace}
          subjectId={subjectId}
        />
      ) : (
        <>
          <VoiceQuiz key={`${subjectId}-${courseId}-${pace}-${run}`} cards={queue} pace={pace} subjectId={subjectId} />
          <div className="card-pad mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted">Réflexion</span>
              <input
                type="range"
                min={3}
                max={20}
                value={settings.interroSeconds}
                onChange={(e) => updateSettings({ interroSeconds: Number(e.target.value) })}
                className="w-28 accent-[rgb(var(--accent))]"
              />
              <span className="w-8 tabular-nums">{settings.interroSeconds} s</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.interroReadOptions}
                onChange={(e) => updateSettings({ interroReadOptions: e.target.checked })}
                className="accent-[rgb(var(--accent))]"
              />
              Lire les options du QCM
            </label>
            <span className="text-xs text-muted">Appliqué à la prochaine interro.</span>
          </div>
        </>
      )}

      {kind === 'podcast' && tracks.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          Aucun cours disponible. <Link to="/import" className="text-accent underline">Importer un cours</Link>.
        </p>
      )}
      {/* lecture du réglage pour éviter un import inutilisé si le store évolue */}
      <span hidden>{settingsStore.get().ttsRate}</span>
    </>
  );
}
