import { Download, LogOut, Play, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, Segmented, useToast } from '@/components/ui';
import { hasUnsyncedChanges, signOut } from '@/lib/auth';
import { clearLocalData } from '@/lib/db';
import { promptInstall, useInstall } from '@/lib/install';
import { exportAll } from '@/lib/repo';
import { updateSettings, useSettings, type Theme } from '@/lib/settings';
import { pickVoice, say, stopSpeaking, ttsSupported, useVoices } from '@/lib/speech';
import { useStore } from '@/lib/store';
import { authStore, supabaseEnabled } from '@/lib/supabase';
import { syncNow } from '@/lib/sync';

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const s = useSettings();
  const toast = useToast();
  const auth = useStore(authStore);
  const install = useInstall();
  const voices = useVoices();
  const frVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('fr'));

  const exportJson = async () => {
    const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `omnistudy-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const logout = async () => {
    if (await hasUnsyncedChanges()) {
      if (!navigator.onLine) {
        return toast('Des modifications ne sont pas encore synchronisées : reconnecte-toi à internet avant de te déconnecter.', 'error');
      }
      await syncNow();
      if (await hasUnsyncedChanges()) return toast('Synchronisation impossible pour le moment, réessaie.', 'error');
    }
    await signOut();
    toast('Déconnecté. Les données locales ont été effacées de cet appareil.', 'success');
  };

  const wipe = async () => {
    if (!confirm('Effacer toutes les données locales de cet appareil ? Les données déjà synchronisées restent sur ton compte.')) return;
    await clearLocalData();
    toast('Données locales effacées.', 'success');
  };

  const testVoice = () => {
    stopSpeaking();
    void say('Bonjour ! Voici un aperçu de la voix et de la vitesse de lecture.', { rate: s.ttsRate, voiceURI: s.voiceURI });
  };

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="space-y-8">
        <section>
          <h3 className="section-title">Apparence</h3>
          <div className="card divide-y divide-line">
            <Row title="Thème">
              <Segmented<Theme>
                value={s.theme}
                onChange={(theme) => updateSettings({ theme })}
                options={[
                  { value: 'system', label: 'Auto' },
                  { value: 'light', label: 'Clair' },
                  { value: 'dark', label: 'Sombre' },
                ]}
              />
            </Row>
            {install.evt && !install.installed && (
              <Row title="Installer l'application" hint="Accès direct depuis l'écran d'accueil, plein écran, hors-ligne.">
                <button className="btn-secondary" onClick={() => void promptInstall()}>
                  <Download className="h-4 w-4" /> Installer
                </button>
              </Row>
            )}
          </div>
        </section>

        <section>
          <h3 className="section-title">Audio</h3>
          <div className="card divide-y divide-line">
            {!ttsSupported() ? (
              <Row title="Synthèse vocale indisponible sur ce navigateur" children={null} />
            ) : (
              <>
                <Row title="Vitesse de lecture">
                  <Segmented
                    value={String(s.ttsRate)}
                    onChange={(v) => updateSettings({ ttsRate: Number(v) })}
                    options={['1', '1.25', '1.5'].map((v) => ({ value: v, label: `${v}×` }))}
                  />
                </Row>
                <Row title="Voix" hint="Les voix « locales » fonctionnent sans connexion.">
                  <div className="flex items-center gap-2">
                    <select
                      className="input !w-48"
                      value={s.voiceURI ?? ''}
                      onChange={(e) => updateSettings({ voiceURI: e.target.value || null })}
                    >
                      <option value="">Automatique{pickVoice(voices, null) ? ` (${pickVoice(voices, null)?.name})` : ''}</option>
                      {(frVoices.length ? frVoices : voices).map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} {v.localService ? '' : '· en ligne'}
                        </option>
                      ))}
                    </select>
                    <button className="btn-icon" aria-label="Tester la voix" onClick={testVoice}>
                      <Play className="h-4 w-4" />
                    </button>
                  </div>
                </Row>
                <Row title="Interro vocale : temps de réflexion" hint="Silence entre la question et la réponse.">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={3}
                      max={20}
                      value={s.interroSeconds}
                      onChange={(e) => updateSettings({ interroSeconds: Number(e.target.value) })}
                      className="w-32 accent-[rgb(var(--accent))]"
                    />
                    <span className="w-10 text-right text-sm tabular-nums">{s.interroSeconds} s</span>
                  </div>
                </Row>
                <Row title="Lire les options des QCM">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                    checked={s.interroReadOptions}
                    onChange={(e) => updateSettings({ interroReadOptions: e.target.checked })}
                  />
                </Row>
                <Row title="Lire l'explication après la réponse">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                    checked={s.interroReadExplanation}
                    onChange={(e) => updateSettings({ interroReadExplanation: e.target.checked })}
                  />
                </Row>
              </>
            )}
          </div>
        </section>

        <section>
          <h3 className="section-title">Compte & données</h3>
          <div className="card divide-y divide-line">
            {supabaseEnabled ? (
              auth.userId ? (
                <Row title={auth.email ?? 'Connecté'} hint="Synchronisation automatique entre tes appareils.">
                  <button className="btn-secondary" onClick={() => void logout()}>
                    <LogOut className="h-4 w-4" /> Se déconnecter
                  </button>
                </Row>
              ) : (
                <Row title="Non connecté" hint="Connecte-toi pour synchroniser et utiliser l'IA.">
                  <Link to="/auth" className="btn-primary">
                    Se connecter
                  </Link>
                </Row>
              )
            ) : (
              <Row title="Mode local" hint="Supabase n'est pas configuré : les données restent sur cet appareil." children={null} />
            )}
            <Row title="Exporter mes données" hint="Sauvegarde JSON complète.">
              <button className="btn-secondary" onClick={() => void exportJson()}>
                <Download className="h-4 w-4" /> Exporter
              </button>
            </Row>
            <Row title="Effacer les données locales" hint="Ne supprime pas les données du compte.">
              <button className="btn-danger" onClick={() => void wipe()}>
                <Trash2 className="h-4 w-4" /> Effacer
              </button>
            </Row>
          </div>
        </section>
      </div>
    </>
  );
}
