import { AlertCircle, Check, Cloud, CloudOff, HardDrive, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { relativeTime } from '@/lib/date';
import { useStore } from '@/lib/store';
import { authStore, supabaseEnabled } from '@/lib/supabase';
import { syncNow, syncStore } from '@/lib/sync';

/** Indicateur discret de l'état de synchronisation. */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const s = useStore(syncStore);
  const auth = useStore(authStore);

  const base = 'inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted';

  if (!supabaseEnabled || !auth.userId) {
    const inner = (
      <>
        <HardDrive className="h-3.5 w-3.5" />
        {!compact && <span>{supabaseEnabled ? 'Local · se connecter' : 'Local uniquement'}</span>}
      </>
    );
    return supabaseEnabled ? (
      <Link to="/auth" className={`${base} hover:bg-subtle`} title="Connecte-toi pour synchroniser tes appareils">
        {inner}
      </Link>
    ) : (
      <span className={base} title="Supabase non configuré : les données restent sur cet appareil">
        {inner}
      </span>
    );
  }

  let icon = <Check className="h-3.5 w-3.5 text-ok" />;
  let label = s.lastSyncAt ? `Synchronisé ${relativeTime(s.lastSyncAt)}` : 'Synchronisé';
  if (s.status === 'syncing') {
    icon = <RefreshCw className="h-3.5 w-3.5 animate-spin text-accent" />;
    label = 'Synchronisation…';
  } else if (s.status === 'offline') {
    icon = <CloudOff className="h-3.5 w-3.5 text-warn" />;
    label = s.pending ? `Hors-ligne · ${s.pending} en attente` : 'Hors-ligne';
  } else if (s.status === 'error') {
    icon = <AlertCircle className="h-3.5 w-3.5 text-bad" />;
    label = 'Erreur de synchro · réessayer';
  } else if (s.pending > 0) {
    icon = <Cloud className="h-3.5 w-3.5 text-accent" />;
    label = `${s.pending} modification${s.pending > 1 ? 's' : ''} en attente`;
  }

  return (
    <button
      className={`${base} hover:bg-subtle`}
      onClick={() => void syncNow()}
      title={s.error ?? 'Forcer la synchronisation'}
    >
      {icon}
      {!compact && <span className="truncate">{label}</span>}
    </button>
  );
}
