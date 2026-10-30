// App shell (iOS 27 / Liquid Glass): mobile glass TopBar + floating tab bar; desktop floating glass sidebar.
// Uses the nested-route pattern: Layout renders <Outlet/>, App.tsx nests routes inside.

import { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { BarChart3, BookOpen, Download, Home, Moon, PlayCircle, Sun, Waypoints } from 'lucide-react';
import Logo from '@/components/Logo';
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
      className="pressable flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] font-medium text-ink-muted transition-colors hover:bg-surface-2/70 hover:text-ink"
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
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 p-3 lg:block">
       <div className="glass flex h-full flex-col rounded-[28px]">
        <Link to="/" className="flex items-center gap-3 px-5 pt-5 pb-6">
          <Logo className="h-9 w-9" />
          <span className="font-display text-[19px] font-bold tracking-[-0.02em]">Lingo Cards</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => {
            const active = rest.end ? pathname === to : pathname.startsWith(rest.match);
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'pressable flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] font-semibold transition-colors',
                  active ? 'bg-terra text-white shadow-md' : 'text-ink hover:bg-surface-2/70',
                )}
              >
                <span className="relative">
                  <Icon className="h-[18px] w-[18px]" />
                  {label === 'Тренировка' && dueCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-st-weak px-1 font-mono text-[10px] font-bold text-white ring-2 ring-surface">
                      {dueCount}
                    </span>
                  )}
                </span>
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="mx-3 h-px bg-border" />
        <div className="flex flex-col gap-1 p-3">
          <ThemeToggleRow />
          <Link
            to="/stats#settings"
            className="pressable flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] font-medium text-ink-muted transition-colors hover:bg-surface-2/70 hover:text-ink"
          >
            <Download className="h-[18px] w-[18px]" />
            Экспорт прогресса
          </Link>
        </div>
       </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Outlet />
        </main>
        <div className="hidden lg:block">
          <Footer />
        </div>
      </div>

      {/* Mobile floating Liquid Glass tab bar (<1024px) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden"
        aria-label="Основная навигация"
      >
        <div className="glass-strong mx-auto grid h-[64px] max-w-[480px] grid-cols-5 rounded-full p-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => {
            const active = rest.end ? pathname === to : pathname.startsWith(rest.match);
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'pressable relative flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold tracking-[0.01em] transition-colors duration-200',
                  active ? 'bg-ink/[0.07] text-terra' : 'text-ink',
                )}
              >
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                  {label === 'Тренировка' && dueCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-st-weak px-1 font-mono text-[10px] font-bold text-white">
                      {dueCount}
                    </span>
                  )}
                </span>
                {label === 'Статистика' ? 'Прогресс' : label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
