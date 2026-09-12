// Главная / Дашборд (design/home.md). Route: `/`.
// Answers in 2 seconds: "что повторить?", "как мой прогресс?", "с чего начать?".

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  AudioLines,
  BookA,
  ChevronRight,
  Clock,
  Feather,
  Flame,
  Layers,
  PartyPopper,
  PenLine,
  Play,
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { db, computeStatus, type SessionRecord, type TermProgress } from '@/lib/progress';
import type { Term, TopicId } from '@/lib/data';
import { cn } from '@/lib/utils';

const TOPIC_ICONS: Record<TopicId, typeof PenLine> = {
  grammar: PenLine,
  phonetics: AudioLines,
  lexicology: BookA,
  stylistics: Feather,
};

const MOTIVATIONS = [
  'Термины сами себя не выучат',
  'Короткая сессия лучше длинных обещаний',
  'Пять минут сейчас — минус пачка повторений потом',
  'Маленький шаг по графу — тоже шаг',
];

const DAY_MS = 86_400_000;
const DAILY_GOAL = 20;

/** Count-up animation for numbers (home.md §4, §6). */
function useCountUp(target: number, duration = 0.8): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function relativeDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / DAY_MS);
  if (diff <= 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Consecutive-day streak (today or yesterday counts as the anchor). */
function computeStreak(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(
    sessions.map((s) => {
      const d = new Date(s.finishedAt);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }),
  );
  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (!days.has(cursor)) cursor -= DAY_MS; // allow "streak alive until today"
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor -= DAY_MS;
  }
  return streak;
}

// ---- session start links (URL-query handoff contract for the training pages) ----
function sessionHref(params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  return `/train/session?${q.toString()}`;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
};

interface Stats {
  streak: number;
  dueCount: number;
  weakCount: number;
  todayAnswered: number;
  weekAccuracy: number | null;
  weekDelta: number | null;
  learnedTotal: number;
  sessions: SessionRecord[];
}

