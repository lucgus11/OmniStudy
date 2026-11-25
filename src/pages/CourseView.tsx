import { ArrowLeft, EyeOff, Headphones, Pencil, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RichText } from '@/components/RichText';
import { EmptyState, Loading, PageHeader, Segmented, Spinner, useToast } from '@/components/ui';
import { generateForCourse } from '@/lib/generate';
import { useCards, useCourse, useOnline } from '@/lib/hooks';
import { deleteCard, deleteCourse, updateCourse } from '@/lib/repo';
import { useStore } from '@/lib/store';
import { authStore, supabaseEnabled } from '@/lib/supabase';
import { stripMarkers } from '@/lib/text';

type Tab = 'summary' | 'quiz' | 'source';

const TYPE_LABEL = { qcm: 'QCM', tf: 'V/F', open: 'Ouverte', match: 'Association' } as const;

export default function CourseView() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const course = useCourse(id);
  const cards = useCards({ courseId: id });
  const online = useOnline();
  const auth = useStore(authStore);
  const [tab, setTab] = useState<Tab>('summary');
  const [progress, setProgress] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');

  if (course === undefined || !cards) return <Loading />;
  if (course === null) {
    return (
      <EmptyState title="Cours introuvable">
        <Link to="/subjects" className="btn-secondary">
          Retour
        </Link>
      </EmptyState>
    );
  }

  const canAi = supabaseEnabled && !!auth.userId && online;
  const hasAi = course.aiStatus === 'done';

  const generate = async () => {
    if (hasAi && !confirm('Régénérer la synthèse et le quiz ? Ta progression sur les questions conservées est gardée.')) return;
    setProgress('Analyse IA…');
    try {
      const r = await generateForCourse(course.id, (p) => setProgress(`Analyse IA — partie ${p.part}/${p.parts}…`));
      toast(`${r.cards} question${r.cards > 1 ? 's' : ''} prête${r.cards > 1 ? 's' : ''} ✓${r.truncated ? ' (cours tronqué : trop long)' : ''}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Échec de la génération', 'error');
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    if (!confirm(`Supprimer « ${course.title} » et ses cartes ?`)) return;
    await deleteCourse(course.id);
    nav(`/subject/${course.subjectId}`, { replace: true });
  };

  const startEdit = () => {
    setDraft(course.content);
    setTitle(course.title);
    setEditing(true);
  };
  const saveEdit = async () => {
    await updateCourse(course.id, { content: draft, title: title.trim() || course.title });
    setEditing(false);
    toast('Cours mis à jour. Relance l’IA pour actualiser la synthèse.', 'success');
  };

  return (
    <>
      <PageHeader
        back={
          <Link to={`/subject/${course.subjectId}`} className="btn-ghost -ml-3 !px-3 !py-1">
            <ArrowLeft className="h-4 w-4" /> Matière
          </Link>
        }
        title={course.title}
        subtitle={`${course.source.toUpperCase()} · ${course.content.length.toLocaleString('fr-FR')} caractères · ${cards.length} carte${cards.length > 1 ? 's' : ''}`}
        actions={
          <>
            <Link to={`/recall/${course.id}`} className="btn-secondary">
              <EyeOff className="h-4 w-4" /> Blur-Recall
            </Link>
            <Link to={`/audio?course=${course.id}&kind=podcast`} className="btn-secondary">
              <Headphones className="h-4 w-4" /> Écouter
            </Link>
            <button className="btn-icon hover:!text-bad" aria-label="Supprimer" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={!canAi || !!progress} onClick={() => void generate()}>
          {progress ? <Spinner /> : hasAi ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {progress ?? (hasAi ? 'Régénérer avec l’IA' : 'Analyser avec l’IA')}
        </button>
        {!canAi && (
          <span className="text-xs text-muted">
            {!supabaseEnabled ? 'IA : configure Supabase + Vercel.' : !auth.userId ? 'IA : connecte-toi.' : 'IA : indisponible hors-ligne.'}
          </span>
        )}
        {course.aiStatus === 'error' && <span className="text-xs text-bad">La dernière analyse a échoué.</span>}
      </div>

      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'summary', label: 'Synthèse' },
            { value: 'quiz', label: `Quiz (${cards.length})` },
            { value: 'source', label: 'Cours' },
          ]}
        />
      </div>

      {tab === 'summary' &&
        (course.summary ? (
          <div className="space-y-6">
            <div className="card-pad">
              <RichText text={stripMarkers(course.summary)} />
            </div>
            {course.keywords.length > 0 && (
              <section>
                <h3 className="section-title">Glossaire</h3>
                <dl className="card divide-y divide-line">
                  {course.keywords.map((k) => (
                    <div key={k.term} className="px-4 py-3">
                      <dt className="text-sm font-medium">{k.term}</dt>
                      <dd className="mt-0.5 text-sm text-muted">{k.definition}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        ) : (
          <EmptyState icon={<Sparkles className="h-6 w-6" />} title="Pas encore de synthèse" text="Lance l'analyse IA pour générer la fiche, le Blur-Recall, le quiz et le script audio." />
        ))}

      {tab === 'quiz' &&
        (cards.length ? (
          <ul className="card divide-y divide-line">
            {cards.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <span className="chip mt-0.5 shrink-0">{TYPE_LABEL[c.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.question}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.type === 'match' ? `${c.pairs.length} paires` : c.answer}
                    {c.critical ? ' · ⚠ critique' : ''}
                  </p>
                </div>
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.mastery === 2 ? 'bg-ok' : c.mastery === 1 ? 'bg-warn' : 'bg-line'}`}
                  title={['À revoir / nouvelle', 'Moyen', 'Acquis'][c.mastery]}
                />
                <button className="btn-icon !h-7 !w-7" aria-label="Supprimer la carte" onClick={() => void deleteCard(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune question" text="Le quiz est généré par l'IA à partir du cours." />
        ))}

      {tab === 'source' &&
        (editing ? (
          <div className="space-y-3">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre" />
            <textarea className="input min-h-[360px] font-mono text-[13px] leading-relaxed" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(false)}>
                Annuler
              </button>
              <button className="btn-primary" onClick={() => void saveEdit()}>
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <div className="card-pad">
            <div className="mb-3 flex justify-end">
              <button className="btn-ghost !py-1" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </button>
            </div>
            <p className="whitespace-pre-wrap text-[14px] leading-7 text-muted">{course.content}</p>
          </div>
        ))}
    </>
  );
}
