import { Download, GraduationCap, Headphones, House, Library, Moon, Settings, Sun } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { SyncBadge } from './SyncBadge';
import { promptInstall, useInstall } from '@/lib/install';
import { updateSettings, useSettings } from '@/lib/settings';

const NAV = [
  { to: '/', label: 'Accueil', icon: House, end: true },
  { to: '/subjects', label: 'Matières', icon: Library, end: false },
  { to: '/study', label: 'Réviser', icon: GraduationCap, end: false },
  { to: '/audio', label: 'Audio', icon: Headphones, end: false },
  { to: '/settings', label: 'Réglages', icon: Settings, end: false },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/favicon.svg" alt="" className="h-6 w-6 rounded-md" />
      <span className="text-[15px] font-semibold tracking-tight">OmniStudy</span>
    </div>
  );
}

function ThemeToggle() {
  const { theme } = useSettings();
  const dark = document.documentElement.classList.contains('dark');
  return (
    <button
      className="btn-icon"
      aria-label="Changer de thème"
      title={theme === 'system' ? 'Thème : système' : theme === 'dark' ? 'Thème : sombre' : 'Thème : clair'}
      onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function Layout() {
  const install = useInstall();
  return (
    <div className="min-h-dvh md:flex">
      {/* ── Barre latérale (desktop) ── */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <Brand />
        <nav className="mt-6 flex flex-1 flex-col gap-0.5" aria-label="Navigation principale">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-subtle text-fg' : 'text-muted hover:bg-subtle hover:text-fg'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1">
          {install.evt && !install.installed && (
            <button className="btn-secondary w-full !justify-start" onClick={() => void promptInstall()}>
              <Download className="h-4 w-4" /> Installer l'app
            </button>
          )}
          <div className="flex items-center justify-between">
            <SyncBadge />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── Contenu ── */}
      <div className="min-w-0 flex-1">
        <div className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-2 backdrop-blur md:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            <SyncBadge compact />
            <ThemeToggle />
          </div>
        </div>
        <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10">
          <Outlet />
        </main>
      </div>

      {/* ── Barre de navigation (mobile) ── */}
      <nav
        aria-label="Navigation principale"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