export default function Home() {
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const datasetLoading = useAppStore((s) => s.datasetLoading);
  const datasetError = useAppStore((s) => s.datasetError);
  const loadData = useAppStore((s) => s.loadData);
  const progress = useAppStore((s) => s.progress);
  const progressLoaded = useAppStore((s) => s.progressLoaded);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!progressLoaded) return;
    void db.sessions.orderBy('finishedAt').reverse().toArray().then(setSessions);
  }, [progressLoaded, progress]);

  const stats: Stats = useMemo(() => {
    const now = Date.now();
    let due = 0;
    let weak = 0;
    let learned = 0;
    for (const p of progress.values()) {
      const st = computeStatus(p, now);
      if (st === 'due') due++;
      if (st === 'weak') weak++;
      if (st === 'learned') learned++;
    }
    const weekAgo = now - 7 * DAY_MS;
    const twoWeeksAgo = now - 14 * DAY_MS;
    const thisWeek = sessions.filter((s) => s.finishedAt >= weekAgo);
    const lastWeek = sessions.filter((s) => s.finishedAt >= twoWeeksAgo && s.finishedAt < weekAgo);
    const acc = (list: SessionRecord[]) => {
      const total = list.reduce((a, s) => a + s.questionCount, 0);
      const ok = list.reduce((a, s) => a + s.correct, 0);
      return total > 0 ? Math.round((100 * ok) / total) : null;
    };
    const wAcc = acc(thisWeek);
    const lAcc = acc(lastWeek);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayAnswered = sessions
      .filter((s) => s.finishedAt >= todayStart.getTime())
      .reduce((a, s) => a + s.questionCount, 0);
    return {
      streak: computeStreak(sessions),
      dueCount: due,
      weakCount: weak,
      todayAnswered,
      weekAccuracy: wAcc,
      weekDelta: wAcc !== null && lAcc !== null ? wAcc - lAcc : null,
      learnedTotal: learned,
      sessions,
    };
  }, [progress, sessions]);

  const totalTerms = dataset?.terms.length ?? 0;
  const enTerms = useMemo(() => dataset?.terms.filter((t) => t.lang === 'en').length ?? 0, [dataset]);

  // Тема с наибольшим числом due — подсказка в приветствии
  const dueByTopic = useMemo(() => {
    const map = new Map<TopicId, number>();
    if (!dataset) return map;
    const now = Date.now();
    for (const t of dataset.terms) {
      const p = progress.get(t.id);
      if (p && computeStatus(p, now) === 'due') map.set(t.topic, (map.get(t.topic) ?? 0) + 1);
    }
    return map;
  }, [dataset, progress]);

  const motivation = useMemo(() => {
    let best: TopicId | null = null;
    let bestN = 0;
    for (const [topic, n] of dueByTopic) {
      if (n > bestN) {
        best = topic;
        bestN = n;
      }
    }
    if (best && bestN >= 3 && dataset) {
      const title = dataset.topics.find((t) => t.id === best)?.title.toLowerCase();
      if (title) {
        const prep =
          best === 'grammar'
            ? 'грамматики'
            : best === 'phonetics'
              ? 'фонетики'
              : best === 'lexicology'
                ? 'лексикологии'
                : 'стилистики';
        return `Сегодня хороший день для ${prep}`;
      }
    }
    return MOTIVATIONS[new Date().getDate() % MOTIVATIONS.length];
  }, [dueByTopic, dataset]);

  const attention = useMemo(() => {
    if (!dataset) return [] as { term: Term; reason: string }[];
    const now = Date.now();
    const list: { term: Term; reason: string; rank: number }[] = [];
    for (const t of dataset.terms) {
      const p = progress.get(t.id);
      if (!p) continue;
      const st = computeStatus(p, now);
      if (st === 'weak') {
        list.push({ term: t, reason: `${p.wrongCount} ${plural(p.wrongCount, 'ошибка', 'ошибки', 'ошибок')}`, rank: 0 });
      } else if (st === 'due') {
        const days = Math.max(1, Math.round((now - p.nextReview) / DAY_MS));
        list.push({ term: t, reason: `ждёт ${days} ${plural(days, 'день', 'дня', 'дней')}`, rank: 1 });
      }
    }
    return list.sort((a, b) => a.rank - b.rank).slice(0, 12);
  }, [dataset, progress]);

  if (datasetError) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16 text-center">
        <p className="font-display text-xl font-semibold">Не удалось загрузить словарь</p>
        <p className="mt-2 text-sm text-ink-muted">{datasetError}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="mt-6 h-11 rounded-xl bg-terra px-6 text-sm font-semibold text-white transition-colors hover:bg-terra-hover"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  const loading = datasetLoading || !dataset;

  const dateLine = new Date()
    .toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-[1080px] px-4 pt-6 pb-10 lg:px-6"
    >
      {/* 2. Приветствие */}
      <motion.section variants={item} className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-faint">{dateLine}</p>
          <h1 className="mt-2 font-display text-[28px] leading-[34px] font-semibold tracking-[-0.01em] lg:text-[34px] lg:leading-[40px]">
            {greeting()
              .split(' ')
              .map((w, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  {w}
                  {i === 0 ? ' ' : ''}
                </motion.span>
              ))}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-ink-muted">{motivation}</p>
        </div>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.3 }}
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 shadow-sm"
        >
          <Flame
            className={cn('h-5 w-5', stats.streak > 0 ? 'text-terra' : 'text-ink-faint', stats.streak >= 3 && 'animate-flame-sway')}
          />
          {stats.streak > 0 ? (
            <>
              <span className="tnum font-mono text-[15px] font-medium">{stats.streak}</span>
              <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                {plural(stats.streak, 'день', 'дня', 'дней')}
              </span>
            </>
          ) : (
            <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">начни серию</span>
          )}
        </motion.div>
      </motion.section>

      <div className="mt-8 lg:grid lg:grid-cols-3 lg:gap-8">
        {/* Левая колонка (2/3) */}
        <div className="space-y-8 lg:col-span-2">
          {/* 3. CTA «Тренироваться» */}
          <motion.section
            variants={item}
            className="relative overflow-hidden rounded-[20px] border border-border bg-surface p-5 shadow-md lg:p-6"
          >
            <Constellation className="pointer-events-none absolute top-1/2 right-6 hidden -translate-y-1/2 opacity-50 md:block" />
            <h2 className="font-display text-[22px] leading-[28px] font-semibold tracking-[-0.005em] lg:text-[26px]">
              Тренироваться
            </h2>
            <p className="mt-1 text-sm font-medium text-ink-muted">
              {loading
                ? 'Загружаем словарь…'
                : stats.dueCount > 0
                  ? '20 вопросов · все темы · приоритет повторений'
                  : '20 вопросов · все темы · умный микс'}
            </p>
            {!loading && stats.dueCount > 0 && (
              <Link
                to={sessionHref({ pool: 'due', count: 'all' })}
                className="animate-due-pulse mt-4 inline-flex items-center gap-2 rounded-full bg-[color:var(--accent-soft)] px-3.5 py-1.5 text-[13px] font-semibold text-info"
              >
                <Clock className="h-4 w-4" />
                Пора повторить: <span className="tnum font-mono">{stats.dueCount}</span>
              </Link>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => navigate(sessionHref({ pool: 'all', count: '20', mixReview: '1' }))}
                className="flex h-[52px] items-center gap-2 rounded-xl bg-terra px-7 text-[15px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-terra-hover active:scale-[0.97] disabled:opacity-45"
              >
                <Play className="h-[18px] w-[18px]" />
                Начать сессию
              </button>
              <Link
                to="/train/setup"
                className="flex h-[52px] items-center gap-2 rounded-xl px-5 text-[15px] font-semibold text-terra transition-all duration-200 hover:bg-accent-soft active:scale-[0.97]"
              >
                <SlidersHorizontal className="h-[18px] w-[18px]" />
                Настроить
              </Link>
            </div>
          </motion.section>

          {/* 4. Прогресс по темам */}
          <motion.section variants={item}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[17px] font-bold lg:text-[19px]">Темы</h3>
              <span className="tnum text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                {loading ? '…' : `${totalTerms - enTerms} + ${enTerms} EN`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[168px] animate-pulse rounded-2xl border border-border bg-surface" />
                  ))
                : dataset.topics.map((topic, i) => (
                    <TopicCard
                      key={topic.id}
                      topic={topic}
                      terms={dataset.terms.filter((t) => t.topic === topic.id)}
                      progress={progress}
                      delay={i * 0.06}
                    />
                  ))}
            </div>
          </motion.section>

          {/* 5. Требуют внимания */}
          <motion.section variants={item}>
            {attention.length > 0 ? (
              <>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div>
                    <h3 className="text-[17px] font-bold lg:text-[19px]">Требуют внимания</h3>
                    <p className="text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                      слабые и просроченные
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(sessionHref({ pool: 'weak', count: 'all', mixReview: '1' }))}
                    className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-semibold text-terra transition-colors hover:bg-accent-soft"
                  >
                    Повторить все (<span className="tnum font-mono">{attention.length}</span>)
                  </button>
                </div>
                <div className="mask-fade-x -mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
                  <div className="flex snap-x gap-2.5">
                    {attention.map(({ term, reason }, i) => {
                      const p = progress.get(term.id);
                      const st = p ? computeStatus(p) : 'new';
                      const topic = dataset!.topics.find((t) => t.id === term.topic);
                      return (
                        <motion.div
                          key={term.id}
                          initial={{ opacity: 0, x: 24 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i, 11) * 0.05, duration: 0.3 }}
                          className="snap-start"
                        >
                          <Link
                            to={`/library/${term.id}`}
                            className="block w-[200px] shrink-0 rounded-2xl border border-border bg-surface p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-md"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: `var(--st-${st})` }}
                              />
                              <span className="truncate text-sm font-semibold">{term.term}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: topic?.color ?? 'var(--text-faint)' }}
                              />
                              {topic?.title}
                            </div>
                            <div className="mt-1 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                              {reason}
                            </div>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              !loading && (
                <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3.5">
                  <PartyPopper className="h-5 w-5 shrink-0 text-terra" />
                  <p className="text-sm font-medium text-ink-muted">Все термины под контролем</p>
                </div>
              )
            )}
          </motion.section>
        </div>

        {/* Правая колонка (1/3) */}
        <div className="mt-8 space-y-8 lg:mt-0">
          {/* 6. Мини-статистика */}
          <motion.section variants={item} className="grid grid-cols-3 gap-3 lg:grid-cols-1">
            <StatCard icon={Target} label="Точность за неделю">
              <DataValue value={stats.weekAccuracy} suffix="%" loading={loading} />
              {stats.weekDelta !== null && (
                <span
                  className={cn(
                    'mt-1 flex items-center gap-1 text-[12.5px] font-medium tracking-[0.02em]',
                    stats.weekDelta >= 0 ? 'text-success' : 'text-error',
                  )}
                >
                  {stats.weekDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {stats.weekDelta >= 0 ? '+' : ''}
                  {stats.weekDelta}% к прошлой
                </span>
              )}
            </StatCard>
            <StatCard icon={Zap} label="Сегодня" ring={{ value: stats.todayAnswered, goal: DAILY_GOAL }}>
              <DataValue value={stats.todayAnswered} loading={loading} />
              <span className="mt-1 block text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                вопросов · цель {DAILY_GOAL}
              </span>
            </StatCard>
            <StatCard icon={Layers} label="Всего выучено">
              <DataValue value={stats.learnedTotal} loading={loading} />
              <span className="mt-1 block text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                из {totalTerms} терминов
              </span>
            </StatCard>
          </motion.section>

          {/* 7. Последние сессии */}
          <motion.section variants={item}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[17px] font-bold lg:text-[19px]">Недавние сессии</h3>
              <Link to="/stats" className="text-[13px] font-semibold text-terra transition-colors hover:text-terra-hover">
                Вся статистика →
              </Link>
            </div>
            {stats.sessions.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-6 text-center">
                <img src={`${import.meta.env.BASE_URL}empty-stats.svg`} alt="" className="mx-auto h-24 w-auto" />
                <p className="mt-3 text-sm font-medium text-ink-muted">Здесь появится история тренировок</p>
                <button
                  type="button"
                  onClick={() => navigate(sessionHref({ pool: 'all', count: '20', mixReview: '1' }))}
                  className="mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold text-terra transition-colors hover:bg-accent-soft"
                >
                  Начать первую сессию
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {stats.sessions.slice(0, 3).map((s) => {
                  const acc = s.questionCount > 0 ? Math.round((100 * s.correct) / s.questionCount) : 0;
                  const color = acc >= 90 ? 'var(--success)' : acc >= 70 ? 'var(--warning)' : 'var(--error)';
                  const minutes = Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000));
                  const topicTitles =
                    dataset && s.topics.length === 1
                      ? (dataset.topics.find((t) => t.id === s.topics[0])?.title ?? 'Микс')
                      : 'Микс';
                  return (
                    <Link
                      key={s.id}
                      to="/stats"
                      className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2"
                    >
                      <AccuracyRing percent={acc} color={color} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {dataset &&
                            s.topics.slice(0, 4).map((tid) => {
                              const t = dataset.topics.find((x) => x.id === tid);
                              return t ? (
                                <span key={tid} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                              ) : null;
                            })}
                          <span className="truncate text-sm font-semibold">{topicTitles}</span>
                        </div>
                        <p className="tnum mt-0.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                          {s.questionCount} {plural(s.questionCount, 'вопрос', 'вопроса', 'вопросов')} · {minutes} мин
                        </p>
                      </div>
                      <span className="shrink-0 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                        {relativeDate(s.finishedAt)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                    </Link>
                  );
                })}
              </div>
            )}
          </motion.section>

          {/* 8. Промо графа */}
          <motion.section variants={item}>
            <Link
              to="/graph"
              className="group block rounded-[20px] border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md lg:p-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-[17px] font-bold lg:text-[19px]">Карта знаний</h3>
                  <p className="mt-1.5 text-sm font-medium text-ink-muted">
                    389 связей между {totalTerms || 264} терминами — посмотри, как устроена система
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-terra">
                    Открыть граф
                    <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
                <GraphTeaser className="hidden shrink-0 sm:block" />
              </div>
            </Link>
          </motion.section>
        </div>
      </div>
    </motion.div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

