// Настройка сессии (design/session-setup.md). Route: /train/setup.
// Конструктор тренировки: темы, объём, режимы, пул, язык → /train/session?pool=…&count=…&topics=…&modes=…&en=…&mixReview=…

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  AudioLines,
  BookA,
  Check,
  Crosshair,
  Feather,
  GraduationCap,
  Info,
  Languages,
  List,
  ListChecks,
  PenLine,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  TextCursorInput,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { buildPool, type PoolMode } from '@/lib/session';
import type { Mode } from '@/lib/progress';
import type { TopicId } from '@/lib/data';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

// ---------- meta ----------

const TOPIC_ICONS: Record<TopicId, typeof PenLine> = {
  grammar: PenLine,
  phonetics: AudioLines,
  lexicology: BookA,
  stylistics: Feather,
};

type Difficulty = 'лёгкий' | 'средний' | 'сложный';

const MODE_META: {
  id: Mode;
  icon: typeof List;
  title: string;
  desc: string;
  difficulty: Difficulty;
}[] = [
  { id: 'def2term-choice', icon: ListChecks, title: 'Определение → выбор термина', desc: 'Выбери термин из 4 вариантов', difficulty: 'лёгкий' },
  { id: 'def2term-input', icon: TextCursorInput, title: 'Определение → ввод термина', desc: 'Напиши термин сам, опечатки прощаются', difficulty: 'средний' },
  { id: 'term2def-choice', icon: List, title: 'Термин → выбор определения', desc: 'Выбери верное определение из 4', difficulty: 'средний' },
  { id: 'term2def-precision', icon: Crosshair, title: 'Термин → своё определение', desc: 'Сформулируй определение — оценим в процентах', difficulty: 'сложный' },
];

const DIFF_STYLE: Record<Difficulty, { fg: string; bg: string }> = {
  'лёгкий': { fg: 'var(--topic-phonetics)', bg: 'color-mix(in srgb, var(--topic-phonetics) 14%, transparent)' },
  'средний': { fg: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 14%, transparent)' },
  'сложный': { fg: 'var(--accent)', bg: 'var(--accent-soft)' },
};

const POOL_META: { id: PoolMode; title: string; desc: string; badge?: string; exam?: boolean }[] = [
  { id: 'all', title: 'Умный микс', desc: 'Сначала просроченные и слабые, потом новые и в процессе', badge: 'рекомендуется' },
  { id: 'new', title: 'Только новые', desc: 'Термины, которые ещё не попадались' },
  { id: 'weak', title: 'Только слабые', desc: 'Термины с ошибками в последних сессиях' },
  { id: 'due', title: 'Только к повторению', desc: 'Выученные, у которых наступил срок повторения' },
  { id: 'force', title: 'Все принудительно', desc: 'Все термины выбранных тем, даже выученные — полный прогон перед зачётом', exam: true },
];

const POOL_SHORT: Record<PoolMode, string> = {
  all: 'умный микс',
  new: 'только новые',
  weak: 'только слабые',
  due: 'к повторению',
  force: 'экзамен',
};

const COUNT_PRESETS: (number | 'all')[] = [5, 10, 20, 50, 'all'];
const ALL_TOPICS: TopicId[] = ['grammar', 'phonetics', 'lexicology', 'stylistics'];
const ALL_MODES: Mode[] = MODE_META.map((m) => m.id);

// ---------- persistence ----------

interface SetupConfig {
  topics: TopicId[];
  count: number | 'all';
  modes: Mode[];
  pool: PoolMode;
  includeEN: boolean;
  mixReview: boolean;
}

interface Preset {
  name: string;
  config: SetupConfig;
}

const CONFIG_KEY = 'lingo-cards-setup-v1';
const PRESETS_KEY = 'lingo-cards-presets-v1';

