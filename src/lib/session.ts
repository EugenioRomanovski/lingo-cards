// Сессия: пул, перемешивание, генерация вопросов (design/engineering.md, session-setup.md).

import type { Dataset, Term } from '@/lib/data';
import { computeStatus, type Mode, type TermProgress } from '@/lib/progress';

export type PoolMode = 'all' | 'new' | 'weak' | 'due' | 'force';

export interface SessionSettings {
  topics: string[];
  count: number | 'all';
  modes: Mode[];
  pool: PoolMode;
  includeEN: boolean;
  mixReview: boolean;
}

export interface Question {
  term: Term;
  mode: Mode;
  /** Для choice-режимов: 4 варианта (включают правильный). */
  options?: Term[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Пул терминов по настройкам (до ограничения count). */
export function buildPool(
  dataset: Dataset,
  settings: SessionSettings,
  progress: Map<string, TermProgress>,
  now: number = Date.now(),
): Term[] {
  const inScope = dataset.terms.filter(
    (t) => settings.topics.includes(t.topic) && (settings.includeEN || t.lang !== 'en'),
  );
  const statusOf = (t: Term) => {
    const p = progress.get(t.id);
    return p ? computeStatus(p, now) : 'new';
  };

  switch (settings.pool) {
    case 'new':
      return inScope.filter((t) => statusOf(t) === 'new');
    case 'weak': {
      const weak = inScope.filter((t) => statusOf(t) === 'weak');
      if (settings.mixReview) {
        const due = inScope.filter((t) => statusOf(t) === 'due');
        return [...weak, ...due];
      }
      return weak;
    }
    case 'due':
      return inScope.filter((t) => statusOf(t) === 'due');
    case 'force':
      return inScope;
    case 'all':
    default: {
      if (!settings.mixReview) return inScope;
      const rank = (t: Term): number => {
        const st = statusOf(t);
        if (st === 'due') return 0;
        if (st === 'weak') return 1;
        if (st === 'new') return 2;
        if (st === 'learning') return 3;
        return 4;
      };
      return [...inScope].sort((a, b) => rank(a) - rank(b));
    }
  }
}

/** Дистракторы для choice-режимов: та же тема и язык, иначе — любые. */
export function pickDistractors(term: Term, dataset: Dataset, n: number): Term[] {
  const sameTopic = dataset.terms.filter((t) => t.id !== term.id && t.topic === term.topic && t.lang === term.lang);
  const others = dataset.terms.filter((t) => t.id !== term.id && (t.topic !== term.topic || t.lang !== term.lang));
  const picked = shuffle(sameTopic).slice(0, n);
  if (picked.length < n) {
    picked.push(...shuffle(others).slice(0, n - picked.length));
  }
  return picked;
}

/** Полная сессия: пул → count → перемешать → назначить режимы и варианты. */
export function generateSession(
  dataset: Dataset,
  settings: SessionSettings,
  progress: Map<string, TermProgress>,
): Question[] {
  const pool = buildPool(dataset, settings, progress);
  const limited = settings.count === 'all' ? pool : pool.slice(0, settings.count);
  const modes = settings.modes.length > 0 ? settings.modes : (['def2term-choice'] as Mode[]);
  return shuffle(limited).map((term) => {
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const q: Question = { term, mode };
    if (mode === 'def2term-choice' || mode === 'term2def-choice') {
      q.options = shuffle([term, ...pickDistractors(term, dataset, 3)]);
    }
    return q;
  });
}
