import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createStore } from './store';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** false → l'app fonctionne en mode 100 % local (aucune synchro). */
export const supabaseEnabled = Boolean(url && anon);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, anon as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // liens magiques / confirmation d'e-mail
        storageKey: 'omni:auth',
      },
    })
  : null;

export interface AuthState {
  /** true une fois la session locale lue (pas besoin du réseau) */
  ready: boolean;
  userId: string | null;
  email: string | null;
}

// Identité mise en cache : l'UI reste cohérente même hors-ligne.
const cachedId = typeof localStorage !== 'undefined' ? localStorage.getItem('omni:uid') : null;
const cachedEmail = typeof localStorage !== 'undefined' ? localStorage.getItem('omni:email') : null;

export const authStore = createStore<AuthState>({
  ready: !supabaseEnabled,
  userId: supabaseEnabled ? cachedId : null,
  email: supabaseEnabled ? cachedEmail : null,
});
