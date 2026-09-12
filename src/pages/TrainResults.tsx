// Результаты сессии (design/results.md). Route: /train/results?id=<sessionId>.
// Кольцо точности, статистика, изменения статусов, разбор ошибок, разбивка по темам, CTA.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  Award,
  Check,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  List,
  ListChecks,
  PartyPopper,
  Play,
  Repeat,
  TextCursorInput,
  Timer,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { db, type Grade, type Mode, type SessionRecord } from '@/lib/progress';
import type { Term, TopicId } from '@/lib/data';
import { sessionDetailKey, type SessionAnswerDetail, type SessionDetail } from '@/pages/sessionDetail';
import { cn } from '@/lib/utils';

const MODE_ICON: Record<Mode, typeof List> = {
  'def2term-choice': ListChecks,
  'def2term-input': TextCursorInput,
  'term2def-choice': List,
  'term2def-precision': Crosshair,
};

function accuracyColor(p: number): string {
  if (p >= 90) return 'var(--success)';
  if (p >= 70) return 'var(--warning)';
  if (p >= 50) return '#C4763B';
  return 'var(--error)';
}

function verdict(p: number): string {
  if (p >= 95) return 'Блестяще!';
  if (p >= 85) return 'Отличная работа!';
  if (p >= 70) return 'Хорошая сессия';
  if (p >= 50) return 'Есть над чем поработать';
  return 'Сложно, но это и есть рост';
}

