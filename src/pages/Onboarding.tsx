// Онбординг /welcome (design/onboarding.md): хиро с delay-анимациями, превью карточки с FlipWords,
// 3 фичи, quick-start. CTA → localStorage lingo-cards-onboarded=1 → /.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, Layers, TrendingUp, Waypoints } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

const FLIP_WORDS = ['деепричастие', 'силлогизм', 'метатеза', 'окказионализм', 'литота'];

function FlipWords({ words, interval = 2400 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => window.clearInterval(t);
  }, [words.length, interval, reduceMotion]);

  return (
    <span className="relative inline-flex h-[1.2em] min-w-[8ch] justify-center overflow-visible">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[index]}
          initial={reduceMotion ? false : { rotateX: 90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { rotateX: -90, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block origin-center font-display italic"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const easeOut = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOut } },
};

export default function Onboarding() {
  const navigate = useNavigate();
  const loadData = useAppStore((s) => s.loadData);
  const dataset = useAppStore((s) => s.dataset);

  useEffect(() => {
    // Предзагружаем словарь, чтобы переход на / был мгновенным.
    void loadData();
  }, [loadData]);

  const finish = () => {
    try {
      localStorage.setItem('lingo-cards-onboarded', '1');
    } catch {
      /* ignore */
    }
    navigate('/', { replace: true });
  };

  const totalTerms = dataset?.terms.length ?? 264;

  return (
    <div className="relative overflow-hidden">
      {/* фон-иллюстрация */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[420px] max-w-[900px] opacity-[0.5] dark:opacity-[0.35]"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}onboarding-hero.svg)`,
          backgroundSize: 'contain',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
        }}
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex max-w-[760px] flex-col items-center px-4 pb-16 pt-16 text-center sm:pt-24"
      >
        {/* 2. Хиро */}
        <motion.p
          variants={item}
          className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-faint"
        >
          Lingo Cards
        </motion.p>
        <motion.h1
          variants={item}
          className="mt-3 font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.015em] sm:text-[44px]"
        >
          Термины —
          <br />
          под контролем.
        </motion.h1>
        <motion.p
          variants={item}
          className="mt-4 max-w-[460px] text-[15.5px] leading-[1.6] text-ink-muted"
        >
          Тренажёр терминов по грамматике, фонетике, лексикологии и стилистике английского языка —
          с интервальными повторениями, графом связей и честной статистикой.
        </motion.p>

        {/* 3. Превью-карточка */}
        <motion.div variants={item} className="mt-8 w-full max-w-[380px]" style={{ perspective: 900 }}>
          <motion.div
            animate={useReducedMotion() ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-2xl border bg-surface p-5 shadow-lg"
            style={{ borderTopWidth: 3, borderTopColor: 'var(--topic-grammar)' }}
          >
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">
              Что это за термин?
            </div>
            <div className="mt-3 min-h-[72px] font-display text-[21px] font-semibold leading-snug">
              <FlipWords words={FLIP_WORDS} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-left">
              {['Определение', 'Этимология'].map((label) => (
                <div key={label} className="rounded-xl border bg-surface-2 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">{label}</div>
                  <div className="mt-1 h-2 w-4/5 rounded bg-border" />
                  <div className="mt-1.5 h-2 w-3/5 rounded bg-border" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-[11.5px] font-semibold">
              <span className="inline-flex items-center gap-1.5 text-st-learned">
                <span className="h-1.5 w-1.5 rounded-full bg-st-learned" />
                Выучен
              </span>
              <span className="tnum text-ink-faint">{totalTerms} карточек</span>
            </div>
          </motion.div>
        </motion.div>

        {/* 4. Три фичи */}
        <motion.div variants={item} className="mt-10 grid w-full gap-3 sm:grid-cols-3">
          {[
            {
              icon: Layers,
              title: '4 режима карточек',
              text: 'Ввод, выбор, обратные карточки и precision mode с процентом точности определения.',
            },
            {
              icon: TrendingUp,
              title: 'Интервальные повторения',
              text: 'SM-2 решает, что показать сегодня: слабые и просроченные термины — вперёд.',
            },
            {
              icon: Waypoints,
              title: 'Граф связей',
              text: 'Термины не в вакууме: смотрите, как понятия ссылаются друг на друга.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border bg-surface p-4 text-left shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-terra-soft text-terra">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </div>
              <div className="mt-2.5 text-[14px] font-bold">{title}</div>
              <div className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">{text}</div>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div variants={item} className="mt-9 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={finish}
            className={cn(
              'group inline-flex items-center gap-2 rounded-2xl bg-terra px-6 py-3',
              'text-[15px] font-semibold text-surface shadow-md transition-all hover:bg-terra-hover hover:shadow-lg',
            )}
          >
            Начать учиться
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link
            to="/library"
            onClick={finish}
            className="text-[13px] font-semibold text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Сначала посмотреть библиотеку
          </Link>
        </motion.div>

        {/* 5. Quick-start подсказка */}
        <motion.p variants={item} className="mt-8 text-[12px] font-medium text-ink-faint">
          Всё хранится локально в вашем браузере (IndexedDB) — ничего не нужно настраивать.
        </motion.p>
      </motion.div>
    </div>
  );
}
