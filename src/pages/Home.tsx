// Главная (design/home.md): greeting, статистика дня, due-секция, кольцо тем,
// ряды due/новых, ачивки, быстрые действия.

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BookOpenText,
  Flame,
  GraduationCap,
  Layers,
  Library,
  Play,
  Plus,
  Sparkles,
  TrendingUp,
  Waypoints,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { computeStatus, type ProgressStatus } from '@/lib/progress';
import { plural, STATUS_META, sessionHref } from '@/pages/library-utils';
import type { Term, TopicId } from '@/lib/data';
import { cn } from '@/lib/utils';

const TOPIC_TITLES: Record<TopicId, string> = {
  grammar: 'Грамматика',
  phonetics: 'Фонетика',
  lexicology: 'Лексикология',
  stylistics: 'Стилистика',
};
const TOPIC_ORDER: TopicId[] = ['grammar', 'phonetics', 'lexicology', 'stylistics'];

function topicVar(t: string): string {
  return `var(--topic-${t})`;
}

const easeOut = [0.22, 1, 0.36, 1] as const;
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } },
};

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function MiniCard({ term, status }: { term: Term; status: ProgressStatus }) {
  const meta = STATUS_META[status];
  return (
    <Link
      to={`/library/${term.id}`}
      className="flex w-[220px] shrink-0 snap-start flex-col rounded-xl border bg-surface p-3.5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="h-1.5 w-6 rounded-full" style={{ backgroundColor: topicVar(term.topic) }} />
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em]', meta.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
      </div>
      <div className="mt-2 line-clamp-2 font-display text-[15px] font-semibold leading-snug">{term.term}</div>
      <div className="mt-1 line-clamp-2 text-[11.5px] leading-[1.5] text-ink-muted">{term.definition}</div>
    </Link>
  );
}

/** Кольцо темы: доля выученных (learned/total). */
function TopicRing({ topic, learned, total }: { topic: TopicId; learned: number; total: number }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  const frac = total > 0 ? learned / total : 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[76px] w-[76px]">
        <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
          <circle cx="38" cy="38" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
          <motion.circle
            cx="38"
            cy="38"
            r={R}
            fill="none"
            stroke={topicVar(topic)}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - frac) }}
            transition={{ duration: 0.9, ease: easeOut }}
          />
        </svg>
        <span className="tnum absolute inset-0 flex items-center justify-center text-[14px] font-bold">
          {Math.round(frac * 100)}%
        </span>
      </div>
      <span className="text-[11.5px] font-semibold text-ink-muted">{TOPIC_TITLES[topic]}</span>
    </div>
  );
}

