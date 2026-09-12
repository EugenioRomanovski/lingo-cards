// Карточка термина (design/library.md §4). Route: `/library/:termId` (deep-link).
// Термин, этимология, определение, EN-близнец, связи, прогресс, заметка,
// избранное, «показать на графе», «повторить сейчас».

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  Loader,
  Repeat,
  Star,
  Waypoints,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { computeStatus, db, freshProgress, saveProgress } from '@/lib/progress';
import type { ProgressStatus } from '@/lib/progress';
import { indexTerms } from '@/lib/data';
import type { Term } from '@/lib/data';
import { cn } from '@/lib/utils';
import {
  STATUS_META,
  formatFutureRelative,
  formatPastRelative,
  plural,
  sessionHref,
} from '@/pages/library-utils';

const STATUS_ICONS: Record<ProgressStatus, typeof CircleCheck> = {
  learned: CircleCheck,
  learning: Loader,
  weak: CircleAlert,
  due: Clock,
  new: Loader,
};

const noteKey = (termId: string) => `lingo-cards-note-${termId}`;

function StatusBadge({ status, className }: { status: ProgressStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold',
        meta.text,
        className,
      )}
      style={{
        borderColor: 'currentColor',
        backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
      }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {meta.label}
    </span>
  );
}

export default function TermPage() {
  const { termId } = useParams<{ termId: string }>();
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const datasetLoading = useAppStore((s) => s.datasetLoading);
  const loadData = useAppStore((s) => s.loadData);
  const progress = useAppStore((s) => s.progress);
  const refreshProgress = useAppStore((s) => s.refreshProgress);

  const [note, setNote] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [history, setHistory] = useState<boolean[]>([]); // true = верный ответ
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const byId = useMemo<Map<string, Term>>(
    () => (dataset ? indexTerms(dataset) : new Map<string, Term>()),
    [dataset],
  );
  const term = termId ? byId.get(termId) : undefined;
  const topic = term ? dataset?.topics.find((t) => t.id === term.topic) : undefined;
  const prog = termId ? (progress.get(termId) ?? freshProgress(termId)) : null;
  const status = prog ? computeStatus(prog) : 'new';

  // Заметка: загрузить при смене термина
  useEffect(() => {
    if (!termId) return;
    try {
      setNote(localStorage.getItem(noteKey(termId)) ?? '');
    } catch {
      setNote('');
    }
  }, [termId]);

  // Мини-история ответов по этому термину из Dexie sessions
  useEffect(() => {
    if (!termId) return;
    let cancelled = false;
    void db.sessions
      .orderBy('finishedAt')
      .reverse()
      .toArray()
      .then((sessions) => {
        if (cancelled) return;
        const dots: boolean[] = [];
        for (const s of sessions) {
          for (const a of s.answers) {
            if (a.termId === termId) {
              dots.push(a.ok);
              if (dots.length >= 12) break;
            }
          }
          if (dots.length >= 12) break;
        }
        setHistory(dots.reverse()); // хронологический порядок слева направо
      })
      .catch(() => setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [termId, progress]);

  // Esc — закрыть карточку (design/library.md §6)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/library');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const onNoteChange = (value: string) => {
    setNote(value);
    if (!termId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(noteKey(termId), value);
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 1500);
      } catch {
        /* ignore */
      }
    }, 400);
  };

  const toggleFavorite = async () => {
    if (!prog) return;
    await saveProgress({ ...prog, favorite: !prog.favorite });
    await refreshProgress();
  };

  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/library');
  };

  if (datasetLoading && !dataset) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16 text-center text-sm text-ink-muted">
        Загружаем термин…
      </div>
    );
  }

  if (!term || !topic || !prog) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col items-center px-4 py-16 text-center">
        <img src={`${import.meta.env.BASE_URL}empty-library.svg`} alt="" className="h-[120px] w-[160px] object-contain" />
        <h3 className="mt-6 text-[17px]/[24px] font-bold">Термин не найден</h3>
        <p className="mt-2 text-sm font-medium text-ink-muted">
          Возможно, ссылка устарела — вернитесь в библиотеку
        </p>
        <Link
          to="/library"
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-terra transition-colors hover:bg-terra-soft"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          К библиотеке
        </Link>
      </div>
    );
  }

  const twins = term.twinIds
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const linked = term.links
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const statusOf = (id: string) => computeStatus(progress.get(id) ?? freshProgress(id));

  return (
    <motion.div
      key={term.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto w-full max-w-[720px] px-4 pt-6 pb-32 md:px-6"
    >
      {/* Верхняя навигация */}
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Библиотека
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label="Закрыть карточку"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-md"
        style={{ borderLeftWidth: 4, borderLeftColor: topic.color }}
      >
        <div className="flex flex-col gap-6 p-5 md:p-7">
          {/* Шапка: чипы + действия */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="flex flex-wrap items-center gap-2"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold"
              style={{
                borderColor: topic.color,
                backgroundColor: `color-mix(in srgb, ${topic.color} 14%, transparent)`,
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: topic.color }} />
              {topic.title}
              <span className="text-ink-faint">·</span>
              <span className="font-medium text-ink-muted">{term.subtopic}</span>
            </span>
            {term.lang === 'en' && (
              <span className="rounded-lg border border-border px-1.5 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] text-ink-faint">
                EN
              </span>
            )}
            <StatusBadge status={status} />
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => void toggleFavorite()}
              aria-label={prog.favorite ? 'Убрать из избранного' : 'В избранное'}
              aria-pressed={prog.favorite}
              className={cn(
                'ml-auto flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
                prog.favorite
                  ? 'border-terra bg-terra-soft text-terra'
                  : 'border-border text-ink-faint hover:bg-surface-2 hover:text-terra',
              )}
            >
              <Star
                className="h-5 w-5"
                strokeWidth={1.75}
                fill={prog.favorite ? 'currentColor' : 'none'}
              />
            </motion.button>
          </motion.div>

          {/* Термин + этимология */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <h1 className="font-display text-[28px]/[34px] font-semibold tracking-[-0.01em]">
              {term.term}
            </h1>
            {term.etymology && (
              <p className="mt-2 font-display text-[15px] text-ink-muted italic">{term.etymology}</p>
            )}
          </motion.div>

          {/* Определение */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="font-display text-[17px]/[30px]"
          >
            {term.definition}
          </motion.p>

          {/* EN-близнец */}
          {twins.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="flex flex-col gap-3"
            >
              {twins.map((twin) => (
                <div key={twin.id} className="rounded-xl bg-surface-2 p-4">
                  <p className="text-[11px]/[14px] font-bold tracking-[0.09em] text-ink-faint uppercase">
                    {twin.lang === 'en' ? 'Английский эквивалент' : 'Русский эквивалент'}
                  </p>
                  <p className="mt-1.5 font-display text-[17px] font-semibold">{twin.term}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-ink-muted">
                    {twin.definition}
                  </p>
                  <Link
                    to={`/library/${twin.id}`}
                    className="mt-2.5 inline-flex items-center gap-1 text-sm font-semibold text-terra transition-colors hover:text-terra-hover"
                  >
                    Открыть
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                  </Link>
                </div>
              ))}
            </motion.div>
          )}

          {/* Связанные термины */}
          {linked.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
            >
              <p className="text-[11px]/[14px] font-bold tracking-[0.09em] text-ink-faint uppercase">
                Связи · <span className="tnum font-mono">{linked.length}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {linked.map((l) => {
                  const ls = statusOf(l.id);
                  return (
                    <Link
                      key={l.id}
                      to={`/library/${l.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[ls].dot)} />
                      {l.term}
                      {l.lang === 'en' && (
                        <span className="font-mono text-[10px] font-semibold text-ink-faint">EN</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Прогресс */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <p className="text-[11px]/[14px] font-bold tracking-[0.09em] text-ink-faint uppercase">
              Прогресс
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <StatusBadge status={status} />
              {prog.repetitions > 0 ? (
                <span className="text-[12.5px]/[16px] font-medium tracking-[0.02em] text-ink-muted">
                  <span className="tnum font-mono">{prog.repetitions}</span>{' '}
                  {plural(prog.repetitions, 'повторение', 'повторения', 'повторений')}
                  {prog.nextReview > 0 && (
                    <>
                      {' · '}
                      {status === 'due'
                        ? `ждёт повторения с ${formatPastRelative(prog.nextReview)}`
                        : prog.nextReview > Date.now()
                          ? `следующее ${formatFutureRelative(prog.nextReview)}`
                          : `последний раз ${formatPastRelative(prog.nextReview - prog.interval * 86_400_000)}`}
                    </>
                  )}
                </span>
              ) : (
                <span className="text-[12.5px]/[16px] font-medium tracking-[0.02em] text-ink-muted">
                  Ещё не тренировался
                </span>
              )}
            </div>
            {history.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5" title="Последние ответы">
                {history.map((ok, i) => (
                  <span
                    key={i}
                    className={cn('h-2 w-2 rounded-full', ok ? 'bg-st-learned' : 'bg-st-weak')}
                  />
                ))}
              </div>
            )}
          </motion.div>

          {/* Заметка */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.35 }}
          >
            <p className="text-[11px]/[14px] font-bold tracking-[0.09em] text-ink-faint uppercase">
              Заметка
            </p>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Свой пример или пометка…"
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-transparent bg-surface-2 px-3.5 py-3 text-sm font-medium text-ink transition-colors outline-none placeholder:text-ink-faint focus:border-border-strong"
            />
            <AnimatePresence>
              {savedFlash && (
                <motion.p
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-1 flex items-center gap-1 text-[12px] font-medium text-st-learned"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  сохранено
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Панель действий (sticky bottom) */}
      <div className="fixed inset-x-0 bottom-16 z-40 lg:bottom-0">
        <div className="mx-auto flex max-w-[720px] gap-3 px-4 pb-4 md:px-6">
          <div className="flex w-full gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur-[10px]">
            <Link
              to={`/graph?focus=${term.id}`}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-3"
            >
              <Waypoints className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Показать на графе
            </Link>
            <Link
              to={sessionHref({ pool: 'force', count: 'all', topics: term.topic })}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-terra px-4 text-sm font-semibold text-white transition-colors hover:bg-terra-hover"
            >
              <Repeat className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Повторить сейчас
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
