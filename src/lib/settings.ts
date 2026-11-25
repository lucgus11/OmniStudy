import { createStore, useStore } from './store';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  /** vitesse de lecture audio (1, 1.25, 1.5…) */
  ttsRate: number;
  voiceURI: string | null;
  /** compte à rebours silencieux de l'interro vocale (secondes) */
  interroSeconds: number;
  interroReadOptions: boolean;
  interroReadExplanation: boolean;
}

const KEY = 'omni:settings';

const DEFAULTS: Settings = {
  theme: 'system',
  ttsRate: 1,
  voiceURI: null,
  interroSeconds: 8,
  interroReadOptions: true,
  interroReadExplanation: true,
};

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export const settingsStore = createStore<Settings>(load());

export function applyTheme(theme: Theme = settingsStore.get().theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settingsStore.get()));
  } catch {
    /* stockage plein ou indisponible : on garde la valeur en mémoire */
  }
  if (patch.theme) applyTheme(patch.theme);
}

export function initTheme(): void {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settingsStore.get().theme === 'system') applyTheme();
  });
}

export const useSettings = () => useStore(settingsStore);
