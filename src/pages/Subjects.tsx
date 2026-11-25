import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SubjectForm } from '@/components/SubjectForm';
import { EmptyState, Loading, PageHeader, ProgressBar } from '@/components/ui';
import { countdownLabel, daysUntil } from '@/lib/date';
import { useCards, useCourses, useSubjects } from '@/lib/hooks';
import { subjectStats } from '@/lib/stats';

export default function Subjects() {
  const subjects = useSubjects();
  const courses = useCourses();
  const cards = useCards();
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    if (!subjects || !courses || !cards) return null;
    return subjects.map((s) => ({
      s,
      courses: courses.filter((c) => c.subjectId === s.id).length,
      st: subjectStats(cards.filter((c) => c.subjectId === s.id)),
    }));
  }, [subjects, courses, cards]);

  if (!rows) return <Loading />;

  return (
    <>
      <PageHeader
        title="Matières"
        subtitle="Tes dossiers de cours et leurs examens."
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouvelle matière
          </button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Aucune matière" text="Crée un dossier par matière, avec sa date d'examen.">
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouvelle matière
          </button>
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ s, courses: n, st }) => (
            <li key={s.id}>
              <Link to={`/subject/${s.id}`} className="card block p-4 transition-colors hover:bg-subtle">
                <div className="flex items-start gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {n} cours · {st.total} carte{st.total > 1 ? 's' : ''}
                    </p>
                  </div>
                  {s.examDate != null && daysUntil(s.examDate) >= 0 && (
                    <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
                      {countdownLabel(s.examDate)}
                    </span>
                  )}
                </div>
                <ProgressBar value={st.progress} color={s.color} className="mt-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <SubjectForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
