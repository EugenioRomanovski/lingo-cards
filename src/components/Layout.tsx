// App shell (design.md §4): mobile TopBar + bottom tab bar; desktop sidebar 240px.
// Uses the nested-route pattern: Layout renders <Outlet/>, App.tsx nests routes inside.

import { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { BarChart3, BookOpen, Download, Home, Moon, PlayCircle, Sun, Waypoints } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useAppStore } from '@/store/useAppStore';
import { computeStatus } from '@/lib/progress';
import { cn } from '@/lib/utils';

const NAV_ITEMS: { to: string; label: string; icon: typeof Home; match: string; end?: boolean }[] = [
  { to: '/', label: 'Главная', icon: Home, match: '/', end: true },
  { to: '/train/setup', label: 'Тренировка', icon: PlayCircle, match: '/train' },
  { to: '/library', label: 'Библиотека', icon: BookOpen, match: '/library' },
  { to: '/graph', label: 'Граф', icon: Waypoints, match: '/graph' },
  { to: '/stats', label: 'Статистика', icon: BarChart3, match: '/stats' },
];

function useDueCount(): number {
  const progress = useAppStore((s) => s.progress);
  return useMemo(() => {
    let n = 0;
    for (const p of progress.values()) if (computeStatus(p) === 'due') n++;
    return n;
  }, [progress]);
}

function ThemeToggleRow() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    </button>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const dueCount = useDueCount();
  // Focus mode (design.md §4): no sidebar/tab bar during a training session or onboarding.
  const focusMode = pathname.startsWith('/train/session') || pathname.startsWith('/welcome');

  if (focusMode) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh]">
      {/* Desktop sidebar (>=1024px) */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-5 pt-5 pb-6">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-7 w-7 text-ink" />
          <span className="font-display text-[18px] font-semibold tracking-[-0.01em]">Lingo Cards</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => {
            const active = rest.end ? pathname === to : pathname.startsWith(rest.match);
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  active ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                <span className="relative">
                  <Icon className="h-[18px] w-[18px]" />
                  {label === 'Тренировка' && dueCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-st-due px-1 font-mono text-[10px] font-semibold text-white">
                      {dueCount}
                    </span>
                  )}
                </span>
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="flex flex-col gap-1 border-t border-border p-3">
          <ThemeToggleRow />
          <Link
            to="/stats#settings"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Download className="h-[18px] w-[18px]" />
            Экспорт прогресса
          </Link>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 pb-24 lg:pb-0">
          <Outlet />
        </main>
        <div className="hidden lg:block">
          <Footer />
        </div>
      </div>

      {/* Mobile bottom tab bar (<1024px) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-[12px] lg:hidden"
        aria-label="Основная навигация"
      >
        <div className="grid h-16 grid-cols-5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => {
            const active = rest.end ? pathname === to : pathname.startsWith(rest.match);
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 text-[11px] font-bold tracking-[0.02em] transition-colors',
                  active ? 'text-terra' : 'text-ink-faint',
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                  {label === 'Тренировка' && dueCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-st-due px-1 font-mono text-[10px] font-semibold text-white">
                      {dueCount}
                    </span>
                  )}
                </span>
                {label}
                {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-terra" />}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