const DEFAULT_CONFIG: SetupConfig = {
  topics: ALL_TOPICS,
  count: 20,
  modes: ['def2term-choice', 'def2term-input'],
  pool: 'all',
  includeEN: false,
  mixReview: true,
};

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function loadConfig(): SetupConfig {
  const saved = loadJSON<Partial<SetupConfig>>(CONFIG_KEY);
  if (!saved) return DEFAULT_CONFIG;
  return {
    topics: Array.isArray(saved.topics) && saved.topics.length > 0
      ? (saved.topics.filter((t) => ALL_TOPICS.includes(t as TopicId)) as TopicId[])
      : DEFAULT_CONFIG.topics,
    count: saved.count === 'all' || (typeof saved.count === 'number' && saved.count >= 5) ? saved.count : DEFAULT_CONFIG.count,
    modes: Array.isArray(saved.modes) && saved.modes.length > 0
      ? (saved.modes.filter((m) => ALL_MODES.includes(m as Mode)) as Mode[])
      : DEFAULT_CONFIG.modes,
    pool: saved.pool && POOL_META.some((p) => p.id === saved.pool) ? saved.pool : DEFAULT_CONFIG.pool,
    includeEN: Boolean(saved.includeEN),
    mixReview: saved.mixReview !== false,
  };
}

function plural(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

// ---------- small components ----------

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-terra' : 'bg-surface-3',
        disabled && 'pointer-events-none opacity-45',
      )}
    >
      <motion.span
        className="absolute top-[3px] left-[3px] h-5 w-5 rounded-full bg-surface shadow-sm"
        animate={{ x: checked ? 18 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  );
}

function Overline({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">{children}</h3>
      {right}
    </div>
  );
}

// ---------- page ----------

