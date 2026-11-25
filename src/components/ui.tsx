import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ── Toasts ──────────────────────────────────────────────────────────────────
type ToastKind = 'info' | 'success' | 'error';
type PushToast = (message: string, kind?: ToastKind) => void;

const ToastCtx = createContext<PushToast>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const push = useCallback<PushToast>((message, kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md animate-fade-in items-start gap-2.5 rounded-xl border border-line bg-bg px-4 py-3 text-sm shadow-lg"
          >
            {t.kind === 'success' ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            ) : t.kind === 'error' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-bottom w-full max-w-md animate-fade-in rounded-t-2xl border border-line bg-bg p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2>{title}</h2>
          <button className="btn-icon -mr-2" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Divers ──────────────────────────────────────────────────────────────────
export function ProgressBar({ value, color, className = '' }: { value: number; color?: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 overflow-hidden rounded-full bg-subtle ${className}`}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color ?? 'rgb(var(--accent))' }}
      />
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {back && <div className="mb-2">{back}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16 text-muted">
      <Spinner className="h-5 w-5" />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
