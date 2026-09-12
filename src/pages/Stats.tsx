// Статистика и данные (design/stats.md). Route: `/stats` (`#settings` — якорь настроек).
// KPI, тепловая карта 26 недель, mastery по темам, история сессий, достижения,
// настройки (цель, precision-пресеты, тема), экспорт/импорт/сброс прогресса.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  AudioLines,
  BookA,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crosshair,
  Download,
  Feather,
  Flame,
  Footprints,
  HardDrive,
  Hash,
  Languages,
  Loader,
  Lock,
  Monitor,
  Moon,
  PenLine,
  Play,
  RotateCcw,
  Sun,
  Target,
  Trash2,
  Trophy,
  Upload,
  Volume2,
  Waypoints,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { db, computeStatus, type SessionRecord } from '@/lib/progress';
import type { Term, TopicId } from '@/lib/data';
import { cn } from '@/lib/utils';

const DAY_MS = 86_400_000;
const HEAT_WEEKS = 26;

// ---- localStorage keys (shared contract, see report) ----
const LS_DAILY_GOAL = 'lingo-cards-daily-goal';
const LS_PRECISION = 'lingo-cards-precision-preset';
const LS_THEME_MODE = 'lingo-cards-theme-mode';
const LS_HINT = 'lingo-cards-hint-first-letter';
const LS_TTS = 'lingo-cards-tts';
const LS_CLUSTER_SESSIONS = 'lingo-cards-cluster-sessions';
const LS_ACHIEVEMENTS = 'lingo-cards-achievements';

const TOPIC_ICONS: Record<TopicId, typeof PenLine> = {
  grammar: PenLine,
  phonetics: AudioLines,
  lexicology: BookA,
  stylistics: Feather,
};

const MODE_LABELS: Record<string, string> = {
  'def2term-input': 'Ввод термина',
  'def2term-choice': 'Выбор термина',
  'term2def-choice': 'Выбор определения',
  'term2def-precision': 'Свой ответ',
};

type PrecisionPreset = 'soft' | 'standard' | 'exam';
const PRECISION_PRESETS: Record<PrecisionPreset, { label: string; exact: number; general: number; partial: number }> = {
  soft: { label: 'Мягкий', exact: 85, general: 60, partial: 40 },
  standard: { label: 'Стандарт', exact: 90, general: 70, partial: 50 },
  exam: { label: 'Строгий экзамен', exact: 95, general: 80, partial: 60 },
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function formatSessionDate(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function readLS(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Count-up animation for KPI numbers (stats.md §1). */
function useCountUp(target: number, duration = 0.9): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
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

/** Current streak + all-time record (days). */
function computeStreaks(sessions: SessionRecord[]): { current: number; record: number } {
  if (sessions.length === 0) return { current: 0, record: 0 };
  const days = new Set(sessions.map((s) => dayStart(s.finishedAt)));
  const today = dayStart(Date.now());
  let cursor = days.has(today) ? today : today - DAY_MS;
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor -= DAY_MS;
  }
  const sorted = [...days].sort((a, b) => a - b);
  let record = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] - sorted[i - 1] === DAY_MS ? run + 1 : 1;
    if (run > record) record = run;
  }
  return { current, record: Math.max(record, current) };
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const sectionReveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};

interface SegOption<T extends string | number> {
  value: T;
  label: string;
  icon?: typeof Sun;
}

/** SegmentedControl (design.md §6): surface-2 track, spring indicator via layoutId. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm"
              />
            )}
            {Icon && <Icon className="relative z-10 h-4 w-4" strokeWidth={1.75} />}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Toggle (design.md §6): 44×26, thumb 20, spring x. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-terra' : 'bg-surface-3',
      )}
    >
      <motion.span
        animate={{ x: checked ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="absolute top-[3px] left-0 block h-5 w-5 rounded-full bg-surface shadow-sm"
      />
    </button>
  );
}

interface ToastMsg {
  id: number;
  text: string;
  icon: 'ok' | 'info' | 'error';
}

function Toast({ toast }: { toast: ToastMsg | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 lg:bottom-8">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 py-2.5 text-sm font-semibold shadow-lg"
          >
            {toast.icon === 'ok' && <CheckCircle2 className="h-4 w-4 text-success" />}
            {toast.icon === 'info' && <Clock className="h-4 w-4 text-info" />}
            {toast.icon === 'error' && <AlertCircle className="h-4 w-4 text-error" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Center modal / bottom-sheet on mobile (design.md §6 BottomSheet). */
function Sheet({
  open,
  onClose,
  title,
  children,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 backdrop-blur-[8px] sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full max-w-[560px] rounded-t-3xl border border-border bg-surface p-5 pb-8 shadow-lg sm:rounded-2xl sm:pb-5',
              danger && 'border-error/40',
            )}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-surface-3 sm:hidden" />
            <h3 className="font-display text-[19px] font-semibold">{title}</h3>
            <div className="mt-3">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Heatmap (stats.md §2): 26 weeks, GitHub-style, from SessionRecord.
// ---------------------------------------------------------------------------

interface DayInfo {
  ts: number;
  questions: number;
  correct: number;
  sessionIds: number[];
}

interface HoverInfo {
  x: number;
  y: number;
  text: string;
}

