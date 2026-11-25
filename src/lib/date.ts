export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Clé locale "YYYY-MM-DD" */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Nombre de jours calendaires entre aujourd'hui et t (négatif si passé). */
export function daysUntil(t: number, now = Date.now()): number {
  return Math.round((startOfDay(t) - startOfDay(now)) / DAY);
}

export function countdownLabel(t: number, now = Date.now()): string {
  const d = daysUntil(t, now);
  if (d < 0) return 'Passé';
  if (d === 0) return "Aujourd'hui";
  return `J-${d}`;
}

export function toDateInput(t: number | null): string {
  if (t == null) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → midi local (évite les décalages de fuseau/DST). */
export function fromDateInput(s: string): number | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

export function formatDate(t: number): string {
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatShortDate(t: number): string {
  return new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${pad(s % 60)}` : `${m} min`;
}

export function relativeTime(t: number, now = Date.now()): string {
  const diff = Math.round((now - t) / 1000);
  if (diff < 45) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  return `il y a ${Math.round(diff / 86400)} j`;
}
