// Global TopBar: transparent at rest, glass material on scroll; glass capsule for actions (iOS 27).

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Moon, Settings2, Sun } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

export default function Navbar() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow,backdrop-filter] duration-300',
        scrolled
          ? 'bg-bg/70 shadow-[inset_0_-0.5px_0_var(--border)] backdrop-blur-[24px] backdrop-saturate-[180%]'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 lg:px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Lingo Cards — на главную">
          <Logo className="h-8 w-8 lg:hidden" />
          <span className="font-display text-[17px] font-bold tracking-[-0.02em] lg:hidden">
            Lingo Cards
          </span>
        </Link>

        <div className="glass flex items-center gap-0.5 rounded-full p-0.5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="pressable flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors duration-200 hover:bg-ink/[0.06]"
          >
            <span className="relative block h-5 w-5">
              <Sun
                className={cn(
                  'absolute inset-0 h-5 w-5 transition-all duration-200',
                  theme === 'dark' ? 'rotate-0 opacity-100' : 'rotate-[20deg] opacity-0',
                )}
              />
              <Moon
                className={cn(
                  'absolute inset-0 h-5 w-5 transition-all duration-200',
                  theme === 'dark' ? '-rotate-[20deg] opacity-0' : 'rotate-0 opacity-100',
                )}
              />
            </span>
          </button>
          <Link
            to="/stats#settings"
            aria-label="Настройки"
            className="pressable flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors duration-200 hover:bg-ink/[0.06]"
          >
            <Settings2 className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