function DataValue({ value, suffix = '', loading }: { value: number | null; suffix?: string; loading?: boolean }) {
  const v = useCountUp(value ?? 0, 0.9);
  return (
    <span className="tnum font-mono text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] lg:text-[34px]">
      {loading ? '…' : value === null ? '—' : `${v}${suffix}`}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  ring,
  children,
}: {
  icon: typeof Target;
  label: string;
  ring?: { value: number; goal: number };
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
          <Icon className="h-[18px] w-[18px] text-terra" strokeWidth={1.75} />
        </span>
        {ring && <GoalRing value={ring.value} goal={ring.goal} />}
      </div>
      {children}
      <p className="mt-1 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">{label}</p>
    </div>
  );
}

function GoalRing({ value, goal }: { value: number; goal: number }) {
  const frac = Math.min(1, value / goal);
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
      <motion.circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={frac >= 1 ? 'var(--accent)' : 'var(--st-learning)'}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - frac) }}
        transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

function AccuracyRing({ percent, color }: { percent: number; color: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <svg width="40" height="40" viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3.5" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <span className="tnum font-mono text-[11px] font-semibold">{percent}</span>
    </span>
  );
}

function TopicCard({
  topic,
  terms,
  progress,
  delay,
}: {
  topic: { id: TopicId; title: string; color: string };
  terms: Term[];
  progress: Map<string, TermProgress>;
  delay: number;
}) {
  const navigate = useNavigate();
  const counts = useMemo(() => {
    const now = Date.now();
    const c = { learned: 0, learning: 0, weak: 0, new: 0, due: 0 };
    for (const t of terms) {
      const p = progress.get(t.id);
      c[p ? computeStatus(p, now) : 'new']++;
    }
    return c;
  }, [terms, progress]);
  const total = terms.length || 1;
  const learnedPct = Math.round((100 * counts.learned) / total);
  const shownPct = useCountUp(learnedPct, 0.8);
  const Icon = TOPIC_ICONS[topic.id];
  // Сегменты бара: выучен / в процессе / слабые / новые (due считаем в «в процессе»-группе повторений как learned-pending)
  const segments = [
    { value: counts.learned, color: 'var(--st-learned)' },
    { value: counts.learning + counts.due, color: 'var(--st-learning)' },
    { value: counts.weak, color: 'var(--st-weak)' },
    { value: counts.new, color: 'var(--st-new)' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        role="link"
        tabIndex={0}
        onClick={() => navigate(`/library?topic=${topic.id}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/library?topic=${topic.id}`)}
        className="group flex h-full cursor-pointer flex-col rounded-2xl border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: `color-mix(in srgb, ${topic.color} 14%, transparent)` }}
          >
            <Icon className="h-4 w-4" style={{ color: topic.color }} strokeWidth={1.75} />
          </span>
          <span className="text-[15px] font-bold">{topic.title}</span>
        </div>
        <div className="mt-3">
          <span className="tnum font-mono text-[28px] leading-[1.1] font-semibold tracking-[-0.02em]">{shownPct}%</span>
          <p className="tnum mt-0.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
            выучено · {counts.learned} из {terms.length}
          </p>
        </div>
        <div className="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-3">
          {segments.map((s, i) => (
            <motion.div
              key={i}
              className="h-full"
              style={{ backgroundColor: s.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(100 * s.value) / total}%` }}
              transition={{ duration: 0.7, delay: delay + i * 0.08, ease: 'easeOut' }}
            />
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
          {segments.map((s, i) => (
            <span key={i} className="tnum flex items-center gap-1 font-mono text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.value}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(sessionHref({ pool: 'force', count: '20', topics: topic.id }));
          }}
          className="mt-auto pt-3 text-left text-[13px] font-semibold transition-opacity hover:opacity-75"
          style={{ color: topic.color }}
        >
          Тренировать →
        </button>
      </div>
    </motion.div>
  );
}

/** Декоративное мини-созвездие для CTA-карточки (home.md §3). */
function Constellation({ className }: { className?: string }) {
  const nodes = [
    { x: 12, y: 52, c: 'var(--topic-grammar)' },
    { x: 58, y: 18, c: 'var(--topic-phonetics)' },
    { x: 104, y: 44, c: 'var(--topic-lexicology)' },
    { x: 146, y: 14, c: 'var(--topic-stylistics)' },
    { x: 152, y: 70, c: 'var(--topic-grammar)' },
    { x: 66, y: 76, c: 'var(--topic-stylistics)' },
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [2, 4],
    [2, 5],
    [0, 5],
  ];
  return (
    <svg width="168" height="92" viewBox="0 0 168 92" fill="none" className={className} aria-hidden>
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="var(--text-faint)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="5" fill={n.c} />
      ))}
    </svg>
  );
}

/** Декоративный фрагмент графа для промо-карточки (home.md §8). */
function GraphTeaser({ className }: { className?: string }) {
  const nodes = [
    { x: 20, y: 60, c: 'var(--topic-grammar)' },
    { x: 60, y: 22, c: 'var(--topic-phonetics)' },
    { x: 104, y: 48, c: 'var(--topic-lexicology)', due: true },
    { x: 140, y: 18, c: 'var(--topic-stylistics)' },
    { x: 148, y: 76, c: 'var(--topic-grammar)' },
    { x: 66, y: 82, c: 'var(--topic-lexicology)' },
    { x: 108, y: 96, c: 'var(--topic-phonetics)' },
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [2, 4],
    [2, 5],
    [5, 6],
    [4, 6],
  ];
  return (
    <svg width="170" height="112" viewBox="0 0 170 112" fill="none" className={className} aria-hidden>
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="var(--text-faint)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.45"
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          {n.due && <circle cx={n.x} cy={n.y} r="9" fill="none" stroke="var(--st-due)" strokeWidth="2" />}
          <circle cx={n.x} cy={n.y} r="5.5" fill={n.c} />
        </g>
      ))}
    </svg>
  );
}
