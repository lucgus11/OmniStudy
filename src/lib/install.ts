import { createStore, useStore } from './store';

/** Capture l'événement d'installation PWA pour proposer un bouton "Installer l'app". */
export const installStore = createStore<{ evt: BeforeInstallPromptEvent | null; installed: boolean }>({
  evt: null,
  installed: window.matchMedia('(display-mode: standalone)').matches,
});

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installStore.set({ evt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => installStore.set({ evt: null, installed: true }));
}

export async function promptInstall(): Promise<void> {
  const evt = installStore.get().evt;
  if (!evt) return;
  await evt.prompt();
  await evt.userChoice;
  installStore.set({ evt: null });
}

export const useInstall = () => useStore(installStore);
