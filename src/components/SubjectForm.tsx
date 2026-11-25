import { useState } from 'react';
import { Modal } from './ui';
import { fromDateInput, toDateInput } from '@/lib/date';
import { createSubject, SUBJECT_COLORS, updateSubject } from '@/lib/repo';
import type { Subject } from '@/lib/types';

/** Création / édition d'une matière (nom, couleur, date d'examen). */
export function SubjectForm({
  open,
  onClose,
  subject,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  subject?: Subject;
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState(subject?.name ?? '');
  const [color, setColor] = useState(subject?.color ?? '');
  const [exam, setExam] = useState(toDateInput(subject?.examDate ?? null));
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const examDate = fromDateInput(exam);
      let id = subject?.id;
      if (subject) {
        await updateSubject(subject.id, { name: name.trim(), color: color || subject.color, examDate });
      } else {
        id = await createSubject({ name, color: color || undefined, examDate });
      }
      onSaved?.(id as string);
      if (!subject) {
        setName('');
        setColor('');
        setExam('');
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={subject ? 'Modifier la matière' : 'Nouvelle matière'}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label" htmlFor="subj-name">
            Nom
          </label>
          <input
            id="subj-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Droit des obligations"
            autoFocus
            required
            maxLength={80}
          />
        </div>
        <div>
          <label className="label" htmlFor="subj-exam">
            Date d'examen (optionnel)
          </label>
          <input id="subj-exam" type="date" className="input" value={exam} onChange={(e) => setExam(e.target.value)} />
          <p className="mt-1.5 text-xs text-muted">
            Active le compte à rebours et plafonne les révisions à la veille de l'examen.
          </p>
        </div>
        <div>
          <span className="label">Couleur</span>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Couleur ${c}`}
                aria-pressed={(color || subject?.color) === c}
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full ring-offset-2 ring-offset-bg transition aria-pressed:ring-2 aria-pressed:ring-fg"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
            {subject ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
