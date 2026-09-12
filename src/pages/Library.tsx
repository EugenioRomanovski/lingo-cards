// Библиотека терминов (design/library.md). Route: `/library`.
// Все термины датасета: живой поиск с подсветкой, фильтры (тема/статус/язык),
// сортировка, группировка тема → подтема со sticky-заголовками.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  Search,
  Waypoints,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { computeStatus, freshProgress } from '@/lib/progress';
import type { ProgressStatus } from '@/lib/progress';
import type { Term, Topic, TopicId } from '@/lib/data';
import { cn } from '@/lib/utils';
import { ALL_STATUSES, STATUS_META, STATUS_SORT_ORDER, plural } from '@/pages/library-utils';

type LangFilter = 'all' | 'ru' | 'en';
type SortMode = 'subtopic' | 'alpha' | 'status';

const COLLAPSED_KEY = 'lingo-library-collapsed';
const HINT_KEY = 'lingo-library-hint-hidden';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

/** Highlight every occurrence of the query in the text (design: mark = accent-soft, no italic). */
function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  if (!lower.includes(ql)) return text;
  const parts: ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const j = lower.indexOf(ql, i);
    if (j === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={k++} className="rounded-[3px] bg-terra-soft px-px text-inherit not-italic">
        {text.slice(j, j + q.length)}
      </mark>,
    );
    i = j + q.length;
  }
  return parts;
}

