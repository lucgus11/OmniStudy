import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/ui';
import { initAuth } from './lib/auth';
import { resetStalePending } from './lib/generate';
import { initInstallPrompt } from './lib/install';
import { initTheme } from './lib/settings';
import { refreshPending, startSyncLoop } from './lib/sync';
import './index.css';

initTheme();
initInstallPrompt();
initAuth();
void resetStalePending().then(refreshPending);
startSyncLoop();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
);
