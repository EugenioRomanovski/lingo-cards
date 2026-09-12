// Онбординг (design/onboarding.md). Route: `/welcome` — 3 шага, показывается один раз.
// Завершение ставит флаг `lingo-cards-onboarded` и ведёт на /train/setup.
// Редирект с `/` для не-onboarded пользователей добавляет интегратор (Home.tsx не трогаем).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  AudioLines,
  BookA,
  Check,
  Clock,
  Feather,
  Flame,
  Languages,
  Leaf,
  PenLine,
  Play,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { TopicId } from '@/lib/data';
import { cn } from '@/lib/utils';

// ---- localStorage contract (shared with Stats.tsx) ----
const LS_ONBOARDED = 'lingo-cards-onboarded';
const LS_DAILY_GOAL = 'lingo-cards-daily-goal';
const LS_TOPICS = 'lingo-cards-train-topics';
const LS_INCLUDE_EN = 'lingo-cards-include-en';

const TOPICS: { id: TopicId; title: string; icon: typeof PenLine; fallbackCount: number }[] = [
  { id: 'grammar', title: 'Грамматика', icon: PenLine, fallbackCount: 25 },
  { id: 'phonetics', title: 'Фонетика', icon: AudioLines, fallbackCount: 75 },
  { id: 'lexicology', title: 'Лексикология', icon: BookA, fallbackCount: 56 },
  { id: 'stylistics', title: 'Стилистика', icon: Feather, fallbackCount: 54 },
];