const sectionAnim = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.07 * i, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function TrainSetup() {
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const loadData = useAppStore((s) => s.loadData);
  const progress = useAppStore((s) => s.progress);
  const progressLoaded = useAppStore((s) => s.progressLoaded);

  const [config, setConfig] = useState<SetupConfig>(loadConfig);
  const [toast, setToast] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const shakeCounter = useRef(0);
  const [presets, setPresets] = useState<Preset[]>(() => loadJSON<Preset[]>(PRESETS_KEY) ?? []);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // persist config
  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      /* ignore */
    }
  }, [config]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const patch = (p: Partial<SetupConfig>) => setConfig((c) => ({ ...c, ...p }));

  // ----- pool sizes -----
  const poolSizes = useMemo(() => {
    const sizes = new Map<PoolMode, number>();
    if (!dataset || !progressLoaded) return sizes;
    for (const p of POOL_META) {
      sizes.set(
        p.id,
        buildPool(dataset, { topics: config.topics, count: 'all', modes: config.modes, pool: p.id, includeEN: config.includeEN, mixReview: config.mixReview }, progress).length,
      );
    }
    return sizes;
  }, [dataset, progressLoaded, progress, config.topics, config.modes, config.includeEN, config.mixReview]);

  const available = poolSizes.get(config.pool) ?? 0;
  const effectiveCount = config.count === 'all' ? available : Math.min(config.count, available);
  const sliderMax = Math.max(5, Math.min(100, available || 5));
  const sliderValue = config.count === 'all' ? sliderMax : Math.min(config.count, sliderMax);
  const valid = config.topics.length > 0 && config.modes.length > 0 && available > 0;

  const stylisticsOn = config.topics.includes('stylistics');

  const topicCounts = useMemo(() => {
    const map = new Map<TopicId, { ru: number; en: number }>();
    if (!dataset) return map;
    for (const t of dataset.terms) {
      const e = map.get(t.topic) ?? { ru: 0, en: 0 };
      if (t.lang === 'en') e.en++;
      else e.ru++;
      map.set(t.topic, e);
    }
    return map;
  }, [dataset]);

  // ----- topic toggle -----
  const toggleTopic = (id: TopicId) => {
    if (config.topics.includes(id)) {
      if (config.topics.length === 1) {
        shakeCounter.current += 1;
        setShakeKey(`topic-${id}-${shakeCounter.current}`);
        showToast('Выбери хотя бы одну тему');
        return;
      }
      const topics = config.topics.filter((t) => t !== id);
      patch({ topics, includeEN: topics.includes('stylistics') ? config.includeEN : false });
    } else {
      patch({ topics: [...config.topics, id] });
    }
  };

  const toggleAllTopics = () => {
    if (config.topics.length === ALL_TOPICS.length) {
      // оставить первую — снимать всё нельзя
      patch({ topics: [config.topics[0]], includeEN: config.topics[0] === 'stylistics' ? config.includeEN : false });
    } else {
      patch({ topics: ALL_TOPICS });
    }
  };

  const toggleMode = (id: Mode) => {
    if (config.modes.includes(id)) {
      if (config.modes.length === 1) {
        shakeCounter.current += 1;
        setShakeKey(`mode-${id}-${shakeCounter.current}`);
        showToast('Выбери хотя бы один режим');
        return;
      }
      patch({ modes: config.modes.filter((m) => m !== id) });
    } else {
      patch({ modes: [...config.modes, id] });
    }
  };

  // ----- summary -----
  const summaryTopics = useMemo(() => {
    if (!dataset) return '';
    if (config.topics.length === ALL_TOPICS.length) return 'Все темы';
    const names = config.topics
      .map((id) => dataset.topics.find((t) => t.id === id)?.title)
      .filter(Boolean) as string[];
    if (names.length === 1) return names[0];
    return `${names[0]} + ${names.length - 1}`;
  }, [dataset, config.topics]);

  const countLabel =
    config.count === 'all' || effectiveCount === available
      ? `${available} ${plural(available, 'вопрос', 'вопроса', 'вопросов')} (весь пул)`
      : `${effectiveCount} ${plural(effectiveCount, 'вопрос', 'вопроса', 'вопросов')}`;

  const summaryText = valid
    ? `${summaryTopics} · ${countLabel} · ${config.modes.length} ${plural(config.modes.length, 'режим', 'режима', 'режимов')} · ${POOL_SHORT[config.pool]}${config.includeEN ? ' · EN' : ''}`
    : available === 0
      ? 'В этом пуле пока нет терминов — выбери другой'
      : 'Выбери хотя бы один режим';

  const start = () => {
    if (!valid) return;
    const params = new URLSearchParams({
      pool: config.pool,
      count: String(config.count),
      topics: config.topics.join(','),
      modes: config.modes.join(','),
      en: config.includeEN ? '1' : '0',
      mixReview: config.mixReview ? '1' : '0',
    });
    navigate(`/train/session?${params.toString()}`);
  };

  // ----- presets -----
  const presetName = (c: SetupConfig) => {
    const t =
      c.topics.length === ALL_TOPICS.length
        ? 'Все темы'
        : (dataset?.topics.find((x) => x.id === c.topics[0])?.title ?? 'Микс') +
          (c.topics.length > 1 ? ` +${c.topics.length - 1}` : '');
    return `${t} · ${c.count === 'all' ? 'весь пул' : c.count} · ${POOL_SHORT[c.pool]}`;
  };

  const savePreset = () => {
    const next = [...presets, { name: presetName(config), config }];
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    showToast('Пресет сохранён');
  };

  const applyPreset = (p: Preset) => {
    setConfig({ ...p.config, topics: [...p.config.topics], modes: [...p.config.modes] });
    showToast('Пресет применён');
  };

  const removePreset = (idx: number) => {
    const next = presets.filter((_, i) => i !== idx);
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    showToast('Пресет удалён');
  };

  const loading = !dataset || !progressLoaded;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-4 pb-6">
      {/* 1. Шапка */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-2"
      >
        <Link
          to="/"
          aria-label="На главную"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <h1 className="font-display text-[22px] leading-[28px] font-semibold tracking-[-0.005em] lg:text-[26px]">
          Настройка сессии
        </h1>
        <button
          type="button"
          onClick={() => setConfig(DEFAULT_CONFIG)}
          className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
          Сбросить
        </button>
      </motion.div>

      {/* 2. Темы */}
      <motion.section variants={sectionAnim} initial="hidden" animate="show" custom={1} className="mt-6">
        <Overline
          right={
            <button
              type="button"
              onClick={toggleAllTopics}
              className="rounded-lg px-2 py-1 text-[13px] font-semibold text-terra transition-colors hover:bg-accent-soft"
            >
              {config.topics.length === ALL_TOPICS.length ? 'Снять все' : 'Все вместе'}
            </button>
          }
        >
          Темы
        </Overline>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(dataset?.topics ?? []).map((topic) => {
            const selected = config.topics.includes(topic.id);
            const counts = topicCounts.get(topic.id);
            const Icon = TOPIC_ICONS[topic.id];
            const shaking = shakeKey?.startsWith(`topic-${topic.id}`);
            return (
              <motion.button
                key={`${topic.id}-${shaking ? shakeKey : ''}`}
                type="button"
                onClick={() => toggleTopic(topic.id)}
                whileTap={{ scale: 0.97 }}
                animate={shaking ? { x: [0, -6, 6, -3, 0] } : { x: 0 }}
                transition={{ duration: 0.2 }}
                className="relative flex min-h-[92px] flex-col items-start gap-2 rounded-2xl border bg-surface p-3.5 text-left transition-colors duration-200"
                style={{
                  borderColor: selected ? topic.color : 'var(--border)',
                  borderWidth: selected ? 1.5 : 1,
                  backgroundColor: selected
                    ? `color-mix(in srgb, ${topic.color} 8%, var(--surface))`
                    : undefined,
                }}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-[10px]"
                  style={{ backgroundColor: `color-mix(in srgb, ${topic.color} 14%, transparent)` }}
                >
                  <Icon className="h-4 w-4" style={{ color: topic.color }} strokeWidth={1.75} />
                </span>
                <span className="text-[15px] font-bold">{topic.title}</span>
                <span className="tnum text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                  {counts
                    ? topic.id === 'stylistics'
                      ? `${counts.ru} + ${counts.en} EN`
                      : `${counts.ru} ${plural(counts.ru, 'термин', 'термина', 'терминов')}`
                    : '…'}
                </span>
                <AnimatePresence>
                  {selected && (
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                      className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ backgroundColor: topic.color }}
                    >
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* 3. Количество вопросов */}
      <motion.section variants={sectionAnim} initial="hidden" animate="show" custom={2} className="mt-8">
        <Overline
          right={
            <span className="tnum text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
              макс. {loading ? '…' : available}
            </span>
          }
        >
          Количество вопросов
        </Overline>
        <div className="flex rounded-xl bg-surface-2 p-1">
          {COUNT_PRESETS.map((p) => {
            const active = config.count === p || (p !== 'all' && config.count === p);
            return (
              <button
                key={String(p)}
                type="button"
                onClick={() => patch({ count: p })}
                className={cn(
                  'relative h-9 flex-1 rounded-[10px] text-[13px] font-semibold transition-colors',
                  active ? 'text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="count-preset"
                    className="absolute inset-0 rounded-[10px] bg-surface shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="tnum relative z-10 font-mono">{p === 'all' ? 'Все' : p}</span>
              </button>
            );
          })}
        </div>
        <div className="relative mt-5 px-1">
          {/* bubble над thumb */}
          <div
            className="tnum pointer-events-none absolute -top-6 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[13px] font-medium shadow-sm"
            style={{
              left: `calc(${((sliderValue - 5) / Math.max(1, sliderMax - 5)) * 100}% + ${(0.5 - (sliderValue - 5) / Math.max(1, sliderMax - 5)) * 22}px)`,
              transform: 'translateX(-50%)',
            }}
          >
            {config.count === 'all' ? 'все' : sliderValue}
          </div>
          <Slider
            value={[sliderValue]}
            min={5}
            max={sliderMax}
            step={5}
            disabled={available === 0}
            onValueChange={([v]) => patch({ count: v })}
            className="[&_[data-slot=slider-thumb]]:size-[22px] [&_[data-slot=slider-track]]:h-1"
          />
        </div>
        {config.count === 'all' && (
          <p className="mt-3 text-sm font-medium text-ink-muted">
            Все подходящие термины: <span className="tnum font-mono">{available}</span>
          </p>
        )}
      </motion.section>

      {/* 4. Режимы */}
      <motion.section variants={sectionAnim} initial="hidden" animate="show" custom={3} className="mt-8">
        <Overline
          right={
            <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
              можно несколько — вопросы перемешаются
            </span>
          }
        >
          Режимы
        </Overline>
        <div className="flex flex-col gap-2.5">
          {MODE_META.map((m) => {
            const on = config.modes.includes(m.id);
            const diff = DIFF_STYLE[m.difficulty];
            const shaking = shakeKey?.startsWith(`mode-${m.id}`);
            return (
              <motion.div
                key={`${m.id}-${shaking ? shakeKey : ''}`}
                animate={shaking ? { x: [0, -6, 6, -3, 0] } : on ? { x: 0, y: -1 } : { x: 0, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'rounded-[14px] border bg-surface transition-all duration-200',
                  on ? 'border-border-strong shadow-sm' : 'border-border',
                )}
              >
                <div className="flex min-h-[76px] items-center gap-3 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    <m.icon className="h-[18px] w-[18px] text-ink-muted" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold">{m.title}</span>
                      <span
                        className="rounded-lg px-1.5 py-0.5 text-[11px] font-bold tracking-[0.02em]"
                        style={{ color: diff.fg, backgroundColor: diff.bg }}
                      >
                        {m.difficulty}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-ink-muted">{m.desc}</p>
                  </div>
                  <Toggle checked={on} onChange={() => toggleMode(m.id)} label={m.title} />
                </div>
                <AnimatePresence initial={false}>
                  {m.id === 'term2def-precision' && on && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <p className="border-t border-border px-3.5 py-2.5 text-sm font-medium text-ink-muted">
                        Оценка по полноте смысла и формулировке. Пороги — в настройках (пресет «Строгий экзамен»).
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* 5. Пул терминов */}
      <motion.section variants={sectionAnim} initial="hidden" animate="show" custom={4} className="mt-8">
        <Overline>Пул терминов</Overline>
        <div className="flex flex-col gap-2.5">
          {POOL_META.map((p) => {
            const selected = config.pool === p.id;
            const size = poolSizes.get(p.id) ?? 0;
            const empty = progressLoaded && size === 0;
            return (
              <motion.div
                key={p.id}
                whileTap={empty ? undefined : { scale: 0.98 }}
                className={cn(
                  'rounded-[14px] border transition-colors duration-200',
                  p.exam
                    ? 'border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-terra-soft'
                    : selected
                      ? 'border-border-strong bg-surface'
                      : 'border-border bg-surface',
                  empty && 'opacity-45',
                )}
              >
                <button
                  type="button"
                  disabled={empty}
                  onClick={() => patch({ pool: p.id })}
                  className="flex w-full items-center gap-3 p-3.5 text-left"
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      selected ? 'border-terra' : 'border-border-strong',
                    )}
                  >
                    {selected && (
                      <motion.span
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                        className="h-2.5 w-2.5 rounded-full bg-terra"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {p.exam && <GraduationCap className="h-4 w-4 text-terra" strokeWidth={1.75} />}
                      <span className="text-[15px] font-bold">{p.title}</span>
                      {p.badge && (
                        <span className="rounded-lg bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold tracking-[0.02em] text-ink-muted">
                          {p.badge}
                        </span>
                      )}
                      {p.exam && (
                        <span className="rounded-lg bg-[color:var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.02em] text-terra-ink">
                          режим экзамена
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-ink-muted">
                      {empty ? 'пока пусто' : p.desc}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-mono text-[13px] font-medium text-ink-faint">
                    {loading ? '…' : size}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {p.exam && selected && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <p className="flex items-start gap-2 border-t border-[color:color-mix(in_srgb,var(--accent)_25%,transparent)] px-3.5 py-2.5 text-sm font-medium text-ink-muted">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" strokeWidth={1.75} />
                        Статусы обновятся по факту ответов — можно «уронить» выученный термин.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* 6. Язык и повторения */}
      <motion.section variants={sectionAnim} initial="hidden" animate="show" custom={5} className="mt-8">
        <Overline>Дополнительно</Overline>
        <div className="divide-y divide-border rounded-[14px] border border-border bg-surface">
          <div className={cn('flex items-center gap-3 p-3.5', !stylisticsOn && 'opacity-45')}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Languages className="h-[18px] w-[18px] text-ink-muted" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold">Английские термины</span>
                <span className="tnum font-mono text-[12.5px] font-medium text-ink-faint">+54</span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-ink-muted">
                {stylisticsOn
                  ? 'EN-карточки стилистики тренируются отдельно от русских близнецов'
                  : 'только для стилистики'}
              </p>
            </div>
            <Toggle
              checked={config.includeEN && stylisticsOn}
              disabled={!stylisticsOn}
              onChange={() => patch({ includeEN: !config.includeEN })}
              label="Английские термины"
            />
          </div>
          <AnimatePresence initial={false}>
            {config.pool !== 'due' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    <RefreshCcw className="h-[18px] w-[18px] text-ink-muted" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[15px] font-bold">Подмешивать повторения</span>
                    <p className="mt-0.5 text-sm font-medium text-ink-muted">
                      Термины, которым наступил срок, попадут в сессию первыми
                    </p>
                  </div>
                  <Toggle
                    checked={config.mixReview}
                    onChange={() => patch({ mixReview: !config.mixReview })}
                    label="Подмешивать повторения"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* 8. Пресеты */}
      <motion.section variants={sectionAnim} initial="hidden" animate="show" custom={6} className="mt-8 pb-4">
        <Overline>Пресеты</Overline>
        <div className="mask-fade-x -mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex gap-2">
            {presets.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyPreset(p)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  removePreset(i);
                }}
                title="Тап — применить · правый клик — удалить"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold transition-colors hover:bg-surface-2"
              >
                <GraduationCap className="h-4 w-4 text-ink-faint" strokeWidth={1.75} />
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={savePreset}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3.5 py-2 text-[13px] font-semibold text-terra transition-colors hover:bg-accent-soft"
            >
              <Save className="h-4 w-4" strokeWidth={1.75} />
              Сохранить текущую
            </button>
          </div>
        </div>
      </motion.section>

      {/* 7. Липкий футер-резюме */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.4 }}
        className="sticky bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-40 mt-4 lg:bottom-3"
      >
        <div className="rounded-2xl border border-border bg-surface/90 p-3.5 shadow-lg backdrop-blur-[12px]">
          <div className="mb-2.5 flex min-h-5 items-center gap-1.5">
            {valid &&
              dataset &&
              config.topics.map((id) => {
                const t = dataset.topics.find((x) => x.id === id);
                return t ? (
                  <span key={id} className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                ) : null;
              })}
            <motion.p
              key={summaryText}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className={cn(
                'truncate text-sm font-medium',
                valid ? 'text-ink-muted' : 'text-error',
              )}
            >
              {loading ? 'Загружаем словарь…' : summaryText}
            </motion.p>
          </div>
          <motion.button
            type="button"
            disabled={!valid || loading}
            onClick={start}
            whileTap={{ scale: 0.98 }}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-terra text-[15px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-terra-hover disabled:opacity-45"
          >
            <Play className="h-[18px] w-[18px]" />
            Начать → {loading ? '…' : effectiveCount}{' '}
            {plural(effectiveCount, 'вопрос', 'вопроса', 'вопросов')}
          </motion.button>
        </div>
      </motion.div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-[calc(150px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border-strong bg-surface px-4 py-2.5 text-sm font-semibold shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
