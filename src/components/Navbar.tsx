// Global TopBar (home.md §1): 56px, sticky, blur on scroll, logo + theme toggle + settings.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Moon, Settings2, Sun } from 'lucide-react';
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
        'sticky top-0 z-50 h-14 bg-bg/80 backdrop-blur-[12px] transition-[border-color,box-shadow] duration-200',
        scrolled ? 'border-b border-border shadow-sm' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 lg:px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Lingo Cards — на главную">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-7 w-7 text-ink" />
          <span className="hidden font-display text-[18px] font-semibold tracking-[-0.01em] sm:inline">
            Lingo Cards
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
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
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
          >
            <Settings2 className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
