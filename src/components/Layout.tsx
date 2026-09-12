// Общий каркас страниц: TopBar (Navbar) + контент + MobileTabBar + Footer (скрыт на /train/session).

import { Outlet, useLocation, Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Home, Library, Waypoints } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/', label: 'Главная', icon: Home },
  { to: '/library', label: 'Библиотека', icon: Library },
  { to: '/graph', label: 'Граф', icon: Waypoints },
  { to: '/stats', label: 'Статистика', icon: BarChart3 },
];

function isTabActive(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function Layout() {
  const { pathname } = useLocation();
  const theme = useAppStore((s) => s.theme);
  const isTrainSession = pathname === '/train/session';

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {!isTrainSession && <Navbar />}

      <main className={cn('flex-1', !isTrainSession && 'pb-20 lg:pb-0')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {!isTrainSession && (
        <>
          {/* MobileTabBar: fixed, 64px, до lg */}
          <nav
            className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/85 backdrop-blur-[16px] lg:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            aria-label="Основная навигация"
          >
            <div className="flex h-16 items-stretch justify-around">
              {TABS.map(({ to, label, icon: Icon }) => {
                const active = isTabActive(to, pathname);
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex min-w-[64px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-[0.04em] transition-colors',
                      active ? 'text-terra' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`tab-pill-${theme}`}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="absolute inset-x-2 inset-y-1.5 rounded-xl bg-terra-soft"
                      />
                    )}
                    <Icon className="relative z-10 h-5 w-5" strokeWidth={1.75} />
                    <span className="relative z-10">{label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
          <div className="hidden lg:block">
            <Footer />
          </div>
        </>
      )}
    </div>
  );
}