export default function Home() {
  const dataset = useAppStore((s) => s.dataset);
  const progress = useAppStore((s) => s.progress);
  const progressLoaded = useAppStore((s) => s.progressLoaded);
  const loadData = useAppStore((s) => s.loadData);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!dataset) void loadData();
  }, [dataset, loadData]);

  const stats = useMemo(() => {
    if (!dataset) return null;
    const now = Date.now();
    const byStatus: Record<ProgressStatus, Term[]> = { new: [], learning: [], learned: [], weak: [], due: [] };
    const learnedByTopic: Record<TopicId, { learned: number; total: number }> = {
      grammar: { learned: 0, total: 0 },
      phonetics: { learned: 0, total: 0 },
      lexicology: { learned: 0, total: 0 },
      stylistics: { learned: 0, total: 0 },
    };
    for (const t of dataset.terms) {
      const st = computeStatus(progress.get(t.id), now);
      byStatus[st].push(t);
      learnedByTopic[t.topic].total += 1;
      if (st === 'learned') learnedByTopic[t.topic].learned += 1;
    }
    return { byStatus, learnedByTopic };
  }, [dataset, progress]);

  if (!dataset || !progressLoaded || !stats) {
    return (
      <div className="mx-auto w-full max-w-[1080px] space-y-4 px-4 py-8">
        <div className="h-9 w-72 animate-pulse rounded-lg bg-surface-2" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }

  const { byStatus, learnedByTopic } = stats;
  const dueCount = byStatus.due.length;
  const newCount = byStatus.new.length;
  const learnedCount = byStatus.learned.length;
  const total = dataset.terms.length;
  const firstRun = progress.size === 0;

  return (
    <motion.div
      variants={container}
      initial={reduceMotion ? false : 'hidden'}
      animate="show"
      className="mx-auto w-full max-w-[1080px] px-4 py-6 lg:px-6 lg:py-8"
    >
      {/* 3. Greeting + CTA */}
      <motion.div variants={item} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.01em] lg:text-[32px]">
            {greeting(new Date())}.
          </h1>
          <p className="mt-1 text-[14.5px] text-ink-muted">
            {firstRun
              ? `В библиотеке ${total} ${plural(total, 'термин', 'термина', 'терминов')} — начнём?`
              : dueCount > 0
                ? `Сегодня к повторению: ${dueCount} ${plural(dueCount, 'термин', 'термина', 'терминов')}.`
                : 'На сегодня всё повторено. Можно взять новые термины.'}
          </p>
        </div>
        <Link
          to="/train/setup"
          className="inline-flex items-center gap-2 rounded-2xl bg-terra px-5 py-3 text-[15px] font-semibold text-surface shadow-md transition-all hover:bg-terra-hover hover:shadow-lg"
        >
          <Play className="h-4 w-4" />
          {dueCount > 0 ? `Тренировать (${dueCount})` : 'Начать тренировку'}
        </Link>
      </motion.div>

      {/* 4. KPI-полоса */}
      <motion.section variants={item} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Flame, cls: 'text-terra', value: dueCount, label: 'К повторению' },
          { icon: Sparkles, cls: 'text-st-learning', value: newCount, label: 'Новых' },
          { icon: GraduationCap, cls: 'text-st-learned', value: learnedCount, label: 'Выучено' },
          { icon: Layers, cls: 'text-info', value: total, label: 'Всего терминов' },
        ].map(({ icon: Icon, cls, value, label }) => (
          <div key={label} className="rounded-2xl border bg-surface p-4 shadow-sm">
            <Icon className={cn('h-[18px] w-[18px]', cls)} strokeWidth={1.75} />
            <div className="tnum mt-2 font-display text-[24px] font-semibold leading-none">{value}</div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">{label}</div>
          </div>
        ))}
      </motion.section>

      {/* 5. Кольца тем */}
      <motion.section variants={item} className="mt-4 rounded-2xl border bg-surface p-5 shadow-sm">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">Прогресс по темам</h2>
        <div className="mt-4 flex flex-wrap justify-around gap-4">
          {TOPIC_ORDER.map((t) => (
            <TopicRing key={t} topic={t} learned={learnedByTopic[t].learned} total={learnedByTopic[t].total} />
          ))}
        </div>
      </motion.section>

      {/* 6. Ряды due / новые */}
      {dueCount > 0 && (
        <motion.section variants={item} className="mt-8">
          <header className="flex items-center justify-between">
            <h2 className="font-display text-[20px] font-semibold">Пора повторить</h2>
            <Link
              to={sessionHref({ pool: 'due' })}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-terra transition-colors hover:text-terra-hover"
            >
              Тренировать все
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          <div className="mask-fade-x -mx-4 mt-3 overflow-x-auto px-4 pb-2 scrollbar-none lg:mx-0 lg:px-0">
            <div className="flex snap-x gap-3">
              {byStatus.due.slice(0, 10).map((t) => (
                <MiniCard key={t.id} term={t} status="due" />
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {newCount > 0 && (
        <motion.section variants={item} className="mt-8">
          <header className="flex items-center justify-between">
            <h2 className="font-display text-[20px] font-semibold">Новые термины</h2>
            <Link
              to={sessionHref({ pool: 'new' })}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-terra transition-colors hover:text-terra-hover"
            >
              Учить новые
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          <div className="mask-fade-x -mx-4 mt-3 overflow-x-auto px-4 pb-2 scrollbar-none lg:mx-0 lg:px-0">
            <div className="flex snap-x gap-3">
              {byStatus.new.slice(0, 10).map((t) => (
                <MiniCard key={t.id} term={t} status="new" />
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* 7. Слабые */}
      {byStatus.weak.length > 0 && (
        <motion.section variants={item} className="mt-8">
          <header className="flex items-center justify-between">
            <h2 className="font-display text-[20px] font-semibold text-st-weak">Слабые места</h2>
            <Link
              to={sessionHref({ pool: 'weak' })}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-terra transition-colors hover:text-terra-hover"
            >
              Проработать
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          <div className="mask-fade-x -mx-4 mt-3 overflow-x-auto px-4 pb-2 scrollbar-none lg:mx-0 lg:px-0">
            <div className="flex snap-x gap-3">
              {byStatus.weak.slice(0, 10).map((t) => (
                <MiniCard key={t.id} term={t} status="weak" />
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* 8. Быстрые действия */}
      <motion.section variants={item} className="mt-8">
        <h2 className="font-display text-[20px] font-semibold">Быстрые действия</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            {
              to: '/train/setup',
              icon: TrendingUp,
              title: 'Своя сессия',
              text: 'Выбрать темы, режимы и длину сессии вручную.',
            },
            {
              to: '/library',
              icon: Library,
              title: 'Библиотека',
              text: `Все ${total} ${plural(total, 'термин', 'термина', 'терминов')} с поиском и фильтрами.`,
            },
            {
              to: '/graph',
              icon: Waypoints,
              title: 'Граф связей',
              text: 'Посмотреть, как термины связаны друг с другом.',
            },
          ].map(({ to, icon: Icon, title, text }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-terra-soft text-terra">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </div>
              <div className="mt-2.5 flex items-center gap-1 text-[14.5px] font-bold">
                {title}
                <ArrowRight className="h-3.5 w-3.5 text-ink-faint transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">{text}</div>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* 9. Совет */}
      <motion.section variants={item} className="mt-8">
        <div className="rounded-2xl border border-terra/25 bg-terra-soft p-4">
          <div className="flex items-start gap-3">
            <BookOpenText className="mt-0.5 h-5 w-5 shrink-0 text-terra" strokeWidth={1.75} />
            <div>
              <div className="text-[13.5px] font-bold text-terra-ink">Совет дня</div>
              <p className="mt-1 text-[13px] leading-[1.6] text-ink-muted">
                Короткие сессии по 10–15 карточек каждый день эффективнее марафона раз в неделю. SM-2 сам подбросит
                то, что пора повторить.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {firstRun && (
        <motion.p variants={item} className="mt-6 text-center text-[13px] font-medium text-ink-faint">
          <Plus className="mr-1 inline h-3.5 w-3.5" />
          Прогресс хранится локально — можно спокойно закрывать вкладку.
        </motion.p>
      )}
    </motion.div>
  );
}
