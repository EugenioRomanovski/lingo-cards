// Страница термина (/library/:termId): hero, контент по вертикали, похожие, смежные, дублирующие ссылки (design/library.md §3-7).

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Flame, Pencil, RefreshCw, Waypoints } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { computeStatus, type TermProgress } from '@/lib/progress';
import { plural, STATUS_META, sessionHref, formatFutureRelative, formatPastRelative } from '@/pages/library-utils';
import type { Term } from '@/lib/data';
import { cn } from '@/lib/utils';

const SUBTITLE: Record<string, string> = {
  grammar: 'Грамматика',
  phonetics: 'Фонетика',
  lexicology: 'Лексикология',
  stylistics: 'Стилистика',
};

function topicVar(topic: string): string {
  return `var(--topic-${topic})`;
}

/** Relative timestamp "2 дня назад" / "через 5 дней" depending on direction. */
function RelStamp({ ts, future }: { ts: number; future: boolean }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((x) => x + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return <>{future ? formatFutureRelative(ts) : formatPastRelative(ts)}</>;
}

function RelatedChip({
  term,
  accent,
  onClick,
  titlePrefix,
}: {
  term: Term;
  accent: string;
  onClick: () => void;
  titlePrefix?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-medium transition-all duration-150 hover:-translate-y-px hover:shadow-sm"
      style={{ borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)` }}
      title={`${titlePrefix ?? ''}${term.term}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      <span className="truncate text-ink">{term.term}</span>
    </button>
  );
}

export default function TermPage() {
  const { termId } = useParams<{ termId: string }>();
  const navigate = useNavigate();
  const dataset = useAppStore((s) => s.dataset);
  const progress = useAppStore((s) => s.progress);
  const loadData = useAppStore((s) => s.loadData);

  useEffect(() => {
    if (!dataset) void loadData();
  }, [dataset, loadData]);

  const term = useMemo(() => dataset?.terms.find((t) => t.id === termId), [dataset, termId]);
  const byId = useMemo(() => new Map(dataset?.terms.map((t) => [t.id, t]) ?? []), [dataset]);
  const p: TermProgress | undefined = term ? progress.get(term.id) : undefined;
  const status = term ? computeStatus(p) : 'new';
  const meta = STATUS_META[status];

  if (!dataset) {
    return (
      <div className="mx-auto w-full max-w-[760px] space-y-6 px-4 py-8">
        <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
        <div className="rounded-2xl border bg-surface p-6">
          <div className="h-8 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="rounded-2xl border bg-surface p-6">
          <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-full animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  if (!term) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Термин не найден</h1>
        <p className="mt-2 text-sm text-ink-muted">Возможно, ссылка устарела или id опечатан.</p>
        <Link
          to="/library"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-terra-hover"
        >
          <ArrowLeft className="h-4 w-4" />К библиотеке
        </Link>
      </div>
    );
  }

  const accent = topicVar(term.topic);
  const twins = term.twinIds.map((id) => byId.get(id)).filter((t): t is Term => !!t);
  const linked = term.links.map((id) => byId.get(id)).filter((t): t is Term => !!t);
  const sameSubtopic = dataset.terms
    .filter((t) => t.id !== term.id && t.topic === term.topic && t.subtopic === term.subtopic)
    .slice(0, 6);
  const total = p ? p.correctCount + p.wrongCount : 0;
  const accuracy = total > 0 ? Math.round((p!.correctCount / total) * 100) : null;
  const learned = status === 'learned';

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 lg:py-8">
      {/* 3. Хлебные крошки */}
      <nav className="flex items-center gap-1.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
        <Link to="/library" className="transition-colors hover:text-ink">
          Библиотека
        </Link>
        <span>/</span>
        <span style={{ color: accent }}>{SUBTITLE[term.topic]}</span>
        <span>/</span>
        <span className="truncate text-ink-muted">{term.term}</span>
      </nav>

      {/* 4. Hero-блок */}
      <section
        className="mt-4 rounded-2xl border bg-surface p-5 shadow-md lg:p-7"
        style={{ borderTopWidth: 3, borderTopColor: accent }}
      >
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] lg:text-[34px]">
          {term.term}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold tracking-[0.04em]">
          <span
            className="rounded-full px-2.5 py-1"
            style={{ color: accent, backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}
          >
            {SUBTITLE[term.topic]}
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">{term.subtopic}</span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', meta.text)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
            {meta.label}
          </span>
          {p && p.correctStreak >= 3 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-terra-soft px-2.5 py-1 text-terra-ink">
              <Flame className="h-3.5 w-3.5" />
              {p.correctStreak} подряд
            </span>
          )}
        </div>
        {p && p.lastReviewed > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
            <span>
              Повторений: <span className="tnum text-ink">{p.reps}</span>
            </span>
            {accuracy !== null && (
              <span>
                Точность: <span className="tnum text-ink">{accuracy}%</span>
              </span>
            )}
            <span>
              Последнее: <RelStamp ts={p.lastReviewed} future={false} />
            </span>
            {p.nextReview > 0 && (
              <span>
                Следующее: <RelStamp ts={p.nextReview} future />
              </span>
            )}
          </div>
        )}
        {/* CTAs */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={sessionHref({ terms: term.id })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-terra px-3.5 py-2 text-[13.5px] font-semibold text-surface transition-colors hover:bg-terra-hover"
          >
            <Pencil className="h-4 w-4" />
            Повторить этот термин
          </Link>
          <Link
            to={sessionHref({ subtopic: term.subtopic, topic: term.topic })}
            className="inline-flex items-center gap-1.5 rounded-xl border bg-transparent px-3.5 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            <RefreshCw className="h-4 w-4" />
            Тренировать подтему
          </Link>
          <Link
            to={`/graph?focus=${term.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border bg-transparent px-3.5 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            <Waypoints className="h-4 w-4" />
            Показать на графе
          </Link>
        </div>
      </section>

      {/* 5. Контент */}
      <section className="mt-4 rounded-2xl border bg-surface p-5 shadow-sm lg:p-7">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">Определение</h2>
        <p className="mt-2 text-[15.5px] leading-[1.65] text-ink">{term.definition}</p>

        {term.etymology && (
          <>
            <h2 className="mt-6 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">Этимология</h2>
            <p className="mt-2 text-[14.5px] italic leading-[1.6] text-ink-muted">{term.etymology}</p>
          </>
        )}

        {twins.length > 0 && (
          <>
            <h2 className="mt-6 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">
              {term.lang === 'en' ? 'Русский термин' : 'English twin'}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {twins.map((t) => (
                <RelatedChip key={t.id} term={t} accent={accent} onClick={() => navigate(`/library/${t.id}`)} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* 6. Связанные */}
      {linked.length > 0 && (
        <section className="mt-4 rounded-2xl border bg-surface p-5 shadow-sm lg:p-7">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">
            Связанные термины · {linked.length}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {linked.map((t) => (
              <RelatedChip key={t.id} term={t} accent={topicVar(t.topic)} onClick={() => navigate(`/library/${t.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* 7. Похожие по подтеме */}
      {sameSubtopic.length > 0 && (
        <section className="mt-4 rounded-2xl border bg-surface p-5 shadow-sm lg:p-7">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">
            Ещё в «{term.subtopic}»
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sameSubtopic.map((t) => (
              <RelatedChip key={t.id} term={t} accent={accent} onClick={() => navigate(`/library/${t.id}`)} />
            ))}
          </div>
          {dataset.terms.filter((t) => t.id !== term.id && t.topic === term.topic && t.subtopic === term.subtopic).length >
            6 && (
            <Link
              to={`/library?topic=${term.topic}&subtopic=${encodeURIComponent(term.subtopic)}`}
              className="mt-3 inline-block text-[13px] font-semibold text-terra transition-colors hover:text-terra-hover"
            >
              Все{' '}
              {plural(
                dataset.terms.filter((t) => t.topic === term.topic && t.subtopic === term.subtopic).length,
                'термин',
                'термина',
                'терминов',
              )}{' '}
              подтемы →
            </Link>
          )}
        </section>
      )}

      {learned && (
        <p className="mt-6 text-center text-[13px] font-medium text-st-learned">
          Термин выучен — отличная работа. Загляни через пару недель, чтобы закрепить.
        </p>
      )}
    </div>
  );
}
