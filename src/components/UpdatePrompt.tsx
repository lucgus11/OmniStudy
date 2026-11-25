import { RefreshCw, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Enregistre le service worker et signale "prêt hors-ligne" / "mise à jour disponible". */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000); // vérifie toutes les heures
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 4500);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed inset-x-0 top-3 z-[70] flex justify-center px-4 safe-top">
      <div className="flex animate-fade-in items-center gap-3 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm shadow-lg">
        {needRefresh ? (
          <>
            <RefreshCw className="h-4 w-4 text-accent" />
            <span>Nouvelle version disponible</span>
            <button className="btn-primary !px-3 !py-1" onClick={() => void updateServiceWorker(true)}>
              Mettre à jour
            </button>
            <button className="btn-ghost !px-2 !py-1" onClick={() => setNeedRefresh(false)}>
              Plus tard
            </button>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-ok" />
            <span>Prêt pour une utilisation hors-ligne</span>
          </>
        )}
      </div>
    </div>
  );
}
