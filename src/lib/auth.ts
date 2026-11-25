import type { Session } from '@supabase/supabase-js';
import { clearLocalData, countDirty } from './db';
import { authStore, supabase } from './supabase';
import { requestSync, syncNow } from './sync';

const UID_KEY = 'omni:uid';
const EMAIL_KEY = 'omni:email';

async function adopt(session: Session | null, event: string): Promise<void> {
  if (session?.user) {
    const prev = localStorage.getItem(UID_KEY);
    // Autre compte sur le même appareil : on repart d'une base propre (jamais de fuite entre comptes).
    if (prev && prev !== session.user.id) await clearLocalData();
    localStorage.setItem(UID_KEY, session.user.id);
    localStorage.setItem(EMAIL_KEY, session.user.email ?? '');
    authStore.set({ ready: true, userId: session.user.id, email: session.user.email ?? null });
    requestSync(0);
    return;
  }
  if (event === 'SIGNED_OUT') {
    localStorage.removeItem(UID_KEY);
    localStorage.removeItem(EMAIL_KEY);
    authStore.set({ ready: true, userId: null, email: null });
    return;
  }
  // Pas de session lisible : hors-ligne on garde l'identité en cache, sinon on est déconnecté.
  if (!navigator.onLine && localStorage.getItem(UID_KEY)) {
    authStore.set({ ready: true });
  } else {
    authStore.set({ ready: true, userId: null, email: null });
  }
}

/** À appeler une fois au démarrage. */
export function initAuth(): void {
  if (!supabase) {
    authStore.set({ ready: true });
    return;
  }
  supabase.auth.onAuthStateChange((event, session) => {
    // différé : ne jamais appeler d'autre méthode Supabase de façon synchrone dans ce callback
    setTimeout(() => void adopt(session, event), 0);
  });
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
}

/** Retourne true si une confirmation par e-mail est nécessaire. */
export async function signUp(email: string, password: string): Promise<boolean> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(translateAuthError(error.message));
  return !data.session;
}

export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function resetPassword(email: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw new Error(translateAuthError(error.message));
}

/**
 * Déconnexion : synchronise d'abord (si possible), puis efface les données locales
 * pour qu'un autre compte ne puisse pas les voir sur cet appareil.
 */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  if (navigator.onLine) await syncNow();
  await supabase.auth.signOut();
  await clearLocalData();
  localStorage.removeItem(UID_KEY);
  localStorage.removeItem(EMAIL_KEY);
  authStore.set({ ready: true, userId: null, email: null });
}

/** true s'il reste des modifications non synchronisées (à signaler avant déconnexion). */
export async function hasUnsyncedChanges(): Promise<boolean> {
  return (await countDirty()) > 0;
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Cet e-mail a déjà un compte.';
  if (m.includes('password') && m.includes('6')) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('email not confirmed')) return "E-mail non confirmé : clique sur le lien reçu par e-mail.";
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives, réessaie dans quelques minutes.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Pas de connexion internet.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Adresse e-mail invalide.';
  return msg;
}
