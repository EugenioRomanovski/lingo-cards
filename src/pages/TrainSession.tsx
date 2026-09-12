// Тренировка (design/training.md). Route: /train/session?pool=…&count=…&topics=…&modes=…&en=…&mixReview=…
// Также поддерживает ?terms=id1,id2,… — мини-сессия по конкретным терминам («Повторить ошибки»).
// Полноэкранный фокус-режим: один вопрос за раз, самооценка SM-2, сохранение в Dexie.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Crosshair,
  Flame,
  Lightbulb,
  List,
  ListChecks,
  ChevronDown,
  TextCursorInput,
  Volume2,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { generateSession, pickDistractors, type PoolMode, type Question, type SessionSettings } from '@/lib/session';
import {
  applyGrade,
  computeStatus,
  freshProgress,
  saveProgress,
  saveSession,
  type Grade,
  type Mode,
  type SessionRecord,
  type TermProgress,
} from '@/lib/progress';
import { checkTerm, normalize, precisionGrade, precisionScore, stem, type PrecisionResult } from '@/lib/textmatch';
import type { Term, TopicId } from '@/lib/data';
import {
  sessionDetailKey,
  type SessionAnswerDetail,
  type SessionDetail,
} from '@/pages/sessionDetail';
import { cn } from '@/lib/utils';

// ---------- params ----------

const ALL_TOPICS: TopicId[] = ['grammar', 'phonetics', 'lexicology', 'stylistics'];
const ALL_MODES: Mode[] = ['def2term-input', 'def2term-choice', 'term2def-choice', 'term2def-precision'];
const POOLS: PoolMode[] = ['all', 'new', 'weak', 'due', 'force'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseParams(sp: URLSearchParams): { settings: SessionSettings; termIds: string[] | null } {
  const topicsRaw = sp.get('topics')?.split(',').filter((t) => ALL_TOPICS.includes(t as TopicId)) as TopicId[] | undefined;
  const modesRaw = sp.get('modes')?.split(',').filter((m) => ALL_MODES.includes(m as Mode)) as Mode[] | undefined;
  const poolRaw = sp.get('pool');
  const countRaw = sp.get('count');
  const count: number | 'all' =
    countRaw === 'all' ? 'all' : Math.max(1, Math.min(500, parseInt(countRaw ?? '20', 10) || 20));
  const termIds = sp.get('terms')?.split(',').filter(Boolean) ?? null;
  return {
    settings: {
      topics: topicsRaw && topicsRaw.length > 0 ? topicsRaw : ALL_TOPICS,
      count,
      modes: modesRaw && modesRaw.length > 0 ? modesRaw : ALL_MODES,
      pool: POOLS.includes(poolRaw as PoolMode) ? (poolRaw as PoolMode) : 'all',
      includeEN: sp.get('en') !== '0',
      mixReview: sp.get('mixReview') !== '0',
    },
    termIds: termIds && termIds.length > 0 ? termIds : null,
  };
}

// ---------- mode meta ----------

const MODE_ICON: Record<Mode, typeof List> = {
  'def2term-choice': ListChecks,
  'def2term-input': TextCursorInput,
  'term2def-choice': List,
  'term2def-precision': Crosshair,
};

const MODE_OVERLINE: Record<Mode, string> = {
  'def2term-input': 'Вспомни термин',
  'def2term-choice': 'Выбери термин',
  'term2def-choice': 'Выбери определение',
  'term2def-precision': 'Сформулируй определение',
};

const POOL_SHORT: Record<PoolMode, string> = {
  all: 'умный пул',
  new: 'только новые',
  weak: 'только слабые',
  due: 'к повторению',
  force: 'экзамен',
};

const GRADE_LABEL: Record<Grade, string> = { good: 'знаю', unsure: 'неуверенно', bad: 'не знаю' };

function percentColor(p: number): string {
  if (p >= 90) return 'var(--success)';
  if (p >= 70) return 'var(--warning)';
  if (p >= 50) return '#C4763B';
  return 'var(--error)';
}

function precisionVerdict(p: number): string {
  if (p >= 90) return 'Точно!';
  if (p >= 70) return 'В целом верно';
  if (p >= 50) return 'Частично';
  return 'Неверно';
}

function speak(text: string, lang: 'ru' | 'en') {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : 'ru-RU';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* TTS недоступен — молча пропускаем */
  }
}

/** Count-up for ring centers. */
function useCountUp(target: number, duration = 0.9): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ---------- main page ----------