const TEMPOS = [
  { value: 10, title: 'Лёгкий', desc: '10 вопросов в день · ~3 минуты', icon: Leaf, recommended: false },
  { value: 20, title: 'Ровный', desc: '20 вопросов · ~6 минут', icon: Zap, recommended: true },
  { value: 50, title: 'Интенсив', desc: '50 вопросов · ~15 минут', icon: Flame, recommended: false },
];

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Дрейфующее терракотовое свечение фона (onboarding.md «Системные детали»). */
function GlowDrift() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute rounded-full opacity-10 dark:opacity-[0.14]"
      style={{
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
        filter: 'blur(40px)',
      }}
      animate={{ x: ['-12vw', '8vw', '-4vw', '-12vw'], y: ['-8vh', '10vh', '22vh', '-8vh'] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

/** Кинетический заголовок шага 1: слова собираются из рассеянного состояния. */
function KineticTitle({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const words = useMemo(() => {
    // Deterministic pseudo-random scatter (pure — no Math.random in render).
    const pseudo = (i: number, salt: number) => {
      const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    return text.split(' ').map((w, i) => ({
      w,
      x: Math.round((pseudo(i, 1) - 0.5) * 120),
      y: Math.round((pseudo(i, 2) - 0.5) * 120),
      r: Math.round((pseudo(i, 3) - 0.5) * 16),
    }));
  }, [text]);
  if (reduce) {
    return (
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="font-display text-[34px] leading-[40px] font-semibold tracking-[-0.015em] lg:text-[44px] lg:leading-[52px]"
      >
        {text}
      </motion.h1>
    );
  }
  return (
    <h1 className="font-display text-[34px] leading-[40px] font-semibold tracking-[-0.015em] lg:text-[44px] lg:leading-[52px]">
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block will-change-transform"
          initial={{ opacity: 0, x: word.x, y: word.y, rotate: word.r, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, y: 0, rotate: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          {word.w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </h1>
  );
}

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -60 : 60 }),
};

export default function Onboarding() {
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const loadData = useAppStore((s) => s.loadData);
  const reduce = useReducedMotion();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [topics, setTopics] = useState<Set<TopicId>>(() => new Set(TOPICS.map((t) => t.id)));
  const [includeEN, setIncludeEN] = useState(false);
  const [tempo, setTempo] = useState(20);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const map = new Map<TopicId, number>();
    let en = 0;
    for (const t of dataset?.terms ?? []) {
      if (t.lang === 'en') {
        en++;
      } else {
        map.set(t.topic, (map.get(t.topic) ?? 0) + 1);
      }
    }
    return { map, en: en || 54 };
  }, [dataset]);

  const finish = (dest: string) => {
    writeLS(LS_ONBOARDED, '1');
    writeLS(LS_DAILY_GOAL, String(tempo));
    writeLS(LS_INCLUDE_EN, includeEN ? '1' : '0');
    writeLS(LS_TOPICS, JSON.stringify([...topics]));
    navigate(dest);
  };

  const goNext = () => {
    if (step >= 2) return;
    setDir(1);
    setStep((s) => Math.min(2, s + 1));
  };
  const goPrev = () => {
    if (step <= 0) return;
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  };

  // Клавиатура: → дальше, ← назад, Enter = CTA (onboarding.md).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (step < 2) goNext();
        else finish('/train/setup');
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'Enter') {
        if (step < 2) goNext();
        else finish('/train/setup');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, topics, includeEN, tempo]);

  const toggleTopic = (id: TopicId) => {
    setTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // не даём снять выбор со всех тем
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <div className="absolute top-[10vh] left-[8vw]">
        <GlowDrift />
      </div>

      {/* Прогресс-точки + Пропустить */}
      <div className="relative z-10 flex items-center justify-center px-4 pt-5">
        <div className="flex items-center gap-2" aria-label={`Шаг ${step + 1} из 3`}>
          {[0, 1, 2].map((i) =>
            i === step ? (
              <motion.span
                key={i}
                layoutId="onboarding-dot"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="block h-2 w-6 rounded-full bg-terra"
              />
            ) : (
              <button
                key={i}
                type="button"
                aria-label={`Шаг ${i + 1}`}
                onClick={() => {
                  setDir(i > step ? 1 : -1);
                  setStep(i);
                }}
                className="block h-2 w-2 rounded-full bg-surface-3 transition-colors hover:bg-ink-faint"
              />
            ),
          )}
        </div>
        <button
          type="button"
          onClick={() => finish('/')}
          className="absolute top-5 right-4 rounded-lg px-2 py-1.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
        >
          Пропустить
        </button>
      </div>

      {/* Сцена шага */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              reduce
                ? { duration: 0.15 }
                : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
            }
            drag={reduce ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60 && step < 2) goNext();
              else if (info.offset.x > 60 && step > 0) goPrev();
            }}
            className="w-full max-w-[560px]"
          >
            {step === 0 && (
              <div className="flex flex-col items-center text-center">
                <motion.img
                  src={`${import.meta.env.BASE_URL}logo.svg`}
                  alt="Lingo Cards"
                  className="h-[72px] w-[72px]"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                />
                <div className="mt-6">
                  <KineticTitle text="Твоя система терминов" />
                </div>
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="mt-4 max-w-[460px] text-base leading-[26px] font-medium text-ink-muted"
                >
                  264 термина по грамматике, фонетике, лексикологии и стилистике. Карточки,
                  интервальные повторения и карта связей — как в Obsidian.
                </motion.p>
                <motion.img
                  src={`${import.meta.env.BASE_URL}onboarding-hero.svg`}
                  alt=""
                  className="mt-6 w-full max-w-[420px]"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75, duration: 0.5 }}
                />
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.35 }}
                  className="mt-6 flex flex-col items-center"
                >
                  <button
                    type="button"
                    onClick={goNext}
                    className="h-12 rounded-xl bg-terra px-10 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-terra-hover active:scale-[0.97] lg:h-11"
                  >
                    Поехали
                  </button>
                  <span className="mt-2 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                    займёт 20 секунд
                  </span>
                </motion.div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.005em]">
                  Что учим?
                </h2>
                <p className="mt-1 text-sm font-medium text-ink-muted">можно менять в любой момент</p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {TOPICS.map((t, i) => {
                    const selected = topics.has(t.id);
                    const Icon = t.icon;
                    const n = counts.map.get(t.id) ?? t.fallbackCount;
                    return (
                      <motion.button
                        key={t.id}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() => toggleTopic(t.id)}
                        initial={{ scale: 0.9, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 26, delay: i * 0.08 }}
                        whileTap={{ scale: 0.97 }}
                        className={cn(
                          'flex flex-col items-start gap-2 rounded-2xl border p-4 text-left shadow-sm transition-colors',
                          selected
                            ? 'border-[1.5px] bg-surface'
                            : 'border-border bg-surface-2/60 opacity-70',
                        )}
                        style={selected ? { borderColor: `var(--topic-${t.id})` } : undefined}
                      >
                        <span className="flex w-full items-center justify-between">
                          <span
                            className="flex h-9 w-9 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `color-mix(in srgb, var(--topic-${t.id}) 14%, transparent)` }}
                          >
                            <Icon className="h-[18px] w-[18px]" style={{ color: `var(--topic-${t.id})` }} strokeWidth={1.75} />
                          </span>
                          <span
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
                              selected ? 'border-transparent' : 'border-border-strong',
                            )}
                            style={selected ? { backgroundColor: `var(--topic-${t.id})` } : undefined}
                          >
                            {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </span>
                        </span>
                        <span className="text-[15px] font-bold">{t.title}</span>
                        <span className="tnum font-mono text-[12.5px] font-medium text-ink-faint">
                          {n} {n % 10 === 1 && n % 100 !== 11 ? 'термин' : 'терминов'}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.35 }}
                  className={cn(
                    'mt-3 flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition-colors',
                    includeEN ? 'border-[1.5px] border-[var(--topic-stylistics)] bg-surface' : 'border-border bg-surface',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--topic-stylistics)_14%,transparent)]">
                    <Languages className="h-[18px] w-[18px] text-[var(--topic-stylistics)]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">Английские термины стилистики</div>
                    <div className="mt-0.5 text-[12.5px] leading-[18px] font-medium text-ink-muted">
                      {counts.en} карточки-близнеца: Archaisms, Asyndeton, Zeugma… Тренируются отдельно от русских
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeEN}
                    aria-label="Английские термины стилистики"
                    onClick={() => setIncludeEN((v) => !v)}
                    className={cn(
                      'relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-200',
                      includeEN ? 'bg-terra' : 'bg-surface-3',
                    )}
                  >
                    <motion.span
                      animate={{ x: includeEN ? 20 : 2 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="absolute top-[3px] left-0 block h-5 w-5 rounded-full bg-surface shadow-sm"
                    />
                  </button>
                </motion.div>

                <div className="mt-6 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goPrev}
                    className="flex h-12 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 lg:h-11"
                  >
                    <ArrowLeft className="h-4 w-4" /> Назад
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="h-12 flex-1 rounded-xl bg-terra text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-terra-hover active:scale-[0.97] lg:h-11"
                  >
                    Дальше
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.005em]">
                  Твой темп
                </h2>
                <p className="mt-1 text-sm font-medium text-ink-muted">ежедневная цель — мягкая, без давления</p>

                <div className="mt-5 flex flex-col gap-3 sm:grid sm:grid-cols-3">
                  {TEMPOS.map((t, i) => {
                    const selected = tempo === t.value;
                    const Icon = t.icon;
                    return (
                      <motion.button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setTempo(t.value)}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{
                          opacity: 1,
                          y: selected ? -4 : 0,
                          scale: selected ? 1.02 : 1,
                        }}
                        transition={{ type: 'spring', stiffness: 320, damping: 26, delay: i * 0.1 }}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          'flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors',
                          selected ? 'border-[1.5px] border-terra bg-surface shadow-md' : 'border-border bg-surface shadow-sm',
                        )}
                      >
                        <span className="flex w-full items-center justify-between">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-terra-soft">
                            <Icon className="h-[18px] w-[18px] text-terra" strokeWidth={1.75} />
                          </span>
                          {t.recommended && (
                            <span className="rounded-full bg-terra-soft px-2 py-0.5 text-[11px] font-bold tracking-[0.02em] text-terra-ink">
                              рекомендуется
                            </span>
                          )}
                        </span>
                        <span className="text-[15px] font-bold">{t.title}</span>
                        <span className="text-[12.5px] leading-[18px] font-medium text-ink-muted">{t.desc}</span>
                      </motion.button>
                    );
                  })}
                </div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.35 }}
                  className="mt-4 flex items-start gap-2 text-sm font-medium text-ink-muted"
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  Выученные термины вернутся на повторение примерно через 2 недели — так работает память
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.35 }}
                  className="mt-6 flex flex-col gap-2"
                >
                  <button
                    type="button"
                    onClick={() => finish('/train/setup')}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-terra text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-terra-hover active:scale-[0.97]"
                  >
                    <Play className="h-[18px] w-[18px]" /> Начать первую тренировку
                  </button>
                  <button
                    type="button"
                    onClick={() => finish('/')}
                    className="h-11 rounded-xl text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2"
                  >
                    Сначала осмотрюсь
                  </button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
