import { ArrowLeft, FileText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QuickStart } from '@/components/QuickStart';
import { SubjectForm } from '@/components/SubjectForm';
import { EmptyState, Loading, PageHeader, ProgressBar, useToast } from '@/components/ui';
import { countdownLabel, daysUntil, formatDate } from '@/lib/date';
import { useCards, useCourses, useSubject } from '@/lib/hooks';
import { deleteSubject } from '@/lib/repo';
import { subjectStats } from '@/lib/stats';
import { excerpt } from '@/lib/text';

export default function SubjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const subject = useSubject(id);
  const courses = useCourses(id);
  const cards = useCards({ subjectId: id });
  const [editing, setEditing] = useState(false);

  const st = useMemo(() => subjectStats(cards ?? []), [cards]);

  if (subject === undefined || !courses || !cards) return <Loading />;
  if (subject === null) {
    return (
      <EmptyState title="Matière introuvable" text="Elle a peut-être été supprimée sur un autre appareil.">
        <Link to="/subjects" className="btn-secondary">
          Retour aux matières
        </Link>
      </EmptyState>
    );
  }

  const remove = async () => {
    if (!confirm(`Supprimer « ${subject.name} » avec ses ${courses.length} cours et ${cards.length} cartes ?`)) return;
    await deleteSubject(subject.id);
    toast('Matière supprimée.', 'success');
    nav('/subjects', { replace: true });
  };

  return (
    <>
      <PageHeader
        back={
          <Link to="/subjects" className="btn-ghost -ml-3 !px-3 !py-1">
            <ArrowLeft className="h-4 w-4" /> Matières
          </Link>
        }
        title={
          <span className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: subject.color }} />
            {subject.name}
          </span>
        }
        subtitle={
          subject.examDate != null && daysUntil(subject.examDate) >= 0
            ? `Examen le ${formatDate(subject.examDate)} · ${countdownLabel(subject.examDate)}`
            : 'Pas de date d’examen'
        }
        actions={
          <>
            <button className="btn-icon" aria-label="Modifier" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn-icon hover:!text-bad" aria-label="Supprimer" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        }
      />

      <div className="space-y-6">
        <section className="card-pad grid grid-cols-3 gap-4 text-center">
          {[
            ['Cartes', st.total],
            ['Acquises', st.acquired],
            ['À revoir', st.due],
          ].map(([label, n]) => (
            <div key={label as string}>
              <p className="text-2xl font-semibold tabular-nums">{n}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
          <div className="col-span-3">
            <ProgressBar value={st.progress} color={subject.color} />
          </div>
        </section>

        <QuickStart compact defaultSubjectId={subject.id} />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-title !mb-0">Cours</h3>
            <Link to={`/import?subject=${subject.id}`} className="btn-secondary !py-1.5">
              <Plus className="h-4 w-4" /> Importer
            </Link>
          </div>
          {courses.length === 0 ? (
            <EmptyState title="Aucun cours" text="Importe un PDF, un fichier .md / .txt ou colle tes notes.">
              <Link to={`/import?subject=${subject.id}`} className="btn-primary">
                <Plus className="h-4 w-4" /> Importer un cours
              </Link>
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-line">
              {courses.map((c) => {
                const n = cards.filter((k) => k.courseId === c.id).length;
                return (
                  <li key={c.id}>
                    <Link to={`/course/${c.id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-subtle">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{excerpt(c.content, 120)}</p>
                      </div>
                      {c.aiStatus === 'done' ? (
                        <span className="chip shrink-0">
                          <Sparkles className="h-3 w-3" /> {n} cartes
                        </span>
                      ) : (
                        <span className="chip shrink-0">Sans IA</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {editing && <SubjectForm open onClose={() => setEditing(false)} subject={subject} />}
    </>
  );
}
