import { FileText, FileUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SubjectForm } from '@/components/SubjectForm';
import { PageHeader, Segmented, Spinner, useToast } from '@/components/ui';
import { generateForCourse } from '@/lib/generate';
import { useOnline, useSubjects } from '@/lib/hooks';
import { createCourse } from '@/lib/repo';
import { useStore } from '@/lib/store';
import { authStore, supabaseEnabled } from '@/lib/supabase';
import type { Source } from '@/lib/types';

interface Draft {
  key: string;
  title: string;
  content: string;
  source: Source;
  note?: string;
}

const ACCEPT = '.pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown';
const MAX_BYTES = 40 * 1024 * 1024;
const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');

export default function Import() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const subjects = useSubjects();
  const online = useOnline();
  const auth = useStore(authStore);

  const [subjectId, setSubjectId] = useState(params.get('subject') ?? '');
  const [newSubject, setNewSubject] = useState(false);
  const [tab, setTab] = useState<'files' | 'paste'>('files');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [reading, setReading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!subjectId && subjects?.length === 1) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  const aiAvailable = supabaseEnabled && !!auth.userId && online;

  const readFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        try {
          if (file.size > MAX_BYTES) throw new Error('fichier trop volumineux (> 40 Mo)');
          if (ext === 'pdf' || file.type === 'application/pdf') {
            setReading(`${file.name} — extraction du texte…`);
            const { extractPdfText } = await import('@/lib/pdf');
            const r = await extractPdfText(file, (p, t) => setReading(`${file.name} — page ${p}/${t}`));
            if (r.text.length < 40) {
              toast(`« ${file.name} » ne contient pas de texte (PDF scanné ?). Une reconnaissance de texte (OCR) serait nécessaire.`, 'error');
              continue;
            }
            setDrafts((d) => [
              ...d,
              {
                key: crypto.randomUUID(),
                title: stripExt(file.name),
                content: r.text,
                source: 'pdf',
                note: `${r.pages} page${r.pages > 1 ? 's' : ''}${r.emptyPages ? ` · ${r.emptyPages} sans texte` : ''}`,
              },
            ]);
          } else if (['md', 'markdown', 'txt'].includes(ext) || file.type.startsWith('text/')) {
            const text = (await file.text()).replace(/^﻿/, '');
            if (!text.trim()) throw new Error('fichier vide');
            setDrafts((d) => [
              ...d,
              {
                key: crypto.randomUUID(),
                title: stripExt(file.name),
                content: text,
                source: ext === 'txt' ? 'txt' : 'md',
              },
            ]);
          } else {
            throw new Error('format non pris en charge (PDF, .md ou .txt)');
          }
        } catch (e) {
          toast(`« ${file.name} » : ${e instanceof Error ? e.message : 'lecture impossible'}`, 'error');
        }
      }
      setReading(null);
    },
    [toast],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFiles([...e.dataTransfer.files]);
  };

  const all: Draft[] = [
    ...drafts,
    ...(pasteText.trim() ? [{ key: 'paste', title: pasteTitle || 'Notes', content: pasteText, source: 'paste' as Source }] : []),
  ];
  const totalChars = all.reduce((a, d) => a + d.content.length, 0);

  const submit = async () => {
    if (!subjectId) return toast('Choisis (ou crée) une matière.', 'error');
    if (!all.length) return toast('Ajoute au moins un cours.', 'error');
    setBusy('Enregistrement…');
    try {
      const ids: string[] = [];
      for (const d of all) {
        ids.push(await createCourse({ subjectId, title: d.title, content: d.content, source: d.source }));
      }
      if (useAi && aiAvailable) {
        let failed = 0;
        for (let i = 0; i < ids.length; i++) {
          try {
            await generateForCourse(ids[i], (p) =>
              setBusy(`Analyse IA ${ids.length > 1 ? `(cours ${i + 1}/${ids.length}) ` : ''}— partie ${p.part}/${p.parts}…`),
            );
          } catch (e) {
            failed += 1;
            toast(`IA : ${e instanceof Error ? e.message : 'échec'}`, 'error');
          }
        }
        if (!failed) toast('Cours importés et analysés ✓', 'success');
      } else {
        toast(
          useAi
            ? "Cours enregistrés. L'IA nécessite d'être connecté et en ligne — tu pourras la lancer plus tard."
            : 'Cours enregistrés.',
          'success',
        );
      }
      nav(ids.length === 1 ? `/course/${ids[0]}` : `/subject/${subjectId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur', 'error');
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Importer un cours" subtitle="PDF, Markdown, texte ou notes collées — tout reste utilisable hors-ligne." />

      <div className="space-y-5">
        {/* Matière */}
        <div>
          <label className="label" htmlFor="imp-subject">
            Matière
          </label>
          <div className="flex gap-2">
            <select id="imp-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">— Choisir —</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary shrink-0" onClick={() => setNewSubject(true)}>
              <Plus className="h-4 w-4" /> Nouvelle
            </button>
          </div>
        </div>

        <Segmented
          label="Mode d'import"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'files', label: 'Fichiers' },
            { value: 'paste', label: 'Copier-coller' },
          ]}
        />

        {tab === 'files' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? 'border-accent bg-accent/5' : 'border-line'
            }`}
          >
            <FileUp className="mx-auto h-7 w-7 text-muted" />
            <p className="mt-3 text-sm font-medium">Glisse tes fichiers ici</p>
            <p className="mt-1 text-xs text-muted">PDF (plusieurs possibles), .md, .txt</p>
            <button className="btn-secondary mt-4" onClick={() => fileRef.current?.click()} disabled={!!reading}>
              Parcourir…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                void readFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            {reading && (
              <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
                <Spinner /> {reading}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              className="input"
              placeholder="Titre (ex. Chapitre 3 — La photosynthèse)"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
            />
            <textarea
              className="input min-h-[260px] resize-y font-mono text-[13px] leading-relaxed"
              placeholder="Colle ici tes notes brutes…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
          </div>
        )}

        {/* Fichiers lus */}
        {drafts.length > 0 && (
          <ul className="card divide-y divide-line">
            {drafts.map((d) => (
              <li key={d.key} className="flex items-center gap-3 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <input
                    className="w-full truncate bg-transparent text-sm font-medium outline-none focus:underline"
                    value={d.title}
                    onChange={(e) => setDrafts((x) => x.map((y) => (y.key === d.key ? { ...y, title: e.target.value } : y)))}
                    aria-label="Titre du cours"
                  />
                  <p className="text-xs text-muted">
                    {d.source.toUpperCase()} · {d.content.length.toLocaleString('fr-FR')} caractères
                    {d.note ? ` · ${d.note}` : ''}
                  </p>
                </div>
                <button className="btn-icon" aria-label="Retirer" onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* IA */}
        <label className={`card flex cursor-pointer items-start gap-3 p-4 ${!aiAvailable ? 'opacity-70' : ''}`}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" checked={useAi && aiAvailable} disabled={!aiAvailable} onChange={(e) => setUseAi(e.target.checked)} />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="h-4 w-4 text-accent" /> Analyser avec l'IA
            </span>
            <span className="mt-0.5 block text-muted">
              Fiche de synthèse, Blur-Recall, quiz variés et script audio
              {totalChars > 12_000 ? ` · cours long : ${Math.ceil(totalChars / 12_000)} parties` : ''}.
              {!supabaseEnabled
                ? " Nécessite Supabase + Vercel (voir README)."
                : !auth.userId
                  ? ' Connecte-toi pour l’activer.'
                  : !online
                    ? ' Indisponible hors-ligne — à relancer depuis la page du cours.'
                    : ''}
            </span>
          </span>
        </label>

        <div className="flex justify-end">
          <button className="btn-primary btn-lg" disabled={!!busy || !!reading || !all.length || !subjectId} onClick={() => void submit()}>
            {busy ? (
              <>
                <Spinner /> {busy}
              </>
            ) : (
              `Importer ${all.length > 1 ? `${all.length} cours` : 'le cours'}`
            )}
          </button>
        </div>
      </div>

      {newSubject && <SubjectForm open onClose={() => setNewSubject(false)} onSaved={setSubjectId} />}
    </>
  );
}