function plural(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} мин ${s % 60} с` : `${s} с`;
}

function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useCountUp(target: number, duration = 1.2, delay = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now + delay * 1000;
      const t = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return value;
}

/** Унифицированная строка ответа: из детали (sessionStorage) или из записи Dexie + датасета. */
interface Row {
  termId: string;
  mode: Mode;
  ok: boolean;
  grade: Grade | null;
  score?: number;
  yourAnswer: string;
  skipped: boolean;
  term: Pick<Term, 'id' | 'term' | 'definition' | 'etymology' | 'topic' | 'lang'> | null;
  statusBefore?: SessionAnswerDetail['statusBefore'];
  statusAfter?: SessionAnswerDetail['statusAfter'];
}

export default function TrainResults() {
  const [sp] = useSearchParams();
  const dataset = useAppStore((s) => s.dataset);
  const loadData = useAppStore((s) => s.loadData);
  const [record, setRecord] = useState<SessionRecord | null | undefined>(undefined);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idParam = sp.get('id');
      let rec: SessionRecord | undefined;
      try {
        if (idParam) rec = await db.sessions.get(Number(idParam));
        if (!rec) rec = await db.sessions.orderBy('finishedAt').reverse().first();
      } catch {
        rec = undefined;
      }
      if (cancelled) return;
      setRecord(rec ?? null);
      if (rec?.id != null) {
        try {
          const raw = sessionStorage.getItem(sessionDetailKey(rec.id));
          if (raw && !cancelled) setDetail(JSON.parse(raw) as SessionDetail);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sp]);

  const rows: Row[] = useMemo(() => {
    if (detail) {
      return detail.answers.map((a) => ({
        termId: a.termId,
        mode: a.mode,
        ok: a.ok,
        grade: a.grade,
        score: a.score,
        yourAnswer: a.yourAnswer,
        skipped: a.skipped,
        term: a.term,
        statusBefore: a.statusBefore,
        statusAfter: a.statusAfter,
      }));
    }
    if (record && dataset) {
      const byId = new Map(dataset.terms.map((t) => [t.id, t]));
      return record.answers.map((a) => ({
        termId: a.termId,
        mode: a.mode,
        ok: a.ok,
        grade: null,
        score: a.score,
        yourAnswer: '',
        skipped: false,
        term: byId.get(a.termId) ?? null,
      }));
    }
    return [];
  }, [detail, record, dataset]);

  if (record === undefined) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10">
        <div className="mx-auto h-40 w-40 animate-pulse rounded-full bg-surface-2" />
        <div className="mx-auto mt-6 h-8 w-56 animate-pulse rounded-xl bg-surface-2" />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col items-center px-4 py-24 text-center">
        <img src={`${import.meta.env.BASE_URL}empty-stats.svg`} alt="" className="h-32 w-auto" />
        <p className="mt-4 font-display text-[22px] font-semibold">Сессия не найдена</p>
        <p className="mt-2 max-w-sm text-sm font-medium text-ink-muted">
          Похоже, ты ещё не закончил ни одной тренировки — самое время начать.
        </p>
        <Link
          to="/train/setup"
          className="mt-6 flex h-12 items-center gap-2 rounded-xl bg-terra px-6 text-[15px] font-semibold text-white transition-colors hover:bg-terra-hover"
        >
          <Play className="h-[18px] w-[18px]" />
          Начать сессию
        </Link>
      </div>
    );
  }

  return <ResultsBody record={record} detail={detail} rows={rows} />;
}

// ---------- body ----------

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
};

function ResultsBody({
  record,
  detail,
  rows,
}: {
  record: SessionRecord;
  detail: SessionDetail | null;
  rows: Row[];
}) {
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const reducedMotion = useReducedMotion();

  const total = record.questionCount;
  const correct = record.correct;
  const accuracy = total > 0 ? Math.round((100 * correct) / total) : 0;
  const errors = rows.filter((r) => !r.ok);
  const partialCount = rows.filter((r) => r.grade === 'unsure').length;
  const durationMs = record.finishedAt - record.startedAt;

  const bestStreak = useMemo(() => {
    let best = 0;
    let cur = 0;
    for (const r of rows) {
      if (r.ok) {
        cur++;
        best = Math.max(best, cur);
      } else cur = 0;
    }
    return best;
  }, [rows]);

  // --- изменения статусов ---
  const statusGroups = useMemo(() => {
    const g: { key: string; title: string; color: string; icon: 'dot' | 'trending'; rows: Row[] }[] = [];
    const withStatus = rows.filter((r) => r.statusBefore && r.statusAfter);
    if (withStatus.length === 0) return g;
    const learned = withStatus.filter((r) => r.statusAfter === 'learned' && r.statusBefore !== 'learned');
    const weakened = withStatus.filter((r) => r.statusAfter === 'weak' && r.statusBefore !== 'weak');
    const review = withStatus.filter(
      (r) => r.grade === 'good' && !(r.statusAfter === 'learned' && r.statusBefore !== 'learned'),
    );
    const back = withStatus.filter((r) => r.statusBefore === 'weak' && r.statusAfter !== 'weak');
    if (learned.length > 0)
      g.push({ key: 'learned', title: `${learned.length} ${plural(learned.length, 'термин стал', 'термина стали', 'терминов стали')} выученными`, color: 'var(--st-learned)', icon: 'dot', rows: learned });
    if (weakened.length > 0)
      g.push({ key: 'weak', title: `${weakened.length} ${plural(weakened.length, 'термин помечен', 'термина помечены', 'терминов помечены')} слабыми`, color: 'var(--st-weak)', icon: 'dot', rows: weakened });
    if (review.length > 0)
      g.push({ key: 'review', title: `${review.length} ${plural(review.length, 'термин ушёл', 'термина ушли', 'терминов ушли')} на повторение`, color: 'var(--st-due)', icon: 'dot', rows: review });
    if (back.length > 0)
      g.push({ key: 'back', title: `${back.length} ${plural(back.length, 'термин снова', 'термина снова', 'терминов снова')} в строю`, color: 'var(--st-learned)', icon: 'trending', rows: back });
    return g;
  }, [rows]);

  // --- разбивка по темам ---
  const topicStats = useMemo(() => {
    const map = new Map<TopicId, { ok: number; total: number }>();
    for (const r of rows) {
      const topic = r.term?.topic;
      if (!topic) continue;
      const e = map.get(topic) ?? { ok: 0, total: 0 };
      e.total++;
      if (r.ok) e.ok++;
      map.set(topic, e);
    }
    return map;
  }, [rows]);

  const retryModes: Mode[] = useMemo(() => {
    const fromDetail = detail?.settings.modes;
    if (fromDetail && fromDetail.length > 0) return fromDetail;
    const uniq = Array.from(new Set(record.answers.map((a) => a.mode)));
    return uniq.length > 0 ? uniq : (['def2term-choice'] as Mode[]);
  }, [detail, record]);

  const retryHref = (ids: string[]) =>
    `/train/session?${new URLSearchParams({ terms: ids.join(','), modes: retryModes.join(','), en: detail?.settings.includeEN ? '1' : '0' }).toString()}`;

  const subline = [
    `${correct} верно`,
    `${errors.length} ${plural(errors.length, 'ошибка', 'ошибки', 'ошибок')}`,
    partialCount > 0 ? `${partialCount} частично` : null,
    `${total} ${plural(total, 'вопрос', 'вопроса', 'вопросов')}`,
    formatDuration(durationMs),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-[720px] px-4 pt-8 pb-10"
    >
      {accuracy >= 90 && total > 0 && <ConfettiBurst />}

      {/* 1. Герой: кольцо точности */}
      <motion.section variants={item} className="flex flex-col items-center text-center">
        <AccuracyRingBig percent={accuracy} />
        <h1 className="mt-5 font-display text-[28px] leading-[34px] font-semibold tracking-[-0.01em] lg:text-[34px]">
          {verdict(accuracy)
            .split(' ')
            .map((w, i) => (
              <motion.span
                key={i}
                className="inline-block"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.06, duration: 0.35 }}
              >
                {w}&nbsp;
              </motion.span>
            ))}
        </h1>
        <p className="tnum mt-2 text-sm font-medium text-ink-muted">{subline}</p>
      </motion.section>

      {/* 2. Строка статистики */}
      <motion.section variants={item} className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} iconColor="var(--success)" label="Верно" value={String(correct)} delay={0} />
        <StatCard icon={XCircle} iconColor="var(--error)" label="Ошибки" value={String(errors.length)} delay={0.07} />
        <StatCard icon={Timer} iconColor="var(--info)" label="Время" value={formatClock(durationMs)} delay={0.14} />
        <StatCard icon={Zap} iconColor="var(--warning)" label="Серия" value={`×${bestStreak} лучшая`} delay={0.21} />
      </motion.section>

      {/* 3. Что изменилось в статусах */}
      <motion.section variants={item} className="mt-8">
        <h3 className="mb-3 text-[17px] font-bold lg:text-[19px]">Прогресс</h3>
        {statusGroups.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm font-medium text-ink-muted">
            Статусы без изменений — всё стабильно
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {statusGroups.map((g) => (
              <StatusGroupRow key={g.key} group={g} />
            ))}
          </div>
        )}
      </motion.section>

      {/* 4. Разбор ошибок */}
      <motion.section variants={item} className="mt-8">
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-[17px] font-bold lg:text-[19px]">Разбор ошибок</h3>
          {errors.length > 0 && (
            <span className="tnum font-mono text-[12.5px] font-medium text-ink-faint">{errors.length}</span>
          )}
        </div>
        {errors.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-4">
            <PartyPopper className="h-5 w-5 shrink-0 text-success" strokeWidth={1.75} />
            <p className="text-sm font-semibold">Чистая сессия — ни одной ошибки</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {errors.map((r, i) => (
              <ErrorCard key={`${r.termId}-${i}`} row={r} index={i} onRetry={(id) => navigate(retryHref([id]))} />
            ))}
          </div>
        )}
      </motion.section>

      {/* 5. По темам */}
      {topicStats.size > 1 && dataset && (
        <motion.section variants={item} className="mt-8">
          <h3 className="mb-3 text-[17px] font-bold lg:text-[19px]">По темам</h3>
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
            {Array.from(topicStats.entries()).map(([topicId, st], i) => {
              const topic = dataset.topics.find((t) => t.id === topicId);
              const frac = st.total > 0 ? st.ok / st.total : 0;
              return (
                <div key={topicId}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm font-semibold">{topic?.title ?? topicId}</span>
                    <span className="tnum font-mono text-[12.5px] font-medium text-ink-muted">
                      {st.ok}/{st.total} верно
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full"
                    style={{
                      backgroundColor:
                        frac < 1 ? 'color-mix(in srgb, var(--error) 25%, var(--surface-3))' : 'var(--surface-3)',
                    }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: topic?.color ?? 'var(--accent)' }}
                      initial={{ width: 0 }}
                      whileInView={reducedMotion ? undefined : { width: `${frac * 100}%` }}
                      animate={reducedMotion ? { width: `${frac * 100}%` } : undefined}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* 7. Достижение (слот): чистая сессия ≥ 20 вопросов */}
      {errors.length === 0 && total >= 20 && (
        <motion.section
          initial={{ opacity: 0, rotate: -3, scale: 0.9 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 24, delay: 0.5 }}
          className="mt-8 flex items-center gap-4 rounded-2xl bg-terra-soft p-4"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface">
            <Award className="h-6 w-6 text-terra" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[15px] font-bold">Достижение: безупречная серия</p>
            <p className="mt-0.5 text-sm font-medium text-ink-muted">{total} вопросов без единой ошибки</p>
          </div>
        </motion.section>
      )}

      {/* 6. CTA-панель */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.5 }}
        className="sticky bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-40 mt-8 lg:bottom-3"
      >
        <div className="rounded-2xl border border-border bg-surface/90 p-3.5 shadow-lg backdrop-blur-[12px]">
          <div className="flex gap-2.5">
            {errors.length > 0 ? (
              <motion.button
                type="button"
                onClick={() => navigate(retryHref(errors.map((e) => e.termId)))}
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ delay: 0.9, duration: 0.6 }}
                className="flex h-[52px] flex-[2] items-center justify-center gap-2 rounded-xl bg-terra text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-terra-hover"
              >
                <Repeat className="h-[18px] w-[18px]" />
                Повторить ошибки ({errors.length})
              </motion.button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/train/setup')}
                className="flex h-[52px] flex-[2] items-center justify-center gap-2 rounded-xl bg-terra text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-terra-hover"
              >
                <Play className="h-[18px] w-[18px]" />
                Новая сессия
              </button>
            )}
            {errors.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/train/setup')}
                className="flex h-[52px] flex-1 items-center justify-center rounded-xl bg-surface-2 text-[15px] font-semibold transition-colors hover:bg-surface-3"
              >
                Новая сессия
              </button>
            )}
          </div>
          <div className="mt-2 flex justify-center">
            <Link
              to="/"
              className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              На главную
            </Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- components ----------

function AccuracyRingBig({ percent }: { percent: number }) {
  const shown = useCountUp(percent, 1.2);
  const r = 70;
  const c = 2 * Math.PI * r;
  const color = accuracyColor(percent);
  return (
    <span className="relative flex h-40 w-40 items-center justify-center">
      <svg width="160" height="160" viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        <motion.circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - percent / 100) }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <span className="flex flex-col items-center">
        <span className="tnum font-mono text-[40px] leading-[1.1] font-semibold tracking-[-0.02em]">{shown}%</span>
        <span className="text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">точность</span>
      </span>
    </span>
  );
}

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  delay,
}: {
  icon: typeof Check;
  iconColor: string;
  label: string;
  value: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + delay, duration: 0.35 }}
      className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
    >
      <span
        className="mb-2 flex h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 12%, transparent)` }}
      >
        <Icon className="h-[18px] w-[18px]" style={{ color: iconColor }} strokeWidth={1.75} />
      </span>
      <p className="tnum font-mono text-[22px] leading-[1.1] font-semibold tracking-[-0.02em]">{value}</p>
      <p className="mt-1 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">{label}</p>
    </motion.div>
  );
}

