// Экран результатов сессии (/train/results, design/training.md §7): 4 блока + список карточек
// с фильтрами и группировкой. Данные — из sessionStorage (sessionDetailKey) + store.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BookOpenText,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock3,
  Flame,
  Minus,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { plural, STATUS_META, sessionHref } from '@/pages/library-utils';
import { sessionDetailKey, type SessionAnswerDetail, type SessionDetail } from '@/pages/sessionDetail';
import type { Grade, ProgressStatus } from '@/lib/progress';
import { cn } from '@/lib/utils';

const GRADE_META: Record<Grade, { label: string; className: string; icon: typeof CircleCheck }> = {
  good: { label: 'Знаю', className: 'text-st-learned', icon: CircleCheck },
  unsure: { label: 'Неуверенно', className: 'text-st-learning', icon: Minus },
  bad: { label: 'Не знаю', className: 'text-st-weak', icon: CircleX },
};

const MODE_LABEL: Record<string, string> = {
  'def2term-input': 'Определение → термин',
  'def2term-choice': 'Определение → выбор',
  'term2def-choice': 'Термин → определение',
  'term2def-precision': 'Precision',
};

type GroupKey = 'topic' | 'mode' | 'grade';
type FilterKey = 'all' | 'ok' | 'unsure' | 'bad' | 'skipped';

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s} сек`;
  return `${m} мин ${s.toString().padStart(2, '0')} сек`;
}

function scoreColor(score: number | undefined): string {
  if (score === undefined) return 'text-ink-faint';
  if (score >= 85) return 'text-st-learned';
  if (score >= 50) return 'text-st-learning';
  return 'text-st-weak';
}

export default function TrainResults() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const loadData = useAppStore((s) => s.loadData);
  const refreshProgress = useAppStore((s) => s.refreshProgress);
  const reduceMotion = useReducedMotion();

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [groupBy, setGroupBy] = useState<GroupKey>('topic');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dataset) void loadData();
    void refreshProgress();
    const raw = sessionStorage.getItem(sessionDetailKey(Number(params.get('id') ?? '')));
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setDetail(JSON.parse(raw) as SessionDetail);
    } catch {
      setMissing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answers = useMemo(() => detail?.answers ?? [], [detail]);
  const filtered = useMemo(() => {
    switch (filter) {
      case 'ok':
        return answers.filter((a) => a.ok && a.grade === 'good');
      case 'unsure':
        return answers.filter((a) => a.grade === 'unsure' && !a.skipped);
      case 'bad':
        return answers.filter((a) => a.grade === 'bad' && !a.skipped);
      case 'skipped':
        return answers.filter((a) => a.skipped);
      default:
        return answers;
    }
  }, [answers, filter]);

  const groups = useMemo(() => {
    const keyOf = (a: SessionAnswerDetail): string => {
      if (groupBy === 'topic') return a.term.topic;
      if (groupBy === 'mode') return MODE_LABEL[a.mode] ?? a.mode;
      return GRADE_META[a.grade].label;
    };
    const map = new Map<string, SessionAnswerDetail[]>();
    for (const a of filtered) {
      const k = keyOf(a);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return [...map.entries()];
  }, [filtered, groupBy]);

  if (missing) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Нет данных о сессии</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Похоже, страница обновлена или сессия была давно. Начните новую тренировку.
        </p>
        <Link
          to="/train/setup"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-terra-hover"
        >
          К настройке сессии
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 py-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    );
  }

  const total = answers.length;
  const good = answers.filter((a) => a.grade === 'good').length;
  const unsure = answers.filter((a) => a.grade === 'unsure' && !a.skipped).length;
  const bad = answers.filter((a) => a.grade === 'bad' && !a.skipped).length;
  const skipped = answers.filter((a) => a.skipped).length;
  const accuracy = total - skipped > 0 ? Math.round((good / (total - skipped)) * 100) : 0;
  const duration = formatDuration(detail.finishedAt - detail.startedAt);

  // статусы до → после (по уникальным терминам)
  const statusDelta = new Map<ProgressStatus, { from: number; to: number }>();
  for (const a of answers) {
    for (const [k, v] of [
      ['from', a.statusBefore],
      ['to', a.statusAfter],
    ] as const) {
      if (!statusDelta.has(v)) statusDelta.set(v, { from: 0, to: 0 });
      statusDelta.get(v)![k] += 1;
    }
  }

  // самые слабые (bad или precision < 50), до 5
  const weakest = answers
    .filter((a) => !a.skipped && (a.grade === 'bad' || (a.score !== undefined && a.score < 50)))
    .slice(0, 5);

  const hero =
    accuracy >= 90
      ? 'Блестяще.'
      : accuracy >= 70
        ? 'Хорошая сессия.'
        : accuracy >= 45
          ? 'Работаем дальше.'
          : 'Сложно — но полезно.';

  const toggleGroup = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const FILTERS: [FilterKey, string, number][] = [
    ['all', 'Все', total],
    ['ok', 'Знаю', good],
    ['unsure', 'Неуверенно', unsure],
    ['bad', 'Не знаю', bad],
    ['skipped', 'Пропущено', skipped],
  ];

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8">
      {/* Hero */}
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">Сессия завершена</p>
        <h1 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.01em]">{hero}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {good} из {total - skipped || total} уверенно · {duration}
        </p>
      </motion.header>

      {/* 7.1 Сводные метрики */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { icon: CircleCheck, label: 'Точность', value: `${accuracy}%`, cls: 'text-st-learned' },
          { icon: Clock3, label: 'Время', value: duration, cls: 'text-info' },
          { icon: Flame, label: 'Карточек', value: String(total), cls: 'text-terra' },
          {
            icon: TrendingUp,
            label: 'Повторений сегодня',
            value: String(total),
            cls: 'text-st-learning',
          },
        ].map(({ icon: Icon, label, value, cls }) => (
          <div key={label} className="rounded-2xl border bg-surface p-4 shadow-sm">
            <Icon className={cn('h-[18px] w-[18px]', cls)} strokeWidth={1.75} />
            <div className="tnum mt-2 font-display text-[22px] font-semibold">{value}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">{label}</div>
          </div>
        ))}
      </motion.section>

      {/* Распределение */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        className="mt-4 rounded-2xl border bg-surface p-5 shadow-sm"
      >
        <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">Распределение оценок</h2>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
          {total > 0 && (
            <>
              <div className="bg-st-learned transition-all" style={{ width: `${(good / total) * 100}%` }} />
              <div className="bg-st-learning transition-all" style={{ width: `${(unsure / total) * 100}%` }} />
              <div className="bg-st-weak transition-all" style={{ width: `${(bad / total) * 100}%` }} />
              <div className="bg-st-new transition-all" style={{ width: `${(skipped / total) * 100}%` }} />
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] font-medium">
          <span className="inline-flex items-center gap-1.5 text-st-learned">
            <span className="h-2 w-2 rounded-full bg-st-learned" />
            Знаю — {good}
          </span>
          <span className="inline-flex items-center gap-1.5 text-st-learning">
            <span className="h-2 w-2 rounded-full bg-st-learning" />
            Неуверенно — {unsure}
          </span>
          <span className="inline-flex items-center gap-1.5 text-st-weak">
            <span className="h-2 w-2 rounded-full bg-st-weak" />
            Не знаю — {bad}
          </span>
          {skipped > 0 && (
            <span className="inline-flex items-center gap-1.5 text-ink-faint">
              <span className="h-2 w-2 rounded-full bg-st-new" />
              Пропущено — {skipped}
            </span>
          )}
        </div>

        {/* изменение статусов */}
        {statusDelta.size > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint">Статусы после сессии</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold">
              {[...statusDelta.entries()]
                .sort((a, b) => b[1].to - a[1].to)
                .map(([st, d]) => {
                  const meta = STATUS_META[st];
                  const diff = d.to - d.from;
                  return (
                    <span
                      key={st}
                      className={cn('inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1', meta.text)}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                      {meta.label}: <span className="tnum">{d.to}</span>
                      {diff > 0 && <span className="tnum text-[11px]">(+{diff})</span>}
                    </span>
                  );
                })}
            </div>
          </div>
        )}
      </motion.section>

      {/* 7.2 Слабые места */}
      {weakest.length > 0 && (
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 rounded-2xl border border-st-weak/30 bg-surface p-5 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-st-weak">
            <Sparkles className="h-4 w-4" />
            Слабые места
          </h2>
          <ul className="mt-3 space-y-2">
            {weakest.map((a) => (
              <li key={a.termId} className="flex items-center justify-between gap-3">
                <Link to={`/library/${a.termId}`} className="truncate text-[14px] font-semibold hover:text-terra">
                  {a.term.term}
                </Link>
                <span className="shrink-0 text-[12px] font-medium text-ink-muted">
                  {a.score !== undefined ? <span className={cn('tnum', scoreColor(a.score))}>{a.score}%</span> : 'не знаю'}
                </span>
              </li>
            ))}
          </ul>
          <Link
            to={sessionHref({ terms: weakest.map((a) => a.termId).join(',') })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-colors hover:bg-surface-2"
          >
            <RotateCcw className="h-4 w-4" />
            Повторить слабые ({weakest.length})
          </Link>
        </motion.section>
      )}

      {/* 7.3 Список карточек */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[20px] font-semibold">Все ответы</h2>
          <div className="flex items-center gap-1 rounded-lg border bg-surface p-1" role="group" aria-label="Группировка">
            {(
              [
                ['topic', 'По темам'],
                ['mode', 'По режимам'],
                ['grade', 'По оценкам'],
              ] as [GroupKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroupBy(key)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors',
                  groupBy === key ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Фильтр ответов">
          {FILTERS.map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                'h-8 rounded-lg border px-2.5 text-[12px] font-semibold transition-all',
                filter === key ? 'border-transparent bg-terra text-surface' : 'bg-surface text-ink-muted hover:text-ink',
              )}
            >
              {label} · <span className="tnum">{n}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {groups.map(([key, list]) => {
            const isCollapsed = collapsed.has(key);
            const okCount = list.filter((a) => a.ok && a.grade === 'good').length;
            return (
              <div key={key} className="overflow-hidden rounded-2xl border bg-surface shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
                >
                  <span className="flex items-center gap-2 text-[13.5px] font-bold">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')} />
                    {key === 'grammar'
                      ? 'Грамматика'
                      : key === 'phonetics'
                        ? 'Фонетика'
                        : key === 'lexicology'
                          ? 'Лексикология'
                          : key === 'stylistics'
                            ? 'Стилистика'
                            : key}
                  </span>
                  <span className="text-[12px] font-medium text-ink-faint">
                    {okCount}/{list.length} {plural(list.length, 'верный', 'верных', 'верных')}
                  </span>
                </button>
                {!isCollapsed && (
                  <ul className="divide-y border-t">
                    {list.map((a, i) => {
                      const gm = GRADE_META[a.grade];
                      const Icon = gm.icon;
                      return (
                        <li key={`${a.termId}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                          <Icon className={cn('h-4 w-4 shrink-0', gm.className)} />
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/library/${a.termId}`}
                              className="block truncate text-[14px] font-semibold hover:text-terra"
                            >
                              {a.term.term}
                            </Link>
                            <div className="truncate text-[11.5px] text-ink-faint">
                              {MODE_LABEL[a.mode] ?? a.mode}
                              {a.score !== undefined && (
                                <>
                                  {' · '}precision <span className={cn('tnum font-semibold', scoreColor(a.score))}>{a.score}%</span>
                                </>
                              )}
                              {a.skipped && ' · пропущено'}
                            </div>
                          </div>
                          <span
                            className={cn(
                              'shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold',
                              gm.className,
                            )}
                          >
                            {a.skipped ? 'Пропуск' : gm.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-muted">Под этот фильтр ничего не попало.</p>
          )}
        </div>
      </motion.section>

      {/* 7.4 CTA */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 flex flex-wrap justify-center gap-2"
      >
        <button
          type="button"
          onClick={() => navigate('/train/setup')}
          className="inline-flex items-center gap-2 rounded-xl bg-terra px-5 py-2.5 text-[14px] font-semibold text-surface shadow-sm transition-colors hover:bg-terra-hover"
        >
          <RotateCcw className="h-4 w-4" />
          Ещё одна сессия
        </button>
        <Link
          to="/library"
          className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[14px] font-semibold transition-colors hover:bg-surface-2"
        >
          <BookOpenText className="h-4 w-4" />
          В библиотеку
        </Link>
      </motion.section>
    </div>
  );
}
