import { CalendarDays, Flame, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { QuickStart } from '@/components/QuickStart';
import { EmptyState, Loading, PageHeader, ProgressBar } from '@/components/ui';
import { countdownLabel, daysUntil, formatShortDate } from '@/lib/date';
import { useCards, useSessions, useSubjects } from '@/lib/hooks';
import { computeStreak, last7Days, subjectStats, todayStats } from '@/lib/stats';

function greeting(): string {
  const h = new Date().getHours();
  return h < 6 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

export default function Dashboard() {
  const subjects = useSubjects();
  const cards = useCards();
  const sessions = useSessions();

  const data = useMemo(() => {
    if (!subjects || !cards || !sessions) return null;
    const upcoming = subjects
      .filter((s) => s.examDate != null && daysUntil(s.examDate) >= 0)
      .sort((a, b) => (a.examDate as number) - (b.examDate as number))
      .slice(0, 3);
    const per = subjects.map((s) => ({ s, st: subjectStats(cards.filter((c) => c.subjectId === s.id)) }));
    const all = subjectStats(cards);
    return { upcoming, per, all, streak: computeStreak(sessions), week: last7Days(sessions), today: todayStats(sessions) };
  }, [subjects, cards, sessions]);

  if (!data) return <Loading />;

  if (!data.per.length) {
    return (
      <>
        <PageHeader title={`${greeting()} 👋`} subtitle="Bienvenue sur OmniStudy." />
        <EmptyState
          title="Commence par créer une matière"
          text="Ajoute un cours (PDF, Markdown, texte ou notes collées) : l'IA génère synthèse, quiz et audio. Tout fonctionne ensuite hors-ligne."
        >
          <Link to="/import" className="btn-primary">
            <Plus className="h-4 w-4" /> Importer un cours
          </Link>
          <Link to="/subjects" className="btn-secondary">
            Créer une matière
          </Link>
        </EmptyState>
      </>
    );
  }

  const max = Math.max(1, ...data.week.map((d) => d.count));

  return (
    <>
      <PageHeader
        title={`${greeting()} 👋`}
        subtitle={
          data.today.reviewed > 0
            ? `${data.today.reviewed} révision${data.today.reviewed > 1 ? 's' : ''} aujourd'hui — continue comme ça.`
            : data.all.due > 0
              ? `${data.all.due} carte${data.all.due > 1 ? 's' : ''} à réviser aujourd'hui.`
              : 'Rien d’urgent : une micro-session entretient la mémoire.'
        }
        actions={
          <span
            className="chip !px-2.5 !py-1.5 !text-sm"
            title={data.streak ? `${data.streak} jour(s) consécutif(s)` : 'Révise aujourd’hui pour démarrer une série'}
          >
            <Flame className={`h-3.5 w-3.5 ${data.streak ? 'text-warn' : ''}`} />
            <span className="tabular-nums">{data.streak}</span>
          </span>
        }
      />

      <div className="space-y-6">
        <QuickStart compact />

        <div className="grid gap-6 md:grid-cols-5">
          {/* Prochains examens */}
          <section className="md:col-span-2">
            <h3 className="section-title">Prochains examens</h3>
            {data.upcoming.length ? (
              <ul className="card divide-y divide-line">
                {data.upcoming.map((s) => {
                  const d = daysUntil(s.examDate as number);
                  return (
                    <li key={s.id}>
                      <Link to={`/subject/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-muted">{formatShortDate(s.examDate as number)}</p>
                        </div>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            d <= 1 ? 'bg-bad/15 text-bad' : d <= 7 ? 'bg-warn/15 text-warn' : 'bg-subtle text-muted'
                          }`}
                        >
                          {countdownLabel(s.examDate as number)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="card flex items-center gap-3 px-4 py-4 text-sm text-muted">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span>Ajoute une date d'examen à une matière pour activer le compte à rebours.</span>
              </div>
            )}
          </section>

          {/* Progression */}
          <section className="md:col-span-3">
            <h3 className="section-title">Progression par matière</h3>
            <ul className="card divide-y divide-line">
              {data.per.map(({ s, st }) => (
                <li key={s.id}>
                  <Link to={`/subject/${s.id}`} className="block px-4 py-3 hover:bg-subtle">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
                      {st.due > 0 && <span className="text-xs text-muted">{st.due} à revoir</span>}
                      <span className="w-10 text-right text-xs tabular-nums text-muted">
                        {st.total ? `${Math.round(st.progress * 100)} %` : '—'}
                      </span>
                    </div>
                    <ProgressBar value={st.progress} color={s.color} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Activité 7 jours */}
        <section>
          <h3 className="section-title">7 derniers jours</h3>
          <div className="card-pad flex items-end justify-between gap-2" aria-label="Activité des 7 derniers jours">
            {data.week.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-16 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-[28px] rounded-md transition-all ${d.count ? 'bg-accent' : 'bg-subtle'}`}
                    style={{ height: `${Math.max(8, (d.count / max) * 100)}%`, opacity: d.count ? 0.35 + 0.65 * (d.count / max) : 1 }}
                    title={`${d.count} révision(s)`}
                  />
                </div>
                <span className={`text-[11px] uppercase ${d.today ? 'font-semibold text-fg' : 'text-muted'}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
