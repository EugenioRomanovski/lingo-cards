// Библиотека (/library): sticky-панель поиска/фильтров/сортировки, группировка по темам,
// горизонтальные ряды подтем, карточки терминов со статусом (design/library.md §1-3).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, RotateCcw, Search, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { computeStatus, type ProgressStatus } from '@/lib/progress';
import { ALL_STATUSES, plural, STATUS_META, STATUS_SORT_ORDER } from '@/pages/library-utils';
import type { Term, TopicId } from '@/lib/data';
import { cn } from '@/lib/utils';

const TOPIC_TITLES: Record<TopicId, string> = {
  grammar: 'Грамматика',
  phonetics: 'Фонетика',
  lexicology: 'Лексикология',
  stylistics: 'Стилистика',
};
const TOPIC_ORDER: TopicId[] = ['grammar', 'phonetics', 'lexicology', 'stylistics'];

type SortKey = 'abc' | 'status' | 'topic';

function topicVar(topic: string): string {
  return `var(--topic-${topic})`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function TermCard({ term }: { term: Term }) {
  const progress = useAppStore((s) => s.progress);
  const p = progress.get(term.id);
  const status = computeStatus(p);
  const meta = STATUS_META[status];

  return (
    <Link
      to={`/library/${term.id}`}
      className="group flex w-[240px] shrink-0 snap-start flex-col rounded-xl border bg-surface p-3.5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ scrollSnapAlign: 'start' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="h-1.5 w-6 rounded-full"
          style={{ backgroundColor: topicVar(term.topic) }}
        />
        <span className={cn('inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em]', meta.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
      </div>
      <div className="mt-2 line-clamp-2 font-display text-[15.5px] font-semibold leading-snug">
        {term.term}
      </div>
      <div className="mt-1 line-clamp-2 text-[12px] leading-[1.5] text-ink-muted">{term.definition}</div>
      <div className="mt-auto pt-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-faint">
        {term.subtopic}
      </div>
    </Link>
  );
}

export default function Library() {
  const dataset = useAppStore((s) => s.dataset);
  const progress = useAppStore((s) => s.progress);
  const loadData = useAppStore((s) => s.loadData);
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const debouncedQuery = useDebounced(query, 200);
  const [topics, setTopics] = useState<TopicId[]>(
    () => (params.get('topic')?.split(',').filter(Boolean) as TopicId[]) ?? [],
  );
  const [statuses, setStatuses] = useState<ProgressStatus[]>(
    () => (params.get('status')?.split(',').filter(Boolean) as ProgressStatus[]) ?? [],
  );
  const [sort, setSort] = useState<SortKey>((params.get('sort') as SortKey) || 'topic');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dataset) void loadData();
  }, [dataset, loadData]);

  // sync filters → URL
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedQuery) next.set('q', debouncedQuery);
    if (topics.length) next.set('topic', topics.join(','));
    if (statuses.length) next.set('status', statuses.join(','));
    if (sort !== 'topic') next.set('sort', sort);
    setParams(next, { replace: true });
  }, [debouncedQuery, topics, statuses, sort, setParams]);

  const statusOf = (t: Term): ProgressStatus => computeStatus(progress.get(t.id));

  const filtered = useMemo(() => {
    if (!dataset) return [];
    const q = debouncedQuery.trim().toLowerCase();
    let list = dataset.terms;
    if (q) {
      list = list.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.definition.toLowerCase().includes(q) ||
          t.subtopic.toLowerCase().includes(q),
      );
    }
    if (topics.length) list = list.filter((t) => topics.includes(t.topic));
    if (statuses.length) list = list.filter((t) => statuses.includes(statusOf(t)));

    const byAbc = (a: Term, b: Term) => a.term.localeCompare(b.term, 'ru');
    if (sort === 'abc') return [...list].sort(byAbc);
    if (sort === 'status')
      return [...list].sort((a, b) => STATUS_SORT_ORDER[statusOf(a)] - STATUS_SORT_ORDER[statusOf(b)] || byAbc(a, b));
    return [...list].sort(
      (a, b) => TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic) || a.subtopic.localeCompare(b.subtopic, 'ru') || byAbc(a, b),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, debouncedQuery, topics, statuses, sort, progress]);

  const grouped = useMemo(() => {
    if (sort !== 'topic') return null;
    const byTopic = new Map<TopicId, Map<string, Term[]>>();
    for (const t of filtered) {
      if (!byTopic.has(t.topic)) byTopic.set(t.topic, new Map());
      const bySub = byTopic.get(t.topic)!;
      if (!bySub.has(t.subtopic)) bySub.set(t.subtopic, []);
      bySub.get(t.subtopic)!.push(t);
    }
    return byTopic;
  }, [filtered, sort]);

  const hasFilters = query || topics.length > 0 || statuses.length > 0;
  const resetFilters = () => {
    setQuery('');
    setTopics([]);
    setStatuses([]);
  };

  const toggleTopic = (t: TopicId) =>
    setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleStatus = (s: ProgressStatus) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  if (!dataset) {
    return (
      <div className="mx-auto w-full max-w-[1080px] space-y-4 px-4 py-8">
        <div className="h-10 w-full animate-pulse rounded-xl bg-surface-2" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 w-[240px] animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 lg:px-6">
      {/* 2. Sticky панель */}
      <div ref={panelRef} className="sticky top-14 z-30 -mx-4 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur-[12px] lg:top-14">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по терминам, определениям…"
              aria-label="Поиск по библиотеке"
              className="h-10 w-full rounded-xl border bg-surface pl-9 pr-9 text-sm outline-none transition-shadow placeholder:text-ink-faint focus:ring-2 focus:ring-terra/40"
            />
            {query && (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Темы */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Фильтр по темам">
            {TOPIC_ORDER.map((t) => {
              const active = topics.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTopic(t)}
                  aria-pressed={active}
                  className={cn(
                    'h-9 rounded-lg border px-3 text-[12.5px] font-semibold transition-all',
                    active ? 'border-transparent text-surface' : 'bg-surface text-ink-muted hover:text-ink',
                  )}
                  style={active ? { backgroundColor: topicVar(t) } : undefined}
                >
                  {TOPIC_TITLES[t]}
                </button>
              );
            })}
          </div>

          {/* Статусы */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Фильтр по статусам">
            {ALL_STATUSES.map((s) => {
              const active = statuses.includes(s);
              const meta = STATUS_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-all',
                    active ? 'border-transparent bg-surface-2 text-ink' : 'bg-surface text-ink-muted hover:text-ink',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Сортировка */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border bg-surface p-1" role="group" aria-label="Сортировка">
            {(
              [
                ['topic', 'По темам'],
                ['abc', 'А—Я'],
                ['status', 'По статусу'],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={cn(
                  'h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors',
                  sort === key ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-[12px] font-medium text-ink-faint">
          <span>
            {filtered.length} {plural(filtered.length, 'термин', 'термина', 'терминов')} из {dataset.terms.length}
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-terra transition-colors hover:text-terra-hover"
            >
              <RotateCcw className="h-3 w-3" />
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      {/* 3-4. Группы и ряды */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-16 text-center">
          <img src={`${import.meta.env.BASE_URL}empty-library.svg`} alt="" className="w-56 opacity-90" />
          <h2 className="mt-4 font-display text-xl font-semibold">Ничего не нашлось</h2>
          <p className="mt-1 max-w-[340px] text-sm text-ink-muted">
            Попробуйте изменить запрос или сбросить фильтры — термин точно где-то здесь.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-terra-hover"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : grouped ? (
        TOPIC_ORDER.filter((t) => grouped.has(t)).map((topic) => {
          const bySub = grouped.get(topic)!;
          const count = [...bySub.values()].reduce((n, arr) => n + arr.length, 0);
          return (
            <section key={topic} className="mt-8">
              <header className="flex items-baseline gap-3">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: topicVar(topic) }} />
                <h2 className="font-display text-[22px] font-semibold tracking-[-0.01em]">{TOPIC_TITLES[topic]}</h2>
                <span className="text-[12.5px] font-medium text-ink-faint">
                  {count} {plural(count, 'термин', 'термина', 'терминов')}
                </span>
              </header>
              {[...bySub.entries()].map(([subtopic, terms]) => (
                <div key={subtopic} className="mt-4">
                  <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">{subtopic}</h3>
                  <div className="mask-fade-x -mx-4 mt-2 overflow-x-auto px-4 pb-2 scrollbar-none lg:mx-0 lg:px-0">
                    <div className="flex snap-x gap-3" style={{ scrollPaddingLeft: 16 }}>
                      {terms.map((t) => (
                        <TermCard key={t.id} term={t} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          );
        })
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              to={`/library/${t.id}`}
              className="group flex flex-col rounded-xl border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
                  style={{
                    color: topicVar(t.topic),
                    backgroundColor: `color-mix(in srgb, ${topicVar(t.topic)} 12%, transparent)`,
                  }}
                >
                  {TOPIC_TITLES[t.topic]}
                </span>
                <span className={cn('inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em]', STATUS_META[statusOf(t)].text)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[statusOf(t)].dot)} />
                  {STATUS_META[statusOf(t)].label}
                </span>
              </div>
              <div className="mt-2.5 line-clamp-2 font-display text-[17px] font-semibold leading-snug">{t.term}</div>
              <div className="mt-1 line-clamp-3 text-[12.5px] leading-[1.55] text-ink-muted">{t.definition}</div>
              <div className="mt-auto flex items-center justify-between pt-3 text-[11px] font-medium text-ink-faint">
                <span>{t.subtopic}</span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