interface EnrichedTerm {
  term: Term;
  status: ProgressStatus;
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, delay: Math.min(i, 12) * 0.04, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Library() {
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const datasetLoading = useAppStore((s) => s.datasetLoading);
  const datasetError = useAppStore((s) => s.datasetError);
  const loadData = useAppStore((s) => s.loadData);
  const progress = useAppStore((s) => s.progress);

  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState(''); // debounced (200ms, design/library.md §1)
  const [topics, setTopics] = useState<Set<TopicId>>(new Set());
  const [statuses, setStatuses] = useState<Set<ProgressStatus>>(new Set());
  const [lang, setLang] = useState<LangFilter>('all');
  const [sort, setSort] = useState<SortMode>('subtopic');
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1';
    } catch {
      return false;
    }
  });

  const searchRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [filtersH, setFiltersH] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Debounce 200ms
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(rawQuery.trim()), 200);
    return () => window.clearTimeout(t);
  }, [rawQuery]);

  // Measure the sticky filter bar so topic headers dock right below it.
  useEffect(() => {
    const el = filtersRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFiltersH(el.offsetHeight));
    ro.observe(el);
    setFiltersH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const statusOf = useMemo(() => {
    return (id: string): ProgressStatus =>
      computeStatus(progress.get(id) ?? freshProgress(id));
  }, [progress]);

  // ---- filtering ----
  const filtered = useMemo<EnrichedTerm[]>(() => {
    if (!dataset) return [];
    const q = query.toLowerCase();
    const out: EnrichedTerm[] = [];
    for (const term of dataset.terms) {
      if (topics.size > 0 && !topics.has(term.topic)) continue;
      if (lang !== 'all' && term.lang !== lang) continue;
      const status = statusOf(term.id);
      if (statuses.size > 0 && !statuses.has(status)) continue;
      if (q) {
        const hay = `${term.term}\n${term.definition}\n${term.etymology}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push({ term, status });
    }
    return out;
  }, [dataset, query, topics, statuses, lang, statusOf]);

  const searching = query.length > 0;
  // Grouping "тема → подтема" applies only in the default subtopic mode without a query.
  const grouped = sort === 'subtopic' && !searching;

  // ---- sorting / grouping ----
  const flatList = useMemo<EnrichedTerm[]>(() => {
    const list = [...filtered];
    if (sort === 'alpha' || searching) {
      list.sort((a, b) => a.term.term.localeCompare(b.term.term, 'ru'));
    } else if (sort === 'status') {
      list.sort(
        (a, b) =>
          STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status] ||
          a.term.term.localeCompare(b.term.term, 'ru'),
      );
    } else {
      list.sort((a, b) => a.term.term.localeCompare(b.term.term, 'ru'));
    }
    return list;
  }, [filtered, sort, searching]);

  interface SubGroup { subtopic: string; items: EnrichedTerm[] }
  interface TopicGroup { topic: Topic; items: EnrichedTerm[]; subs: SubGroup[]; learnedPct: number }

  const groups = useMemo<TopicGroup[]>(() => {
    if (!grouped || !dataset) return [];
    const byTopic = new Map<TopicId, EnrichedTerm[]>();
    for (const it of filtered) {
      const arr = byTopic.get(it.term.topic) ?? [];
      arr.push(it);
      byTopic.set(it.term.topic, arr);
    }
    const res: TopicGroup[] = [];
    for (const topic of dataset.topics) {
      const items = byTopic.get(topic.id);
      if (!items || items.length === 0) continue;
      const bySub = new Map<string, EnrichedTerm[]>();
      for (const it of items) {
        const arr = bySub.get(it.term.subtopic) ?? [];
        arr.push(it);
        bySub.set(it.term.subtopic, arr);
      }
      const subs = [...bySub.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ru'))
        .map(([subtopic, arr]) => ({
          subtopic,
          items: [...arr].sort((a, b) => a.term.term.localeCompare(b.term.term, 'ru')),
        }));
      const learned = items.filter((i) => i.status === 'learned').length;
      res.push({
        topic,
        items,
        subs,
        learnedPct: Math.round((learned / items.length) * 100),
      });
    }
    return res;
  }, [grouped, filtered, dataset]);

  // Flat render order for keyboard navigation.
  const navOrder = useMemo<string[]>(() => {
    if (grouped) {
      const ids: string[] = [];
      for (const g of groups) {
        if (collapsed.has(g.topic.id)) continue;
        for (const s of g.subs) for (const it of s.items) ids.push(it.term.id);
      }
      return ids;
    }
    return flatList.map((it) => it.term.id);
  }, [grouped, groups, flatList, collapsed]);

  const hasActiveFilters =
    topics.size > 0 || statuses.size > 0 || lang !== 'all' || sort !== 'subtopic' || searching;

  const resetFilters = () => {
    setRawQuery('');
    setQuery('');
    setTopics(new Set());
    setStatuses(new Set());
    setLang('all');
    setSort('subtopic');
    setActiveIdx(-1);
  };

  const toggleSet = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- keyboard shortcuts (design/library.md §6) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (e.key === '/' && !inInput) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (inInput && e.key !== 'Escape') return;
      if (e.key === 'Escape') {
        if (inInput) (target as HTMLInputElement).blur();
        setActiveIdx(-1);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (navOrder.length === 0) return;
        e.preventDefault();
        setActiveIdx((prev) => {
          const next =
            e.key === 'ArrowDown'
              ? Math.min(prev + 1, navOrder.length - 1)
              : Math.max(prev - 1, 0);
          const id = navOrder[next];
          rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
          return next;
        });
        return;
      }
      if (e.key === 'Enter' && activeIdx >= 0 && activeIdx < navOrder.length) {
        e.preventDefault();
        navigate(`/library/${navOrder[activeIdx]}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOrder, activeIdx, navigate]);

  // ---- row renderer ----
  const renderRow = (it: EnrichedTerm, orderIdx: number) => {
    const { term, status } = it;
    const meta = STATUS_META[status];
    const isActive = navOrder[activeIdx] === term.id;
    return (
      <motion.div
        key={term.id}
        custom={orderIdx}
        variants={rowVariants}
        initial="hidden"
        animate="show"
        layout="position"
      >
        <Link
          to={`/library/${term.id}`}
          ref={(el) => {
            if (el) rowRefs.current.set(term.id, el);
            else rowRefs.current.delete(term.id);
          }}
          className={cn(
            'flex min-h-14 items-center gap-3 rounded-[10px] border border-transparent px-3 py-2.5 transition-colors hover:bg-surface-2',
            isActive && 'border-border bg-surface-2',
          )}
        >
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', meta.dot)} title={meta.label} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[15px] font-semibold text-ink">
                {highlight(term.term, query)}
              </span>
              {term.lang === 'en' && (
                <span className="shrink-0 rounded-lg border border-border px-1.5 py-px font-mono text-[10px] font-semibold tracking-[0.06em] text-ink-faint">
                  EN
                </span>
              )}
            </div>
            <p className="truncate text-sm font-medium text-ink-muted">
              {highlight(term.definition, query)}
            </p>
          </div>
          {term.links.length > 0 && (
            <span className="hidden shrink-0 items-center gap-1 font-mono text-xs text-ink-faint sm:flex">
              <Waypoints className="h-3 w-3" strokeWidth={1.75} />
              {term.links.length}
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.75} />
        </Link>
      </motion.div>
    );
  };

  // ---- loading / error ----
  if (datasetLoading && !dataset) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-16 text-center text-sm text-ink-muted">
        Загружаем словарь терминов…
      </div>
    );
  }
  if (datasetError && !dataset) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-16 text-center">
        <p className="text-sm text-st-weak">{datasetError}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="mt-4 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-ink"
        >
          Попробовать снова
        </button>
      </div>
    );
  }
  if (!dataset) return null;

  const totalTerms = dataset.terms.length;
  const emptyBecauseWeak =
    filtered.length === 0 && !searching && statuses.size === 1 && statuses.has('weak');

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pt-6 pb-10 md:px-6">
      {/* Шапка */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-baseline justify-between gap-4"
      >
        <h1 className="font-display text-[28px]/[34px] font-semibold tracking-[-0.01em] md:text-[34px]/[40px]">
          Библиотека
        </h1>
        <span className="tnum font-mono text-[13px] text-ink-faint">
          {totalTerms} {plural(totalTerms, 'термин', 'термина', 'терминов')}
        </span>
      </motion.div>

      {/* Sticky: поиск + фильтры */}
      <div
        ref={filtersRef}
        className="sticky top-14 z-30 -mx-4 bg-bg/90 px-4 pt-3 pb-3 backdrop-blur-[10px] md:-mx-6 md:px-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-ink-faint"
              strokeWidth={1.75}
            />
            <input
              ref={searchRef}
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              type="text"
              placeholder="Поиск по терминам и определениям…"
              className="h-12 w-full rounded-xl border border-transparent bg-surface-2 pr-11 pl-11 text-[15px] text-ink transition-colors outline-none placeholder:text-ink-faint focus:border-border-strong"
              aria-label="Поиск по терминам"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={() => setRawQuery('')}
                className="absolute top-1/2 right-3 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
          {searching && (
            <motion.p
              key={`${query}-${filtered.length}`}
              initial={{ backgroundColor: 'var(--accent-soft)' }}
              animate={{ backgroundColor: 'rgba(0,0,0,0)' }}
              transition={{ duration: 0.3 }}
              className="mt-1.5 rounded-md px-1 text-[12.5px]/[16px] font-medium tracking-[0.02em] text-ink-muted"
            >
              Найдено: <span className="tnum font-mono">{filtered.length}</span>
            </motion.p>
          )}

          {/* Фильтры */}
          <div className="mt-2.5 flex snap-x snap-mandatory items-center gap-2 overflow-x-auto pb-1 scrollbar-none mask-fade-x lg:flex-wrap lg:overflow-visible">
            {dataset.topics.map((t) => {
              const active = topics.has(t.id);
              return (
                <motion.button
                  key={t.id}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleSet(topics, t.id, setTopics)}
                  className={cn(
                    'flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    active
                      ? 'border-transparent text-ink'
                      : 'border-border bg-surface text-ink-muted hover:bg-surface-2',
                  )}
                  style={
                    active
                      ? {
                          backgroundColor: `color-mix(in srgb, ${t.color} 14%, transparent)`,
                          borderColor: t.color,
                        }
                      : undefined
                  }
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.title}
                </motion.button>
              );
            })}

            <span className="hidden h-5 w-px shrink-0 bg-border sm:block" />

            {ALL_STATUSES.map((st) => {
              const active = statuses.has(st);
              const meta = STATUS_META[st];
              return (
                <motion.button
                  key={st}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleSet(statuses, st, setStatuses)}
                  className={cn(
                    'flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    active
                      ? 'border-terra bg-terra-soft text-terra-ink'
                      : 'border-border bg-surface text-ink-muted hover:bg-surface-2',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                  {st === 'due' ? 'К повторению' : st === 'weak' ? 'Слабые' : st === 'new' ? 'Новые' : st === 'learned' ? 'Выученные' : 'В процессе'}
                </motion.button>
              );
            })}

            <span className="hidden h-5 w-px shrink-0 bg-border sm:block" />

            {/* Язык */}
            <div className="flex shrink-0 snap-start items-center rounded-full bg-surface-2 p-0.5">
              {(
                [
                  ['all', 'Все'],
                  ['ru', 'RU'],
                  ['en', 'EN'],
                ] as [LangFilter, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLang(v)}
                  className={cn(
                    'rounded-full px-2.5 py-1 font-mono text-[12px] font-semibold transition-all',
                    lang === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Сортировка */}
            <div className="flex shrink-0 snap-start items-center gap-1 rounded-full bg-surface-2 p-0.5">
              <ArrowDownAZ className="ml-2 h-3.5 w-3.5 text-ink-faint" strokeWidth={1.75} />
              {(
                [
                  ['subtopic', 'По подтемам'],
                  ['alpha', 'По алфавиту'],
                  ['status', 'По статусу'],
                ] as [SortMode, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSort(v)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[12px] font-semibold transition-all',
                    sort === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto shrink-0 snap-start rounded-full px-3 py-1.5 text-[13px] font-semibold text-terra transition-colors hover:bg-terra-soft"
              >
                Сбросить
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Итоговая строка */}
      <motion.p
        key={`shown-${filtered.length}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="mt-1 mb-2 px-1 text-[12.5px]/[16px] font-medium tracking-[0.02em] text-ink-faint"
      >
        Показано <span className="tnum font-mono">{filtered.length}</span>{' '}
        {plural(filtered.length, 'термин', 'термина', 'терминов')}
      </motion.p>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <img src={`${import.meta.env.BASE_URL}empty-library.svg`} alt="" className="h-[120px] w-[160px] object-contain" />
          <h3 className="mt-6 text-[17px]/[24px] font-bold">
            {emptyBecauseWeak ? 'Слабых терминов нет — так держать!' : 'Ничего не найдено'}
          </h3>
          {!emptyBecauseWeak && (
            <p className="mt-2 text-sm font-medium text-ink-muted">
              Попробуй другой запрос или сбрось фильтры
            </p>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="mt-5 rounded-xl px-4 py-2.5 text-sm font-semibold text-terra transition-colors hover:bg-terra-soft"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : grouped ? (
        <div className="flex flex-col gap-6">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.topic.id);
            return (
              <section key={g.topic.id}>
                {/* Sticky-заголовок темы */}
                <div
                  className="sticky z-20 -mx-1 bg-bg/95 px-1 backdrop-blur-[6px]"
                  style={{ top: `calc(3.5rem + ${filtersH}px)` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapse(g.topic.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg border-l-[3px] py-2 pr-2 pl-3 text-left transition-colors hover:bg-surface-2"
                    style={{ borderLeftColor: g.topic.color }}
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-ink-faint transition-transform duration-300',
                        isCollapsed && '-rotate-90',
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="text-[17px]/[24px] font-bold">{g.topic.title}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="hidden items-center gap-1.5 sm:flex" title={`Выучено ${g.learnedPct}%`}>
                        <span className="h-[3px] w-16 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full rounded-full bg-st-learned transition-[width] duration-500"
                            style={{ width: `${g.learnedPct}%` }}
                          />
                        </span>
                        <span className="tnum font-mono text-[11px] text-ink-faint">{g.learnedPct}%</span>
                      </span>
                      <span className="tnum font-mono text-[12.5px] text-ink-faint">{g.items.length}</span>
                    </span>
                  </button>
                </div>

                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="mt-1 flex flex-col gap-4"
                  >
                    {g.subs.map((s, subIdx) => (
                      <div key={s.subtopic}>
                        <p className="px-3 pt-1 pb-1 text-[11px]/[14px] font-bold tracking-[0.09em] text-ink-faint uppercase">
                          {s.subtopic}
                        </p>
                        <div className="flex flex-col">
                          {s.items.map((it, i) => renderRow(it, subIdx * 4 + i))}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col">{flatList.map((it, i) => renderRow(it, i))}</div>
      )}

      {/* KeyboardHint-полоска (desktop, первый визит) */}
      {showHint && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.8 }}
          className="mt-8 hidden items-center justify-center gap-4 text-[12px] text-ink-faint lg:flex"
        >
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">/</kbd>
            поиск
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">↑</kbd>
            <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">↓</kbd>
            навигация
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd>
            открыть
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd>
            сброс
          </span>
          <button
            type="button"
            aria-label="Скрыть подсказки"
            onClick={() => {
              setShowHint(false);
              try {
                localStorage.setItem(HINT_KEY, '1');
              } catch {
                /* ignore */
              }
            }}
            className="ml-2 flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </motion.div>
      )}
    </div>
  );
}
