import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PageHeader, Segmented, Spinner, useToast } from '@/components/ui';
import { resetPassword, sendMagicLink, signInWithPassword, signUp } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { authStore, supabaseEnabled } from '@/lib/supabase';

type Mode = 'signin' | 'signup';

export default function Auth() {
  const auth = useStore(authStore);
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supabaseEnabled) {
    return (
      <>
        <PageHeader title="Connexion" />
        <p className="card-pad text-sm text-muted">
          Supabase n'est pas configuré. Renseigne <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> (voir README) pour activer les comptes et la synchronisation.
        </p>
      </>
    );
  }
  if (auth.userId) return <Navigate to="/" replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (mode === 'signin') {
        await signInWithPassword(email.trim(), password);
      } else {
        const needsConfirm = await signUp(email.trim(), password);
        if (needsConfirm) toast('Compte créé : clique sur le lien reçu par e-mail pour le confirmer.', 'success');
      }
    });
  };

  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title={mode === 'signin' ? 'Connexion' : 'Créer un compte'} subtitle="Synchronise tes cours sur tous tes appareils et active l'IA." />
      <div className="mb-5">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'signin', label: 'Connexion' },
            { value: 'signup', label: 'Inscription' },
          ]}
        />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            E-mail
          </label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="pwd">
            Mot de passe
          </label>
          <input
            id="pwd"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>
        {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner />} {mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <button
          className="text-muted underline-offset-2 hover:underline"
          disabled={busy || !email}
          onClick={() =>
            void run(async () => {
              await sendMagicLink(email.trim());
              toast('Lien de connexion envoyé par e-mail.', 'success');
            })
          }
        >
          Recevoir un lien magique
        </button>
        {mode === 'signin' && (
          <button
            className="text-muted underline-offset-2 hover:underline"
            disabled={busy || !email}
            onClick={() =>
              void run(async () => {
                await resetPassword(email.trim());
                toast('E-mail de réinitialisation envoyé.', 'success');
              })
            }
          >
            Mot de passe oublié ?
          </button>
        )}
      </div>
    </div>
  );
}