export default function TrainSession() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const dataset = useAppStore((s) => s.dataset);
  const datasetError = useAppStore((s) => s.datasetError);
  const loadData = useAppStore((s) => s.loadData);
  const progress = useAppStore((s) => s.progress);
  const progressLoaded = useAppStore((s) => s.progressLoaded);
  const refreshProgress = useAppStore((s) => s.refreshProgress);

  const { settings, termIds } = useMemo(() => parseParams(sp), [sp]);

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<SessionAnswerDetail[]>([]);
  const [chip, setChip] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const startedAtRef = useRef(Date.now());
  const progressRef = useRef<Map<string, TermProgress> | null>(null);
  const answersRef = useRef<SessionAnswerDetail[]>([]);
  const idxRef = useRef(0);
  const finishingRef = useRef(false);
  const chipTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Generate questions once, when data is ready.
  useEffect(() => {
    if (questions !== null || !dataset || !progressLoaded) return;
    progressRef.current = new Map(progress);
    if (termIds) {
      const byId = new Map(dataset.terms.map((t) => [t.id, t]));
      const terms = termIds.map((id) => byId.get(id)).filter((t): t is Term => Boolean(t));
      setQuestions(
        terms.map((term) => {
          const mode = settings.modes[Math.floor(Math.random() * settings.modes.length)];
          const q: Question = { term, mode };
          if (mode === 'def2term-choice' || mode === 'term2def-choice') {
            q.options = shuffle([term, ...pickDistractors(term, dataset, 3)]);
          }
          return q;
        }),
      );
    } else {
      setQuestions(generateSession(dataset, settings, progress));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, progressLoaded, questions]);

  // Esc обрабатывается в QuestionView (toggle подтверждения выхода)

  const showChip = (text: string) => {
    setChip(text);
    window.clearTimeout(chipTimer.current);
    chipTimer.current = window.setTimeout(() => setChip(null), 1400);
  };

  const finish = async (finalAnswers: SessionAnswerDetail[]) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const finishedAt = Date.now();
    const record: SessionRecord = {
      startedAt: startedAtRef.current,
      finishedAt,
      topics: settings.topics,
      questionCount: finalAnswers.length,
      correct: finalAnswers.filter((a) => a.ok).length,
      answers: finalAnswers.map((a) => ({ termId: a.termId, mode: a.mode, ok: a.ok, score: a.score })),
    };
    try {
      const id = await saveSession(record);
      const detail: SessionDetail = {
        startedAt: record.startedAt,
        finishedAt,
        settings: { ...settings, termIds: termIds ?? undefined },
        answers: finalAnswers,
      };
      try {
        sessionStorage.setItem(sessionDetailKey(id), JSON.stringify(detail));
      } catch {
        /* sessionStorage может быть недоступен — результаты покажем по записи */
      }
      // счётчик сессий для скрытия клавиатурных подсказок
      try {
        const n = parseInt(localStorage.getItem('lingo-cards-kb-sessions') ?? '0', 10) || 0;
        localStorage.setItem('lingo-cards-kb-sessions', String(n + 1));
      } catch {
        /* ignore */
      }
      await refreshProgress();
      navigate(`/train/results?id=${id}`);
    } catch {
      finishingRef.current = false;
    }
  };

  /** Вызывается QuestionView после выбора самооценки. */
  const commit = async (partial: Omit<SessionAnswerDetail, 'termId' | 'term' | 'statusBefore' | 'statusAfter'>) => {
    if (!questions || !progressRef.current || finishingRef.current) return;
    const q = questions[idxRef.current];
    const prev = progressRef.current.get(q.term.id) ?? freshProgress(q.term.id);
    const before = computeStatus(prev);
    const next = applyGrade(prev, partial.grade);
    const after = computeStatus(next);
    try {
      await saveProgress(next);
    } catch {
      /* IndexedDB недоступен — продолжаем сессию без сохранения */
    }
    progressRef.current.set(q.term.id, next);
    const rec: SessionAnswerDetail = {
      ...partial,
      termId: q.term.id,
      term: {
        id: q.term.id,
        term: q.term.term,
        definition: q.term.definition,
        etymology: q.term.etymology,
        topic: q.term.topic,
        lang: q.term.lang,
      },
      statusBefore: before,
      statusAfter: after,
    };
    const newAnswers = [...answersRef.current, rec];
    answersRef.current = newAnswers;
    setAnswers(newAnswers);

    // мотивационные микро-чипы
    const n = newAnswers.length;
    const total = questions.length;
    const streakNow = (() => {
      let s = 0;
      for (let i = newAnswers.length - 1; i >= 0; i--) {
        if (newAnswers[i].ok) s++;
        else break;
      }
      return s;
    })();
    if (n === Math.ceil(total / 2) && total >= 8) showChip('Половина пути');
    else if (n % 5 === 0) showChip(streakNow >= 5 ? `${streakNow} подряд!` : 'Отличный темп');

    window.setTimeout(() => {
      if (idxRef.current + 1 >= questions.length) {
        void finish(newAnswers);
      } else {
        idxRef.current += 1;
        setIdx(idxRef.current);
      }
    }, 400);
  };

  const abort = async () => {
    const partial = answersRef.current;
    if (partial.length > 0) {
      await finish(partial);
    } else {
      navigate('/');
    }
  };

  // ---------- render ----------

  if (datasetError) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-24 text-center">
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

  if (questions === null) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[680px] flex-col px-4 py-4">
        <div className="h-14 animate-pulse rounded-xl bg-surface-2" />
        <div className="mt-8 min-h-[220px] flex-1 animate-pulse rounded-[20px] bg-surface-2" />
        <div className="mt-6 h-[52px] animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-[680px] flex-col items-center justify-center px-4 text-center">
        <p className="font-display text-[22px] font-semibold">В этом пуле пока нет терминов</p>
        <p className="mt-2 max-w-sm text-sm font-medium text-ink-muted">
          Попробуй другой пул или добавь темы в настройках сессии.
        </p>
        <button
          type="button"
          onClick={() => navigate('/train/setup')}
          className="mt-6 h-12 rounded-xl bg-terra px-6 text-[15px] font-semibold text-white transition-colors hover:bg-terra-hover"
        >
          К настройке сессии
        </button>
      </div>
    );
  }

  const q = questions[idx];
  const streakNow = (() => {
    let s = 0;
    for (let i = answers.length - 1; i >= 0; i--) {
      if (answers[i].ok) s++;
      else break;
    }
    return s;
  })();

  const configLine = `Сессия: ${settings.topics.length === 4 ? 'микс' : `${settings.topics.length} темы`} · ${POOL_SHORT[settings.pool]}${settings.includeEN ? ' · EN вкл' : ''}`;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[680px] flex-col px-4">
      <SessionTopBar
        idx={idx}
        total={questions.length}
        answers={answers}
        question={q}
        onExit={() => setConfirmExit(true)}
      />

      {/* мотивационный чип */}
      <div className="pointer-events-none relative z-20 flex justify-center">
        <AnimatePresence>
          {chip && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              className="absolute top-1 rounded-full border border-border-strong bg-surface px-4 py-1.5 text-[13px] font-bold shadow-md"
            >
              {chip}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-1 flex-col py-4">
        <AnimatePresence mode="wait">
          <QuestionView
            key={idx}
            question={q}
            streak={streakNow}
            onCommit={commit}
            onRequestExit={() => setConfirmExit((v) => !v)}
          />
        </AnimatePresence>
      </div>

      {/* нижняя системная зона */}
      <button
        type="button"
        onClick={() => setConfigOpen(true)}
        className="mx-auto mb-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
      >
        {configLine}
      </button>

      <KeyboardHints />

      {/* confirm exit sheet */}
      <AnimatePresence>
        {confirmExit && (
          <Sheet onClose={() => setConfirmExit(false)}>
            <p className="font-display text-[19px] font-semibold">Прервать сессию?</p>
            <p className="mt-2 text-sm font-medium text-ink-muted">
              Прогресс вопросов в этой сессии сохранится в статистике.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void abort()}
                className="flex h-12 items-center justify-center rounded-xl bg-error text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Выйти
              </button>
              <button
                type="button"
                onClick={() => setConfirmExit(false)}
                className="flex h-12 items-center justify-center rounded-xl bg-terra text-[15px] font-semibold text-white transition-colors hover:bg-terra-hover"
              >
                Продолжить
              </button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>

      {/* config sheet (read-only) */}
      <AnimatePresence>
        {configOpen && (
          <Sheet onClose={() => setConfigOpen(false)}>
            <p className="font-display text-[19px] font-semibold">Параметры сессии</p>
            <dl className="mt-4 space-y-2.5 text-sm">
              <ConfigRow k="Темы" v={settings.topics.length === 4 ? 'Все темы' : settings.topics.join(', ')} />
              <ConfigRow k="Вопросов" v={String(settings.count === 'all' ? 'весь пул' : settings.count)} />
              <ConfigRow k="Режимов" v={String(settings.modes.length)} />
              <ConfigRow k="Пул" v={POOL_SHORT[settings.pool]} />
              <ConfigRow k="EN-термины" v={settings.includeEN ? 'включены' : 'выключены'} />
              <ConfigRow k="Подмешивать повторения" v={settings.mixReview ? 'да' : 'нет'} />
            </dl>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConfigRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-medium text-ink-muted">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

/** Bottom sheet: grabber, backdrop, spring from below. */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[8px]"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-[560px] rounded-t-3xl border-t border-border bg-surface p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-lg sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:w-full sm:-translate-y-1/2 sm:rounded-3xl sm:border"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-surface-3 sm:hidden" />
        {children}
      </motion.div>
    </div>
  );
}

function KeyboardHints() {
  const [hidden, setHidden] = useState(() => {
    try {
      return (parseInt(localStorage.getItem('lingo-cards-kb-sessions') ?? '0', 10) || 0) >= 3;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onMouse = () => setHidden(false);
    window.addEventListener('mousemove', onMouse, { once: true });
    return () => window.removeEventListener('mousemove', onMouse);
  }, []);
  if (hidden) return null;
  return (
    <div className="mb-3 hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-medium text-ink-faint lg:flex">
      <Hint k="1–4" label="варианты" />
      <Hint k="Enter" label="проверить / дальше" />
      <Hint k="Space" label="показать ответ" />
      <Hint k="← → ↑" label="самооценка" />
      <Hint k="Esc" label="выход" />
    </div>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium">{k}</kbd>
      {label}
    </span>
  );
}

// ---------- TopBar ----------

function SessionTopBar({
  idx,
  total,
  answers,
  question,
  onExit,
}: {
  idx: number;
  total: number;
  answers: SessionAnswerDetail[];
  question: Question;
  onExit: () => void;
}) {
  const dataset = useAppStore((s) => s.dataset);
  const topic = dataset?.topics.find((t) => t.id === question.term.topic);
  const ModeIcon = MODE_ICON[question.mode];
  return (
    <header className="flex h-14 shrink-0 items-center gap-3">
      <button
        type="button"
        onClick={onExit}
        aria-label="Выйти из сессии"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-1 gap-px overflow-hidden rounded-full">
          {Array.from({ length: total }).map((_, i) => {
            const a = answers[i];
            const color = a
              ? a.grade === 'good'
                ? 'var(--success)'
                : a.grade === 'bad'
                  ? 'var(--error)'
                  : 'var(--warning)'
              : i === idx
                ? 'var(--accent)'
                : 'var(--surface-3)';
            return (
              <span
                key={i}
                className="h-full min-w-0 flex-1 rounded-full transition-colors duration-300"
                style={{ backgroundColor: color, boxShadow: i === idx && !a ? '0 0 6px var(--accent)' : undefined }}
              />
            );
          })}
        </div>
        <p className="tnum mt-1 text-center font-mono text-[11px] font-medium text-ink-faint">
          {Math.min(idx + 1, total)} / {total}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {topic && (
          <span className="hidden items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold sm:flex">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: topic.color }} />
            {topic.title}
          </span>
        )}
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2" title={MODE_OVERLINE[question.mode]}>
          <ModeIcon className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
        </span>
      </div>
    </header>
  );
}

// ---------- Question view (один вопрос; state сбрасывается через key=idx) ----------

type CommitPayload = Omit<SessionAnswerDetail, 'termId' | 'term' | 'statusBefore' | 'statusAfter'>;

const OPTION_LETTERS = ['А', 'Б', 'В', 'Г'];

function QuestionView({
  question,
  streak,
  onCommit,
  onRequestExit,
}: {
  question: Question;
  streak: number;
  onCommit: (p: CommitPayload) => void;
  onRequestExit: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const { term, mode } = question;
  const isChoice = mode === 'def2term-choice' || mode === 'term2def-choice';
  const isInput = mode === 'def2term-input';
  const isPrecision = mode === 'term2def-precision';

  const [phase, setPhase] = useState<'answering' | 'feedback'>('answering');
  // input mode
  const [value, setValue] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [typo, setTypo] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(0); // key для shake-анимации
  // choice modes
  const [picked, setPicked] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // precision mode
  const [text, setText] = useState('');
  const [precision, setPrecision] = useState<PrecisionResult | null>(null);

  const [skipped, setSkipped] = useState(false);
  const [wasRight, setWasRight] = useState(false);
  const [yourAnswer, setYourAnswer] = useState('');
  const gradedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hint = attempts >= 2;
  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

  const commitOnce = (grade: Grade, overrides?: Partial<CommitPayload>) => {
    if (gradedRef.current) return;
    gradedRef.current = true;
    onCommit({
      mode,
      grade,
      ok: grade === 'good',
      score: overrides?.score,
      yourAnswer: overrides?.yourAnswer ?? yourAnswer,
      skipped: overrides?.skipped ?? skipped,
    });
  };

  // ----- actions -----
  const submitInput = () => {
    if (phase !== 'answering' || !value.trim()) return;
    const res = checkTerm(value, term.term);
    if (res.ok) {
      setTypo(res.typo);
      setWasRight(true);
      setYourAnswer(value.trim());
      setPhase('feedback');
      inputRef.current?.blur();
    } else {
      setAttempts((a) => a + 1);
      setWrongFlash((k) => k + 1);
    }
  };

  const pick = (optionId: string) => {
    if (phase !== 'answering') return;
    const right = optionId === term.id;
    setPicked(optionId);
    setWasRight(right);
    setYourAnswer(
      (question.options ?? []).find((o) => o.id === optionId)
        ? mode === 'def2term-choice'
          ? (question.options ?? []).find((o) => o.id === optionId)!.term
          : (question.options ?? []).find((o) => o.id === optionId)!.definition
        : '',
    );
    setPhase('feedback');
  };

  const reveal = () => {
    if (phase !== 'answering') return;
    setSkipped(true);
    setPhase('feedback');
  };

  const submitPrecision = () => {
    if (phase !== 'answering' || wordCount < 4) return;
    setPrecision(precisionScore(text, term.definition));
    setYourAnswer(text.trim());
    setPhase('feedback');
  };

  const gradeSelf = (g: Grade) => {
    // «Знаю» недоступно после ошибки/пропуска (логика SM-2)
    if (g === 'good' && !wasRight) return;
    commitOnce(g);
  };

  const gradePrecision = (g: Grade) => {
    commitOnce(g, { score: precision?.percent });
  };

  // ----- keyboard -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        onRequestExit();
        return;
      }
      if (phase === 'answering') {
        if (isChoice && !typing && ['1', '2', '3', '4'].includes(e.key)) {
          const opt = question.options?.[Number(e.key) - 1];
          if (opt) pick(opt.id);
        }
        if (e.key === ' ' && !typing) {
          e.preventDefault();
          reveal();
        }
      } else if (!typing) {
        if (isPrecision && !skipped) {
          if (e.key === 'Enter' || e.key === '1') {
            e.preventDefault();
            if (precision) gradePrecision(precisionGrade(precision.percent));
          }
          if (e.key === '2') gradePrecision('good');
          if (e.key === '3') gradePrecision('bad');
        } else {
          if (e.key === 'ArrowRight' || e.key === '1') gradeSelf('good');
          if (e.key === 'ArrowUp' || e.key === '2') gradeSelf('unsure');
          if (e.key === 'ArrowLeft' || e.key === '3') gradeSelf('bad');
          if (e.key === 'Enter') {
            e.preventDefault();
            gradeSelf(wasRight ? 'good' : 'bad');
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isChoice, isPrecision, wasRight, precision, question, skipped]);

  // ----- transitions -----
  const enter = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 40, rotate: 1.5 },
        animate: { opacity: 1, x: 0, rotate: 0 },
        exit: { opacity: 0, x: -40, rotate: -1.5 },
      };

  const showTerm = mode === 'term2def-choice' || mode === 'term2def-precision';

  return (
    <motion.div
      {...enter}
      transition={
        reducedMotion
          ? { duration: 0.15 }
          : { type: 'spring', stiffness: 260, damping: 26 }
      }
      className="flex flex-1 flex-col"
    >
      {/* карточка вопроса */}
      <motion.div
        drag={phase === 'feedback' && !isPrecision ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDragEnd={(_, info) => {
          if (phase !== 'feedback' || isPrecision) return;
          if (info.offset.x > 80 && wasRight) gradeSelf('good');
          else if (info.offset.x < -80) gradeSelf('bad');
        }}
        className="relative min-h-[220px] rounded-[20px] border border-border bg-surface p-6 shadow-md lg:p-8"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-bold tracking-[0.09em] text-terra-ink uppercase">
            {MODE_OVERLINE[mode]}
          </p>
          <button
            type="button"
            aria-label="Озвучить"
            onClick={() => speak(showTerm ? term.term : term.definition, term.lang)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        {showTerm ? (
          <div className="mt-6 text-center">
            <p className="font-display text-[30px] leading-tight font-semibold tracking-[-0.01em]">
              {term.term}
            </p>
            {term.lang === 'en' && (
              <span className="mt-3 inline-block rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-ink-muted">
                EN
              </span>
            )}
            {/* этимология скрыта до ответа — иначе подсказка */}
            {phase === 'feedback' && term.etymology && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 font-display text-[15px] text-ink-muted italic"
              >
                {term.etymology}
              </motion.p>
            )}
          </div>
        ) : (
          <div className="relative mt-4 max-h-[240px] overflow-y-auto pr-1">
            <p className="font-display text-[18px] leading-[30px] font-medium lg:text-[20px] lg:leading-[32px]">
              {term.definition}
            </p>
            {term.lang === 'en' && (
              <span className="mt-3 inline-block rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-ink-muted">
                EN
              </span>
            )}
          </div>
        )}

        {streak >= 3 && (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute right-5 bottom-4 flex items-center gap-1 text-terra"
          >
            <Flame className="h-4 w-4" />
            <span className="tnum font-mono text-[13px] font-semibold">×{streak}</span>
          </motion.span>
        )}
      </motion.div>

      {/* чип обратной связи над зоной ответа */}
      <div className="pointer-events-none mt-3 flex min-h-7 justify-center">
        <AnimatePresence>
          {phase === 'feedback' && !isPrecision && (
            <motion.span
              initial={{ opacity: 0, y: -8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={cn(
                'rounded-full px-3.5 py-1 text-[13px] font-bold',
                wasRight && !typo && 'bg-[color:color-mix(in_srgb,var(--success)_14%,transparent)] text-success',
                wasRight && typo && 'bg-[color:color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning',
                !wasRight && 'bg-[color:color-mix(in_srgb,var(--error)_12%,transparent)] text-error',
              )}
            >
              {wasRight ? (typo ? `Почти точно: правильно — «${term.term}»` : 'Верно!') : skipped ? 'Пропущено' : 'Неверно'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* зона ответа */}
      <div className="mt-1">
        {phase === 'answering' && (
          <>
            {isInput && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitInput();
                }}
              >
                <div className="flex items-center gap-2">
                  <motion.div
                    key={wrongFlash}
                    animate={wrongFlash > 0 ? { x: [0, -6, 6, -3, 0] } : { x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1"
                  >
                    <input
                      ref={inputRef}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="Введи термин…"
                      autoFocus
                      className={cn(
                        'h-[52px] w-full rounded-xl border bg-surface-2 px-4 text-[16px] font-medium transition-colors duration-200 outline-none placeholder:text-ink-faint',
                        attempts > 0 ? 'border-error' : 'border-border focus:border-border-strong',
                      )}
                    />
                  </motion.div>
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                      hint ? 'bg-[color:color-mix(in_srgb,var(--info)_14%,transparent)] text-info' : 'text-ink-faint',
                    )}
                    title={hint ? 'Подсказка доступна' : 'Подсказка появится после второй ошибки'}
                  >
                    <Lightbulb className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                </div>
                {attempts > 0 && (
                  <p className="mt-2 text-sm font-medium text-error">
                    Не то. Попробуй ещё раз или нажми «Не помню».
                  </p>
                )}
                {hint && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1.5 text-sm font-medium text-info"
                  >
                    Начинается на «{term.term.trim().charAt(0).toUpperCase()}…»
                  </motion.p>
                )}
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={reveal}
                    className="h-12 rounded-xl px-5 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-2"
                  >
                    Не помню
                  </button>
                  <button
                    type="submit"
                    disabled={!value.trim()}
                    className="h-12 flex-1 rounded-xl bg-terra text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-terra-hover disabled:opacity-45"
                  >
                    Проверить
                  </button>
                </div>
                <p className="mt-2 hidden text-[11px] font-medium text-ink-faint lg:block">
                  <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono">Enter</kbd> — проверить
                </p>
              </form>
            )}

            {isChoice && question.options && (
              <ChoiceOptions
                mode={mode}
                options={question.options}
                correctId={term.id}
                picked={picked}
                phase={phase}
                expanded={expanded}
                onPick={pick}
                onToggleExpand={(id) =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            )}

            {isPrecision && (
              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="Своими словами: что это такое, из чего состоит, чем отличается…"
                  className="min-h-[120px] w-full resize-y rounded-xl border border-border bg-surface-2 px-4 py-3 text-[16px] leading-[26px] transition-colors outline-none placeholder:text-ink-faint focus:border-border-strong"
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                    Опиши суть, состав и отличие от похожих явлений
                  </p>
                  <span className="tnum font-mono text-[12.5px] font-medium text-ink-faint">
                    {wordCount} {pluralRu(wordCount, 'слово', 'слова', 'слов')}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={reveal}
                    className="h-12 rounded-xl px-5 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-2"
                  >
                    Не помню
                  </button>
                  <button
                    type="button"
                    onClick={submitPrecision}
                    disabled={wordCount < 4}
                    title={wordCount < 4 ? 'Нужно минимум 4 слова' : undefined}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-terra text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-terra-hover disabled:opacity-45"
                  >
                    <Crosshair className="h-[18px] w-[18px]" />
                    Оценить
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* панель ответа / самооценки */}
        <AnimatePresence>
          {phase === 'feedback' && (!isPrecision || skipped) && (
            <AnswerPanel
              term={term}
              showDefinition={showTerm || isPrecision}
              wasRight={wasRight}
              onGrade={gradeSelf}
            />
          )}
          {phase === 'feedback' && isPrecision && !skipped && precision && (
            <PrecisionPanel
              result={precision}
              answer={yourAnswer || text}
              reference={term.definition}
              onGrade={gradePrecision}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

// ---------- choice options (режимы 2 и 3) ----------

function ChoiceOptions({
  mode,
  options,
  correctId,
  picked,
  phase,
  expanded,
  onPick,
  onToggleExpand,
}: {
  mode: Mode;
  options: Term[];
  correctId: string;
  picked: string | null;
  phase: 'answering' | 'feedback';
  expanded: Set<string>;
  onPick: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const isTermChoice = mode === 'def2term-choice';
  const longTerms = isTermChoice && options.some((o) => o.term.length > 24);

  return (
    <div className={cn(isTermChoice && !longTerms ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5')}>
      {options.map((opt, i) => {
        const isCorrect = opt.id === correctId;
        const isPicked = opt.id === picked;
        const answered = phase === 'feedback';
        const dimmed = answered && !isCorrect && !isPicked;
        const bodyText = isTermChoice ? opt.term : opt.definition;
        const clampable = !isTermChoice && opt.definition.length > 140;
        const isExpanded = expanded.has(opt.id);
        return (
          <motion.button
            key={opt.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{
              opacity: dimmed ? 0.4 : 1,
              y: 0,
              x: answered && isPicked && !isCorrect ? [0, -6, 6, -3, 0] : 0,
            }}
            transition={{
              delay: answered ? 0 : Math.min(i, 11) * 0.045,
              duration: 0.3,
              x: { duration: 0.3 },
            }}
            onClick={() => onPick(opt.id)}
            disabled={answered}
            className={cn(
              'flex min-h-[56px] items-start gap-3 rounded-xl border bg-surface p-3.5 text-left transition-colors duration-200',
              !answered && 'hover:-translate-y-0.5 hover:border-border-strong',
              answered && isCorrect && 'border-success bg-[color:color-mix(in_srgb,var(--success)_10%,transparent)]',
              answered && isPicked && !isCorrect && 'border-error bg-[color:color-mix(in_srgb,var(--error)_8%,transparent)]',
              !answered && 'border-border',
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[12px] font-semibold text-ink-muted',
                answered && isCorrect && 'bg-success text-white',
                answered && isPicked && !isCorrect && 'bg-error text-white',
              )}
            >
              {answered && isCorrect ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : answered && isPicked && !isCorrect ? (
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                OPTION_LETTERS[i]
              )}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1',
                isTermChoice
                  ? 'text-[15px] font-semibold'
                  : 'font-display text-[15px] leading-[24px] font-normal',
              )}
            >
              <span className={cn(clampable && !isExpanded && 'line-clamp-3')}>{bodyText}</span>
              {clampable && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(opt.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      onToggleExpand(opt.id);
                    }
                  }}
                  className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-terra"
                >
                  {isExpanded ? 'свернуть' : 'развернуть'}
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform duration-250', isExpanded && 'rotate-180')}
                  />
                </span>
              )}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------- панель ответа + самооценка (режимы 1–3, пропуск precision) ----------

function AnswerPanel({
  term,
  showDefinition,
  wasRight,
  onGrade,
}: {
  term: Term;
  showDefinition: boolean;
  wasRight: boolean;
  onGrade: (g: Grade) => void;
}) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="rounded-2xl border border-border bg-surface p-5">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            {showDefinition ? (
              <p className="font-display text-[17px] leading-[28px] font-normal">{term.definition}</p>
            ) : (
              <>
                <p className="font-display text-[22px] font-semibold">{term.term}</p>
                {term.etymology && (
                  <p className="mt-1 font-display text-[15px] text-ink-muted italic">{term.etymology}</p>
                )}
                <p className="mt-2 line-clamp-2 text-sm font-medium text-ink-muted">{term.definition}</p>
              </>
            )}
          </motion.div>

          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="mt-5">
            <p className="mb-2 text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">
              Насколько хорошо помнишь?
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => onGrade('bad')}
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 text-[15px] font-semibold transition-all duration-200 hover:bg-[color:color-mix(in_srgb,var(--error)_14%,transparent)] hover:text-error active:scale-[0.97]"
              >
                <X className="h-[18px] w-[18px]" />
                Не помню
              </button>
              <button
                type="button"
                onClick={() => onGrade('good')}
                disabled={!wasRight}
                title={!wasRight ? '«Знаю» недоступно после ошибки' : undefined}
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-terra text-[15px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-terra-hover active:scale-[0.97] disabled:opacity-45"
              >
                <Check className="h-[18px] w-[18px]" />
                Знаю
              </button>
            </div>
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => onGrade('unsure')}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Неуверенно
              </button>
            </div>
            <p className="mt-1 hidden text-center text-[11px] font-medium text-ink-faint lg:block">
              <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono">←</kbd> не помню ·{' '}
              <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono">→</kbd> знаю ·{' '}
              <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono">↑</kbd> неуверенно
            </p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ---------- precision: экран оценки ----------

/** Подсветка слов: в эталоне — пропущенные ключи, в ответе — совпавшие. */
function HighlightedText({
  text,
  reference,
  missed,
  role,
}: {
  text: string;
  reference: string;
  missed: string[];
  role: 'reference' | 'answer';
}) {
  const missedSet = useMemo(() => new Set(missed.map((w) => normalize(w))), [missed]);
  const okStems = useMemo(() => {
    const set = new Set<string>();
    for (const w of normalize(reference).split(' ')) {
      if (w.length > 2 && !missedSet.has(w)) set.add(stem(w));
    }
    return set;
  }, [reference, missedSet]);

  const tokens = text.split(/(\s+)/);
  return (
    <p className="font-display text-[15px] leading-[26px]">
      {tokens.map((tok, i) => {
        const norm = normalize(tok);
        if (!norm || norm.length <= 2) return <span key={i}>{tok}</span>;
        if (role === 'reference' && missedSet.has(norm)) {
          return (
            <motion.span
              key={i}
              initial={{ backgroundColor: 'transparent' }}
              animate={{ backgroundColor: 'color-mix(in srgb, var(--error) 15%, transparent)' }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.4 }}
              className="rounded px-0.5 underline decoration-[var(--error)] underline-offset-2"
            >
              {tok}
            </motion.span>
          );
        }
        if (role === 'answer' && okStems.has(stem(norm))) {
          return (
            <motion.span
              key={i}
              initial={{ backgroundColor: 'transparent' }}
              animate={{ backgroundColor: 'color-mix(in srgb, var(--success) 15%, transparent)' }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.4 }}
              className="rounded px-0.5"
            >
              {tok}
            </motion.span>
          );
        }
        return <span key={i}>{tok}</span>;
      })}
    </p>
  );
}

function PrecisionRing({ percent }: { percent: number }) {
  const shown = useCountUp(percent, 0.9);
  const r = 40;
  const c = 2 * Math.PI * r;
  const color = percentColor(percent);
  return (
    <span className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="absolute inset-0 -rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <motion.circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - percent / 100) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <span className="tnum font-mono text-[22px] leading-none font-semibold tracking-[-0.02em]" style={{ color }}>
        {shown}%
      </span>
    </span>
  );
}

function PrecisionPanel({
  result,
  answer,
  reference,
  onGrade,
}: {
  result: PrecisionResult;
  answer: string;
  reference: string;
  onGrade: (g: Grade) => void;
}) {
  const auto = precisionGrade(result.percent);
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="rounded-2xl border border-border bg-surface p-5">
        {/* датчик + вердикт */}
        <div className="flex items-center gap-5">
          <PrecisionRing percent={result.percent} />
          <div>
            <p className="text-[17px] font-bold lg:text-[19px]">{precisionVerdict(result.percent)}</p>
            <p className="tnum mt-1 font-mono text-[12.5px] font-medium text-ink-muted">
              полнота и формулировка → {result.percent}%
            </p>
          </div>
        </div>

        {/* разбор */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
            <p className="mb-1.5 text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">Твой ответ</p>
            <HighlightedText text={answer} reference={reference} missed={result.missedWords} role="answer" />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <p className="mb-1.5 text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">Эталон</p>
            <HighlightedText text={reference} reference={reference} missed={result.missedWords} role="reference" />
          </motion.div>
        </div>
        <p className="mt-2 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
          зелёное — совпало, красное — упущено
        </p>

        {/* ручное переопределение */}
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm font-medium text-ink-muted">
            Автооценка: <span className="tnum font-mono font-semibold">{result.percent}%</span> → «{GRADE_LABEL[auto]}»
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onGrade(auto)}
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-terra px-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-terra-hover"
            >
              Согласен
            </button>
            <button
              type="button"
              onClick={() => onGrade('good')}
              className="h-12 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold transition-colors hover:bg-surface-3"
            >
              Я знаю
            </button>
            <button
              type="button"
              onClick={() => onGrade('bad')}
              className="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-[color:color-mix(in_srgb,var(--error)_14%,transparent)] hover:text-error"
            >
              Не знаю
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
