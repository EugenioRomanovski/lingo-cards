import { Link } from 'react-router';
import Logo from '@/components/Logo';

export default function Footer() {
  return (
    <footer className="border-t border-border py-6">
      <div className="mx-auto flex max-w-[1080px] flex-col items-center justify-between gap-3 px-4 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint sm:flex-row lg:px-6">
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-4 text-ink-faint" />
          <span>Lingo Cards — термины сами себя не выучат</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link to="/library" className="transition-colors hover:text-ink-muted">
            Библиотека
          </Link>
          <Link to="/graph" className="transition-colors hover:text-ink-muted">
            Граф
          </Link>
          <Link to="/stats" className="transition-colors hover:text-ink-muted">
            Статистика
          </Link>
        </nav>
      </div>
    </footer>
  );
}