function Heatmap({
  byDay,
  onPickDay,
}: {
  byDay: Map<string, DayInfo>;
  onPickDay: (info: DayInfo) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Columns: 26 weeks ending today. Rows: Mon..Sun.
  const weeks = useMemo(() => {
    const today = dayStart(Date.now());
    const dow = (new Date(today).getDay() + 6) % 7; // Mon=0
    const start = today - dow * DAY_MS - (HEAT_WEEKS - 1) * 7 * DAY_MS;
    const cols: { ts: number; info: DayInfo | null; future: boolean }[][] = [];
    for (let w = 0; w < HEAT_WEEKS; w++) {
      const col: { ts: number; info: DayInfo | null; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const ts = start + (w * 7 + d) * DAY_MS;
        col.push({ ts, info: byDay.get(dayKey(ts)) ?? null, future: ts > today });
      }
      cols.push(col);
    }
    return cols;
  }, [byDay]);

  const monthLabels = useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let prev = -1;
    weeks.forEach((col, i) => {
      const m = new Date(col[0].ts).getMonth();
      if (m !== prev) {
        labels.push({ index: i, label: new Date(col[0].ts).toLocaleDateString('ru-RU', { month: 'short' }) });
        prev = m;
      }
    });
    return labels;
  }, [weeks]);

  // Start scrolled to the most recent weeks.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const levelOf = (q: number): number => {
    if (q <= 0) return 0;
    if (q < 10) return 1;
    if (q < 20) return 2;
    if (q < 40) return 3;
    return 4;
  };
  const LEVEL_ALPHA = [0, 25, 45, 70, 100];

  const todayKey = dayKey(Date.now());
  const cellText = (ts: number, info: DayInfo | null): string => {
    const date = new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (!info) return `${date} · нет тренировок`;
    const acc = info.questions > 0 ? Math.round((100 * info.correct) / info.questions) : 0;
    return `${date} · ${info.questions} ${plural(info.questions, 'вопрос', 'вопроса', 'вопросов')} · точность ${acc}%`;
  };

  let cellIndex = 0;

  return (
    <div className="relative">
      <div ref={scrollRef} className="scrollbar-none overflow-x-auto pb-1" style={{ scrollSnapType: 'x proximity' }}>
        <div className="inline-block pr-1">
          {/* month labels */}
          <div className="relative mb-1.5 h-4" style={{ width: HEAT_WEEKS * 14 }}>
            {monthLabels.map((m) => (
              <span
                key={m.index}
                className="absolute text-[11px] font-bold tracking-[0.02em] text-ink-faint"
                style={{ left: m.index * 14 }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((col, w) => (
              <div key={w} className="flex flex-col gap-[3px]">
                {col.map((cell, d) => {
                  const level = cell.info ? levelOf(cell.info.questions) : 0;
                  const isToday = dayKey(cell.ts) === todayKey;
                  const idx = cellIndex++;
                  if (cell.future) {
                    return <span key={d} className="h-[11px] w-[11px]" />;
                  }
                  return (
                    <motion.button
                      key={d}
                      type="button"
                      initial={{ scale: 0, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 32, delay: Math.min(idx * 0.004, 1.2) }}
                      aria-label={cellText(cell.ts, cell.info)}
                      onMouseEnter={(e) => {
                        const host = (e.currentTarget.closest('[data-heat]') as HTMLElement | null);
                        const r = e.currentTarget.getBoundingClientRect();
                        const hr = host?.getBoundingClientRect();
                        setHover({
                          x: r.left - (hr?.left ?? 0) + r.width / 2,
                          y: r.top - (hr?.top ?? 0),
                          text: cellText(cell.ts, cell.info),
                        });
                      }}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => {
                        const host = (e.currentTarget.closest('[data-heat]') as HTMLElement | null);
                        const r = e.currentTarget.getBoundingClientRect();
                        const hr = host?.getBoundingClientRect();
                        setHover({
                          x: r.left - (hr?.left ?? 0) + r.width / 2,
                          y: r.top - (hr?.top ?? 0),
                          text: cellText(cell.ts, cell.info),
                        });
                      }}
                      onBlur={() => setHover(null)}
                      onClick={() => cell.info && onPickDay(cell.info)}
                      className={cn(
                        'h-[11px] w-[11px] rounded-[3px] transition-transform duration-150',
                        level === 0 && 'border border-border bg-surface-2',
                        cell.info && 'cursor-pointer hover:scale-125',
                        isToday && 'ring-1 ring-terra animate-due-pulse',
                      )}
                      style={
                        level > 0
                          ? { backgroundColor: `color-mix(in srgb, var(--accent) ${LEVEL_ALPHA[level]}%, transparent)` }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {/* legend */}
          <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-semibold text-ink-faint">
            <span className="mr-1">Меньше</span>
            {LEVEL_ALPHA.map((a, i) => (
              <span
                key={i}
                className={cn('h-[11px] w-[11px] rounded-[3px]', i === 0 && 'border border-border bg-surface-2')}
                style={i > 0 ? { backgroundColor: `color-mix(in srgb, var(--accent) ${a}%, transparent)` } : undefined}
              />
            ))}
            <span className="ml-1">Больше</span>
          </div>
        </div>
      </div>
      {/* tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface/95 px-2 py-1.5 text-[12.5px] font-medium whitespace-nowrap shadow-md backdrop-blur-[8px]"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mastery by topic (stats.md §3)
// ---------------------------------------------------------------------------

interface TopicMastery {
  id: TopicId;
  title: string;
  total: number;
  learned: number;
  learning: number;
  weak: number;
  due: number;
  fresh: number;
}

function MasteryBar({ m, index }: { m: TopicMastery; index: number }) {
  const pct = (n: number) => (m.total > 0 ? (n / m.total) * 100 : 0);
  const segments = [
    { n: m.learned, color: 'var(--st-learned)' },
    { n: m.learning, color: 'var(--st-learning)' },
    { n: m.weak, color: 'var(--st-weak)' },
    { n: m.fresh, color: 'var(--st-new)' },
  ];
  return (
    <div className="mt-3">
      <div className="relative flex h-2 overflow-hidden rounded-full bg-surface-2">
        {segments.map((s, i) => (
          <motion.span
            key={i}
            initial={{ width: 0 }}
            whileInView={{ width: `${pct(s.n)}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 + index * 0.08 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ backgroundColor: s.color }}
            className="h-full"
          />
        ))}
        {/* due hatch: overlays the leading (learned/learning) part */}
        {m.due > 0 && (
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.6 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.9 + index * 0.08 }}
            className="absolute top-0 left-0 h-full"
            style={{
              width: `${pct(Math.min(m.due, m.learned + m.learning))}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--st-due) 0 2px, transparent 2px 6px)',
            }}
            title={`${m.due} ждут повторения`}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-st-learned" /> выучено {m.learned}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-st-learning" /> в процессе {m.learning}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-st-weak" /> слабые {m.weak}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-st-due" /> к повторению {m.due}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-st-new" /> новые {m.fresh}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session history (stats.md §4)
// ---------------------------------------------------------------------------

function AccuracyRing({ acc }: { acc: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const color = acc >= 80 ? 'var(--st-learned)' : acc >= 60 ? 'var(--st-learning)' : 'var(--st-weak)';
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
      <motion.circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        whileInView={{ strokeDashoffset: c * (1 - acc / 100) }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

function SessionRow({
  session,
  termById,
  topicColor,
  expanded,
  highlighted,
  onToggle,
}: {
  session: SessionRecord;
  termById: Map<string, Term>;
  topicColor: (id: string) => string;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const acc = session.questionCount > 0 ? Math.round((100 * session.correct) / session.questionCount) : 0;
  const errors = session.answers.filter((a) => !a.ok);
  const modes = [...new Set(session.answers.map((a) => a.mode))];
  const isMix = session.topics.length > 1;

  return (
    <motion.div
      layout="position"
      id={`session-${session.id ?? 0}`}
      animate={highlighted ? { backgroundColor: ['var(--accent-soft)', 'transparent'] } : {}}
      transition={{ duration: 1.2 }}
      className="rounded-xl"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition-colors hover:bg-surface-2/60"
      >
        <div className="min-w-[92px]">
          <div className="text-sm font-semibold">{formatSessionDate(session.finishedAt)}</div>
          <div className="text-[12.5px] font-medium text-ink-faint">
            {formatDuration(session.finishedAt - session.startedAt)}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {session.topics.slice(0, 4).map((t) => (
            <span
              key={t}
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: topicColor(t) }}
              title={t}
            />
          ))}
          <span className="truncate text-[12.5px] font-medium text-ink-muted">
            {isMix ? 'Микс' : topicName(session.topics[0])}
          </span>
        </div>
        <span className="tnum font-mono text-[13px] font-medium text-ink-muted">
          {session.questionCount} {plural(session.questionCount, 'вопрос', 'вопроса', 'вопросов')}
        </span>
        <span className="flex items-center gap-1.5">
          <AccuracyRing acc={acc} />
          <span className="tnum w-9 text-right font-mono text-[13px] font-medium">{acc}%</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200', expanded && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {modes.map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12.5px] font-semibold text-ink-muted"
                  >
                    {MODE_LABELS[m] ?? m}
                  </span>
                ))}
                <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12.5px] font-semibold text-ink-muted">
                  пул: умный микс
                </span>
              </div>
              {errors.length > 0 ? (
                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-faint">
                    Ошибки · {errors.length}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {errors.slice(0, 8).map((a, i) => {
                      const term = termById.get(a.termId);
                      return (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-st-weak" />
                          <span className="font-semibold">{term?.term ?? a.termId}</span>
                          {typeof a.score === 'number' && (
                            <span className="tnum font-mono text-[12.5px] text-ink-faint">{a.score}%</span>
                          )}
                        </li>
                      );
                    })}
                    {errors.length > 8 && (
                      <li className="text-[12.5px] font-medium text-ink-faint">и ещё {errors.length - 8}…</li>
                    )}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> Без ошибок — отличная сессия
                </p>
              )}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/train/session?${new URLSearchParams({
                        pool: 'all',
                        count: String(session.questionCount),
                        topics: session.topics.join(','),
                        mixReview: '1',
                      }).toString()}`,
                    )
                  }
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-terra-ink transition-colors hover:bg-terra-soft"
                >
                  <RotateCcw className="h-4 w-4" /> Повторить эту сессию
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function topicName(id: string | undefined): string {
  switch (id) {
    case 'grammar':
      return 'Грамматика';
    case 'phonetics':
      return 'Фонетика';
    case 'lexicology':
      return 'Лексикология';
    case 'stylistics':
      return 'Стилистика';
    default:
      return 'Микс';
  }
}

// ---------------------------------------------------------------------------
// Achievements (stats.md §5)
// ---------------------------------------------------------------------------

interface Achievement {
  id: string;
  title: string;
  icon: typeof Flame;
  unlocked: boolean;
  progress?: { current: number; target: number };
  condition: string;
}

function AchievementsRow({
  items,
  unlockedAt,
  onToast,
}: {
  items: Achievement[];
  unlockedAt: Record<string, number>;
  onToast: (text: string, icon: ToastMsg['icon']) => void;
}) {
  return (
    <div className="scrollbar-none mask-fade-x -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" style={{ scrollSnapType: 'x mandatory' }}>
      <div className="flex gap-4 pb-1">
        {items.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.button
              key={a.id}
              type="button"
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 400, damping: 28, delay: Math.min(i * 0.05, 0.5) }}
              onClick={() =>
                a.unlocked
                  ? onToast(
                      `«${a.title}» — получено ${
                        unlockedAt[a.id]
                          ? new Date(unlockedAt[a.id]).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
                          : 'недавно'
                      }`,
                      'ok',
                    )
                  : onToast(`«${a.title}»: ${a.condition}`, 'info')
              }
              className="flex w-24 shrink-0 flex-col items-center gap-2"
              style={{ scrollSnapAlign: 'start' }}
              aria-label={`${a.title}: ${a.unlocked ? 'открыто' : `закрыто — ${a.condition}`}`}
            >
              <span
                className={cn(
                  'relative flex h-16 w-16 items-center justify-center rounded-full transition-colors',
                  a.unlocked ? 'bg-terra-soft ring-1 ring-terra/50' : 'bg-surface-2',
                )}
              >
                <Icon className={cn('h-7 w-7', a.unlocked ? 'text-terra' : 'text-ink-faint opacity-60')} strokeWidth={1.75} />
                {!a.unlocked && (
                  <span className="absolute right-0 bottom-0 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface">
                    <Lock className="h-3 w-3 text-ink-faint" />
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-center text-[12.5px] leading-4 font-medium tracking-[0.02em]',
                  a.unlocked ? 'text-ink' : 'text-ink-faint',
                )}
              >
                {a.title}
                {!a.unlocked && a.progress && (
                  <span className="tnum mt-0.5 block font-mono text-[11px] text-ink-faint">
                    {Math.min(a.progress.current, a.progress.target)} / {a.progress.target}
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface ExportPayload {
  app: 'lingo-cards';
  version: 1;
  exportedAt: number;
  settings: Record<string, string>;
  progress: unknown[];
  sessions: unknown[];
}

const EXPORTED_SETTINGS_KEYS = [
  LS_DAILY_GOAL,
  LS_PRECISION,
  LS_THEME_MODE,
  LS_HINT,
  LS_TTS,
  'lingo-cards-onboarded',
  'lingo-cards-train-topics',
  'lingo-cards-include-en',
  'lingo-cards-theme',
];

export default function Stats() {
  const location = useLocation();
  const dataset = useAppStore((s) => s.dataset);
  const datasetLoading = useAppStore((s) => s.datasetLoading);
  const datasetError = useAppStore((s) => s.datasetError);
  const loadData = useAppStore((s) => s.loadData);
  const progress = useAppStore((s) => s.progress);
  const progressLoaded = useAppStore((s) => s.progressLoaded);
  const refreshProgress = useAppStore((s) => s.refreshProgress);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);

  // settings state
  const [dailyGoal, setDailyGoal] = useState(() => readLS(LS_DAILY_GOAL, '20'));
  const [precision, setPrecision] = useState<PrecisionPreset>(() => {
    const v = readLS(LS_PRECISION, 'standard');
    return v === 'soft' || v === 'exam' ? v : 'standard';
  });
  const [themeMode, setThemeMode] = useState(() => readLS(LS_THEME_MODE, theme));
  const [hintFirst, setHintFirst] = useState(() => readLS(LS_HINT, '1') !== '0');
  const [tts, setTts] = useState(() => readLS(LS_TTS, '1') !== '0');

  // import / reset state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPayload, setImportPayload] = useState<ExportPayload | null>(null);
  const [importBackup, setImportBackup] = useState(true);
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetText, setResetText] = useState('');

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const reloadSessions = useMemo(
    () => () => db.sessions.orderBy('finishedAt').reverse().toArray().then(setSessions),
    [],
  );

  useEffect(() => {
    if (!progressLoaded) return;
    void reloadSessions();
  }, [progressLoaded, progress, reloadSessions]);

  // Deep-link /stats#settings — scroll once data is in.
  useEffect(() => {
    if (location.hash === '#settings' && sessions !== null) {
      const t = setTimeout(() => {
        document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [location.hash, sessions]);

  const showToast = useMemo(
    () => (text: string, icon: ToastMsg['icon']) => {
      setToast({ id: Date.now(), text, icon });
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- derived data ----
  const now = Date.now();
  const counts = useMemo(() => {
    let learned = 0;
    let learning = 0;
    let weak = 0;
    let due = 0;
    for (const p of progress.values()) {
      const st = computeStatus(p, now);
      if (st === 'learned') learned++;
      else if (st === 'learning') learning++;
      else if (st === 'weak') weak++;
      else if (st === 'due') due++;
    }
    return { learned, learning, weak, due };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const totalTerms = dataset?.terms.length ?? 0;
  const streaks = useMemo(() => computeStreaks(sessions ?? []), [sessions]);

  const byDay = useMemo(() => {
    const map = new Map<string, DayInfo>();
    for (const s of sessions ?? []) {
      const key = dayKey(s.finishedAt);
      const cur = map.get(key) ?? { ts: dayStart(s.finishedAt), questions: 0, correct: 0, sessionIds: [] };
      cur.questions += s.questionCount;
      cur.correct += s.correct;
      if (typeof s.id === 'number') cur.sessionIds.push(s.id);
      map.set(key, cur);
    }
    return map;
  }, [sessions]);

  const mastery = useMemo<TopicMastery[]>(() => {
    if (!dataset) return [];
    const byTopic = new Map<TopicId, TopicMastery>();
    for (const t of dataset.topics) {
      byTopic.set(t.id, { id: t.id, title: t.title, total: 0, learned: 0, learning: 0, weak: 0, due: 0, fresh: 0 });
    }
    for (const term of dataset.terms) {
      const m = byTopic.get(term.topic);
      if (!m) continue;
      m.total++;
      const p = progress.get(term.id);
      const st = p ? computeStatus(p, now) : 'new';
      if (st === 'learned') m.learned++;
      else if (st === 'learning') m.learning++;
      else if (st === 'weak') m.weak++;
      else if (st === 'due') m.due++;
      else m.fresh++;
    }
    return [...byTopic.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, progress]);

  const termById = useMemo(() => {
    const map = new Map<string, Term>();
    for (const t of dataset?.terms ?? []) map.set(t.id, t);
    return map;
  }, [dataset]);

  const topicColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of dataset?.topics ?? []) map.set(t.id, t.color);
    return (id: string) => map.get(id) ?? 'var(--accent)';
  }, [dataset]);

  const achievements = useMemo<Achievement[]>(() => {
    const list = sessions ?? [];
    const totalAnswers = list.reduce((a, s) => a + s.questionCount, 0);
    const enTerms = (dataset?.terms ?? []).filter((t) => t.lang === 'en');
    const learnedEn = enTerms.filter((t) => {
      const p = progress.get(t.id);
      return p && ['learned', 'due'].includes(computeStatus(p, now));
    }).length;
    const topicDone = (id: TopicId) => {
      const terms = (dataset?.terms ?? []).filter((t) => t.topic === id);
      if (terms.length === 0) return { done: false, n: 0, total: 0 };
      const n = terms.filter((t) => {
        const p = progress.get(t.id);
        return p && ['learned', 'due'].includes(computeStatus(p, now));
      }).length;
      return { done: n === terms.length, n, total: terms.length };
    };
    const phon = topicDone('phonetics');
    const styl = topicDone('stylistics');
    const sniperN = list.reduce(
      (a, s) => a + s.answers.filter((x) => x.mode === 'term2def-precision' && (x.score ?? 0) >= 90).length,
      0,
    );
    const clusterN = Number(readLS(LS_CLUSTER_SESSIONS, '0')) || 0;
    const perfect = list.some((s) => s.questionCount >= 20 && s.correct === s.questionCount);
    return [
      {
        id: 'first-steps',
        title: 'Первые шаги',
        icon: Footprints,
        unlocked: list.length >= 1,
        progress: { current: list.length, target: 1 },
        condition: 'заверши первую тренировку',
      },
      {
        id: 'hundred',
        title: 'Первая сотня',
        icon: Hash,
        unlocked: totalAnswers >= 100,
        progress: { current: totalAnswers, target: 100 },
        condition: 'дай 100 ответов',
      },
      {
        id: 'phonetics-done',
        title: 'Фонетика закрыта',
        icon: AudioLines,
        unlocked: phon.done,
        progress: { current: phon.n, target: phon.total },
        condition: 'выучи все термины фонетики',
      },
      {
        id: 'stylistics-done',
        title: 'Стилистика закрыта',
        icon: Feather,
        unlocked: styl.done,
        progress: { current: styl.n, target: styl.total },
        condition: 'выучи все термины стилистики',
      },
      {
        id: 'week-fire',
        title: 'Неделя огня',
        icon: Flame,
        unlocked: streaks.record >= 7,
        progress: { current: streaks.record, target: 7 },
        condition: 'серия 7 дней подряд',
      },
      {
        id: 'sniper',
        title: 'Снайпер',
        icon: Crosshair,
        unlocked: sniperN >= 10,
        progress: { current: sniperN, target: 10 },
        condition: '10 precision-ответов ≥ 90%',
      },
      {
        id: 'polyglot',
        title: 'Полиглот',
        icon: Languages,
        unlocked: enTerms.length > 0 && learnedEn === enTerms.length,
        progress: { current: learnedEn, target: enTerms.length || 1 },
        condition: 'выучи все EN-термины',
      },
      {
        id: 'cartographer',
        title: 'Картограф',
        icon: Waypoints,
        unlocked: clusterN >= 10,
        progress: { current: clusterN, target: 10 },
        condition: '10 тренировок кластеров графа',
      },
      {
        id: 'perfectionist',
        title: 'Перфекционист',
        icon: Target,
        unlocked: perfect,
        condition: 'сессия 20+ вопросов без ошибок',
      },
      {
        id: 'marathon',
        title: 'Марафон',
        icon: Trophy,
        unlocked: streaks.record >= 30,
        progress: { current: streaks.record, target: 30 },
        condition: 'серия 30 дней подряд',
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, dataset, progress, streaks]);

  // Persist first-unlock dates for the achievement toasts.
  const [unlockedAt, setUnlockedAt] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(readLS(LS_ACHIEVEMENTS, '{}')) as Record<string, number>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    setUnlockedAt((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const a of achievements) {
        if (a.unlocked && !next[a.id]) {
          next[a.id] = Date.now();
          changed = true;
        }
      }
      if (changed) writeLS(LS_ACHIEVEMENTS, JSON.stringify(next));
      return changed ? next : prev;
    });
  }, [achievements]);

  // ---- settings handlers ----
  const applyThemeMode = (mode: string) => {
    setThemeMode(mode);
    writeLS(LS_THEME_MODE, mode);
    const resolved =
      mode === 'system'
        ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : (mode as 'light' | 'dark');
    setTheme(resolved);
  };

  // ---- data handlers ----
  const buildExport = async (): Promise<ExportPayload> => {
    const settings: Record<string, string> = {};
    for (const k of EXPORTED_SETTINGS_KEYS) {
      const v = readLS(k, '');
      if (v !== '') settings[k] = v;
    }
    return {
      app: 'lingo-cards',
      version: 1,
      exportedAt: Date.now(),
      settings,
      progress: await db.progress.toArray(),
      sessions: await db.sessions.toArray(),
    };
  };

  const downloadJson = (payload: ExportPayload, suffix = '') => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `lingo-cards-progress${suffix}-${d}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    downloadJson(await buildExport());
    showToast('Прогресс экспортирован', 'ok');
  };

  const handleImportFile = (file: File) => {
    file
      .text()
      .then((text) => {
        const data = JSON.parse(text) as ExportPayload;
        if (data?.app !== 'lingo-cards' || !Array.isArray(data.progress) || !Array.isArray(data.sessions)) {
          throw new Error('bad payload');
        }
        setImportPayload(data);
      })
      .catch(() => showToast('Не похоже на файл прогресса Lingo Cards', 'error'));
  };

  const confirmImport = async () => {
    const payload = importPayload;
    if (!payload) return;
    if (importBackup) downloadJson(await buildExport(), '-backup');
    await db.transaction('rw', db.progress, db.sessions, async () => {
      await db.progress.clear();
      await db.sessions.clear();
      await db.progress.bulkPut(payload.progress as never[]);
      await db.sessions.bulkPut(payload.sessions as never[]);
    });
    for (const [k, v] of Object.entries(payload.settings ?? {})) writeLS(k, v);
    const importedSettings = payload.settings ?? {};
    if (typeof importedSettings[LS_DAILY_GOAL] === 'string') setDailyGoal(importedSettings[LS_DAILY_GOAL]);
    if (typeof importedSettings[LS_PRECISION] === 'string') {
      const v = importedSettings[LS_PRECISION];
      setPrecision(v === 'soft' || v === 'exam' ? v : 'standard');
    }
    setImportPayload(null);
    await refreshProgress();
    await reloadSessions();
    showToast(`Импортировано: ${payload.sessions.length} ${plural(payload.sessions.length, 'сессия', 'сессии', 'сессий')}`, 'ok');
  };

  const confirmReset = async () => {
    await db.transaction('rw', db.progress, db.sessions, async () => {
      await db.progress.clear();
      await db.sessions.clear();
    });
    setResetStep(0);
    setResetText('');
    setExpandedId(null);
    await refreshProgress();
    await reloadSessions();
    showToast('Прогресс сброшен', 'ok');
  };

  const pickDay = (info: DayInfo) => {
    const id = info.sessionIds[info.sessionIds.length - 1];
    if (typeof id !== 'number') return;
    const index = (sessions ?? []).findIndex((s) => s.id === id);
    if (index >= visibleCount) setVisibleCount(Math.ceil((index + 1) / 8) * 8);
    setExpandedId(id);
    setHighlightId(id);
    setTimeout(() => {
      document.getElementById(`session-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    setTimeout(() => setHighlightId(null), 1600);
  };

  // ---- render ----
  // Hooks must stay above any early return.
  const learnedAnim = useCountUp(counts.learned);
  const learningAnim = useCountUp(counts.learning);
  const weakAnim = useCountUp(counts.weak);
  const totalAnim = useCountUp(totalTerms);

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

  const loading = datasetLoading || !dataset || sessions === null;
  const learnedPct = totalTerms > 0 ? Math.round((100 * counts.learned) / totalTerms) : 0;
  const preset = PRECISION_PRESETS[precision];
  const visibleSessions = (sessions ?? []).slice(0, visibleCount);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pt-6 pb-10 lg:px-6">
      {/* 1. Шапка */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-[28px] leading-[34px] font-semibold tracking-[-0.01em] lg:text-[34px] lg:leading-[40px]">
            Статистика
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
            <HardDrive className="h-3.5 w-3.5" />
            данные хранятся локально на этом устройстве
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 shadow-sm">
          <Flame className={cn('h-5 w-5', streaks.current > 0 ? 'text-terra' : 'text-ink-faint', streaks.current >= 3 && 'animate-flame-sway')} />
          {streaks.current > 0 ? (
            <>
              <span className="tnum font-mono text-[15px] font-medium">{streaks.current}</span>
              <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                {plural(streaks.current, 'день', 'дня', 'дней')} подряд · рекорд {streaks.record}
              </span>
            </>
          ) : (
            <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">серия ещё не начата</span>
          )}
        </div>
      </motion.section>

      {/* KPI cards */}
      <motion.section
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
        className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[
          {
            icon: BookOpen,
            label: `в словаре · 4 темы`,
            value: totalAnim,
            title: 'Всего терминов',
          },
          {
            icon: CheckCircle2,
            label: `из ${totalTerms} · ${learnedPct}%`,
            value: learnedAnim,
            title: 'Выучено',
            bar: learnedPct,
          },
          {
            icon: Loader,
            label: 'идёт освоение',
            value: learningAnim,
            title: 'В процессе',
          },
          {
            icon: AlertCircle,
            label: `к повторению ${counts.due}`,
            value: weakAnim,
            title: 'Слабые',
            due: counts.due,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
              }}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-terra-soft">
                  <Icon className="h-[18px] w-[18px] text-terra" strokeWidth={1.75} />
                </span>
                <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">{card.title}</span>
              </div>
              <div className="tnum mt-2 font-mono text-[30px] leading-[1.1] font-semibold tracking-[-0.02em]">
                {loading ? '—' : card.value}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                {'due' in card && card.due !== undefined && card.due > 0 && <Clock className="h-3.5 w-3.5 text-st-due" />}
                {card.label}
              </div>
              {typeof card.bar === 'number' && (
                <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${card.bar}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-st-learned"
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.section>

      {/* 2. Тепловая карта */}
      <motion.section {...sectionReveal} className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] leading-6 font-bold lg:text-[19px]">Активность</h2>
          <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">вопросов в день · 26 недель</span>
        </div>
        <div className="mt-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <Heatmap byDay={byDay} onPickDay={pickDay} />
        </div>
      </motion.section>

      {/* 3. Владение темами */}
      <motion.section {...sectionReveal} className="mt-10">
        <h2 className="text-[17px] leading-6 font-bold lg:text-[19px]">Владение темами</h2>
        <div className="mt-3 flex flex-col gap-3">
          {mastery.map((m, i) => {
            const Icon = TOPIC_ICONS[m.id];
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-[14px] border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `color-mix(in srgb, ${topicColor(m.id)} 14%, transparent)` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: topicColor(m.id) }} strokeWidth={1.75} />
                    </span>
                    <span className="text-[15px] font-bold">{m.title}</span>
                  </div>
                  <span className="tnum font-mono text-[13px] font-medium text-ink-muted">
                    {m.total > 0 ? Math.round((100 * m.learned) / m.total) : 0}% выучено
                  </span>
                </div>
                <MasteryBar m={m} index={i} />
                <div className="mt-2 flex justify-end">
                  <Link
                    to={`/train/session?${new URLSearchParams({ pool: 'force', count: '20', topics: m.id }).toString()}`}
                    className="rounded-lg px-2 py-1 text-sm font-semibold transition-colors hover:bg-surface-2"
                    style={{ color: topicColor(m.id) }}
                  >
                    Тренировать →
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* 4. История сессий */}
      <motion.section {...sectionReveal} className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] leading-6 font-bold lg:text-[19px]">История</h2>
          <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
            {(sessions ?? []).length} {plural((sessions ?? []).length, 'сессия', 'сессии', 'сессий')}
          </span>
        </div>
        {(sessions ?? []).length === 0 ? (
          <div className="mt-3 flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
            <img src={`${import.meta.env.BASE_URL}empty-stats.svg`} alt="" className="w-full max-w-[280px]" />
            <h3 className="mt-6 text-[17px] font-bold">Сессий пока нет</h3>
            <p className="mt-1.5 max-w-[320px] text-sm font-medium text-ink-muted">
              Первая тренировка появится здесь — с точностью, временем и разбором ошибок.
            </p>
            <Link
              to="/train/setup"
              className="mt-6 flex h-12 items-center gap-2 rounded-xl bg-terra px-6 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-terra-hover active:scale-[0.97]"
            >
              <Play className="h-[18px] w-[18px]" /> Начать первую тренировку
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-2">
              {visibleSessions.map((s) => (
                <SessionRow
                  key={s.id ?? s.finishedAt}
                  session={s}
                  termById={termById}
                  topicColor={topicColor}
                  expanded={expandedId === s.id}
                  highlighted={highlightId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : (s.id ?? null))}
                />
              ))}
            </div>
            {(sessions ?? []).length > visibleCount && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + 8)}
                  className="h-11 rounded-xl border border-border bg-surface-2 px-6 text-sm font-semibold transition-colors hover:bg-surface-3"
                >
                  Показать ещё 8
                </button>
              </div>
            )}
          </>
        )}
      </motion.section>

      {/* 5. Достижения */}
      <motion.section {...sectionReveal} className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] leading-6 font-bold lg:text-[19px]">Достижения</h2>
          <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
            {unlockedCount} из {achievements.length}
          </span>
        </div>
        <div className="mt-3">
          <AchievementsRow items={achievements} unlockedAt={unlockedAt} onToast={showToast} />
        </div>
      </motion.section>

      {/* 6. Данные и настройки */}
      <motion.section {...sectionReveal} id="settings" className="mt-10 scroll-mt-20">
        <h2 className="text-[17px] leading-6 font-bold lg:text-[19px]">Данные и настройки</h2>
        <div className="mt-3 rounded-2xl border border-border bg-surface shadow-sm">
          {/* Внешний вид */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-semibold">Тема оформления</div>
              <div className="mt-0.5 text-[12.5px] font-medium text-ink-faint">тёплая бумага или тёмные чернила</div>
            </div>
            <Segmented
              ariaLabel="Тема оформления"
              value={themeMode}
              onChange={applyThemeMode}
              options={[
                { value: 'light', label: 'Светлая', icon: Sun },
                { value: 'dark', label: 'Тёмная', icon: Moon },
                { value: 'system', label: 'Системная', icon: Monitor },
              ]}
            />
          </div>

          <div className="border-t border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Ежедневная цель</div>
                <div className="mt-0.5 text-[12.5px] font-medium text-ink-faint">мягкая, без давления</div>
              </div>
              <Segmented
                ariaLabel="Ежедневная цель"
                value={dailyGoal}
                onChange={(v) => {
                  setDailyGoal(v);
                  writeLS(LS_DAILY_GOAL, v);
                }}
                options={[
                  { value: '10', label: '10' },
                  { value: '20', label: '20' },
                  { value: '30', label: '30' },
                  { value: '50', label: '50' },
                ]}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Строгость precision mode</div>
                <div className="tnum mt-0.5 font-mono text-[12.5px] text-ink-faint">
                  точно ≥ {preset.exact}% · в целом ≥ {preset.general}% · частично ≥ {preset.partial}%
                </div>
              </div>
              <Segmented
                ariaLabel="Строгость precision mode"
                value={precision}
                onChange={(v) => {
                  setPrecision(v);
                  writeLS(LS_PRECISION, v);
                }}
                options={[
                  { value: 'soft' as PrecisionPreset, label: 'Мягкий' },
                  { value: 'standard' as PrecisionPreset, label: 'Стандарт' },
                  { value: 'exam' as PrecisionPreset, label: 'Экзамен' },
                ]}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Подсказка первой буквы после 2 ошибок</div>
              <Toggle
                label="Подсказка первой буквы после 2 ошибок"
                checked={hintFirst}
                onChange={(v) => {
                  setHintFirst(v);
                  writeLS(LS_HINT, v ? '1' : '0');
                }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Volume2 className="h-4 w-4 text-ink-muted" /> Озвучка терминов (TTS)
              </div>
              <Toggle
                label="Озвучка терминов (TTS)"
                checked={tts}
                onChange={(v) => {
                  setTts(v);
                  writeLS(LS_TTS, v ? '1' : '0');
                }}
              />
            </div>
          </div>

          {/* Данные */}
          <div className="border-t border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Экспорт прогресса</div>
                <div className="mt-0.5 text-[12.5px] font-medium text-ink-faint">
                  JSON-файл со статусами, историей и настройками
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-semibold transition-colors hover:bg-surface-3"
              >
                <Download className="h-4 w-4" /> Скачать JSON
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Импорт прогресса</div>
                <div className="mt-0.5 text-[12.5px] font-medium text-ink-faint">заменит текущие данные на этом устройстве</div>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-semibold transition-colors hover:bg-surface-3"
              >
                <Upload className="h-4 w-4" /> Загрузить JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {/* Danger zone */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <div>
              <div className="text-sm font-semibold text-error">Сбросить прогресс</div>
              <div className="mt-0.5 text-[12.5px] font-medium text-ink-faint">
                удалит все статусы и историю, настройки останутся
              </div>
            </div>
            <button
              type="button"
              onClick={() => setResetStep(1)}
              className="flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-error transition-colors hover:bg-error/10"
            >
              <Trash2 className="h-4 w-4" /> Сбросить
            </button>
          </div>

          <div className="border-t border-border p-4">
            <Link
              to="/welcome"
              className="text-sm font-semibold text-terra-ink transition-colors hover:text-terra"
            >
              Показать приветствие ещё раз
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Import confirm sheet */}
      <Sheet open={importPayload !== null} onClose={() => setImportPayload(null)} title="Импортировать прогресс?">
        {importPayload && (
          <>
            <p className="text-sm font-medium text-ink-muted">
              Заменит текущий прогресс ({(sessions ?? []).length}{' '}
              {plural((sessions ?? []).length, 'сессия', 'сессии', 'сессий')}, выучено {counts.learned}) данными из файла:{' '}
              {importPayload.sessions.length} {plural(importPayload.sessions.length, 'сессия', 'сессии', 'сессий')} от{' '}
              {new Date(importPayload.exportedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={importBackup}
                onChange={(e) => setImportBackup(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Создать бэкап перед импортом
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportPayload(null)}
                className="h-11 rounded-xl px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void confirmImport()}
                className="h-11 rounded-xl bg-terra px-5 text-sm font-semibold text-white transition-all hover:bg-terra-hover active:scale-[0.97]"
              >
                Импортировать
              </button>
            </div>
          </>
        )}
      </Sheet>

      {/* Reset: двойное подтверждение */}
      <Sheet open={resetStep === 1} onClose={() => setResetStep(0)} title="Сбросить весь прогресс?" danger>
        <p className="text-sm font-medium text-ink-muted">
          Будут удалены {(sessions ?? []).length} {plural((sessions ?? []).length, 'сессия', 'сессии', 'сессий')} и все
          статусы терминов. Действие необратимо.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setResetStep(0)}
            className="h-11 rounded-xl px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => setResetStep(2)}
            className="h-11 rounded-xl bg-error px-5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
          >
            Продолжить
          </button>
        </div>
      </Sheet>

      <Sheet open={resetStep === 2} onClose={() => setResetStep(0)} title="Последний шаг" danger>
        <p className="text-sm font-medium text-ink-muted">
          Введи <span className="tnum font-mono font-semibold text-error">СБРОС</span>, чтобы подтвердить удаление.
        </p>
        <input
          type="text"
          value={resetText}
          onChange={(e) => setResetText(e.target.value)}
          placeholder="СБРОС"
          autoComplete="off"
          className="mt-3 h-12 w-full rounded-xl border border-border bg-surface-2 px-4 font-mono text-sm font-medium outline-none transition-colors focus:border-border-strong"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setResetStep(0);
              setResetText('');
            }}
            className="h-11 rounded-xl px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={resetText !== 'СБРОС'}
            onClick={() => void confirmReset()}
            className="h-11 rounded-xl bg-error px-5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-45 disabled:hover:opacity-45"
          >
            Удалить навсегда
          </button>
        </div>
      </Sheet>

      <Toast toast={toast} />
    </div>
  );
}