function StatusGroupRow({
  group,
}: {
  group: { key: string; title: string; color: string; icon: 'dot' | 'trending'; rows: Row[] };
}) {
  const [open, setOpen] = useState(false);
  const shown = group.rows.slice(0, 5);
  const rest = group.rows.length - shown.length;
  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        {group.icon === 'trending' ? (
          <TrendingUp className="h-4 w-4 shrink-0" style={{ color: group.color }} strokeWidth={1.75} />
        ) : (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: group.color }}
          />
        )}
        <span className="flex-1 text-sm font-medium">{group.title}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
        {shown.map((r) => (
          <TermChip key={r.termId} row={r} />
        ))}
        {rest > 0 && !open && (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[11px] font-semibold text-ink-muted">
            +{rest}
          </span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && rest > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 pt-2 pl-6">
              {group.rows.slice(5).map((r) => (
                <TermChip key={r.termId} row={r} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TermChip({ row }: { row: Row }) {
  const dataset = useAppStore((s) => s.dataset);
  const topic = dataset?.topics.find((t) => t.id === row.term?.topic);
  return (
    <Link
      to={`/library/${row.termId}`}
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] font-semibold transition-colors hover:bg-surface-2"
    >
      {topic && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: topic.color }} />}
      {row.term?.term ?? row.termId}
    </Link>
  );
}

function ErrorCard({ row, index, onRetry }: { row: Row; index: number; onRetry: (id: string) => void }) {
  const dataset = useAppStore((s) => s.dataset);
  const [expanded, setExpanded] = useState(false);
  const topic = dataset?.topics.find((t) => t.id === row.term?.topic);
  const ModeIcon = MODE_ICON[row.mode];
  const isDefAnswer = row.mode === 'def2term-input' || row.mode === 'def2term-choice';
  const isPrecision = row.mode === 'term2def-precision';
  const clampable = (row.term?.definition.length ?? 0) > 160;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: Math.min(index, 5) * 0.07, duration: 0.35 }}
      className="rounded-xl border border-border border-l-4 border-l-error bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-display text-[17px] font-semibold">{row.term?.term ?? row.termId}</span>
          {topic && (
            <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: topic.color }} />
              {topic.title}
            </span>
          )}
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2" title="Режим вопроса">
            <ModeIcon className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
          </span>
          {isPrecision && row.score != null && (
            <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5">
              <MiniRing percent={row.score} />
              <span className="tnum font-mono text-[11px] font-semibold text-ink-muted">{row.score}%</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRetry(row.termId)}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-terra"
        >
          <Repeat className="h-3.5 w-3.5" />
          Ещё раз
        </button>
      </div>

      <div className="mt-2.5">
        {row.skipped || !row.yourAnswer ? (
          <p className="text-sm font-medium text-ink-faint italic">пропущено</p>
        ) : isPrecision ? (
          <p className="line-clamp-2 text-sm font-medium text-ink-muted">«{row.yourAnswer}»</p>
        ) : (
          <p className="text-sm font-medium text-error line-through">{row.yourAnswer}</p>
        )}
        <ArrowDown className="mt-1 h-3 w-3 text-ink-faint" strokeWidth={2} />
        <p className="mt-1 text-[15px] font-semibold text-success">
          {isDefAnswer ? (row.term?.term ?? '') : 'Правильное определение:'}
        </p>
        {!isDefAnswer && row.term && (
          <div className="mt-1">
            <p
              className={cn(
                'font-display text-[15px] leading-[24px] font-normal text-ink-muted',
                clampable && !expanded && 'line-clamp-3',
              )}
            >
              {row.term.definition}
            </p>
            {clampable && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-terra"
              >
                {expanded ? 'свернуть' : 'развернуть'}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MiniRing({ percent }: { percent: number }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
      <circle cx="16" cy="16" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3.5" />
      <circle
        cx="16"
        cy="16"
        r={r}
        fill="none"
        stroke={accuracyColor(percent)}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
      />
    </svg>
  );
}

// ---------- ConfettiBurst (design.md §6): canvas, цвета 4 тем, ~1.2s, один раз ----------

const CONFETTI_COLORS = ['#B0705A', '#7D8F69', '#A08A5B', '#8A7A9E'];

function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    interface P {
      x: number; y: number; vx: number; vy: number; size: number;
      color: string; rot: number; vr: number; life: number;
    }
    const parts: P[] = Array.from({ length: 90 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 5 + Math.random() * 7;
      return {
        x: w / 2,
        y: h * 0.28,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 5,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        life: 1,
      };
    });

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1200;
      ctx.clearRect(0, 0, w, h);
      if (t >= 1) return;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22;
        p.vx *= 0.985;
        p.rot += p.vr;
        const alpha = 1 - t;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, w, h);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 60, pointerEvents: 'none' }}
      aria-hidden
    />
  );
}
