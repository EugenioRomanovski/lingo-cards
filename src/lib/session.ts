// Session generator (engineering.md "Движок сессии").
// Pure functions — page agents wire them to UI.

import type { Dataset, Term, TopicId } from './data';
import { computeStatus, type Mode, type ProgressStatus, type TermProgress } from './progress';

export type PoolMode = 'all' | 'new' | 'weak' | 'due' | 'force';

export interface SessionSettings {
  topics: TopicId[];
  count: number | 'all'; // 5/10/20/50/'all'
  modes: Mode[];
  pool: PoolMode;
  includeEN: boolean;
  mixReview: boolean; // add due terms on top of the filtered pool
}

export interface Question {
  term: Term;
  mode: Mode;
  /** For choice modes: 4 options including the correct answer, shuffled. */
  options?: Term[];
}

export const DEFAULT_SETTINGS: SessionSettings = {
  topics: ['grammar', 'phonetics', 'lexicology', 'stylistics'],
  count: 20,
  modes: ['def2term-input', 'def2term-choice', 'term2def-choice', 'term2def-precision'],
  pool: 'all',
  includeEN: true,
  mixReview: true,
};

function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function statusOf(p: TermProgress | undefined, now: number): ProgressStatus {
  if (!p) return 'new';
  return computeStatus(p, now);
}

/**
 * Filter the term pool by settings.
 * - pool='force' — all terms of selected topics, statuses ignored.
 * - otherwise filter by status; mixReview additionally pulls in due terms.
 * - includeEN=false excludes lang='en'.
 */
export function buildPool(
  dataset: Dataset,
  settings: SessionSettings,
  progress: Map<string, TermProgress>,
  now: number = Date.now(),
): Term[] {
  const inTopics = dataset.terms.filter(
    (t) => settings.topics.includes(t.topic) && (settings.includeEN || t.lang !== 'en'),
  );
  if (settings.pool === 'force' || settings.pool === 'all') {
    return inTopics;
  }
  const wanted = settings.pool; // 'new' | 'weak' | 'due'
  const pool = inTopics.filter((t) => statusOf(progress.get(t.id), now) === wanted);
  if (settings.mixReview && wanted !== 'due') {
    const due = inTopics.filter((t) => statusOf(progress.get(t.id), now) === 'due');
    const ids = new Set(pool.map((t) => t.id));
    for (const t of due) if (!ids.has(t.id)) pool.push(t);
  }
  return pool;
}

/** Pick 3 distractors from the same topic (falling back to any topic), no duplicates. */
export function pickDistractors(
  term: Term,
  dataset: Dataset,
  count = 3,
  rand: () => number = Math.random,
): Term[] {
  const sameTopic = shuffle(
    dataset.terms.filter((t) => t.topic === term.topic && t.id !== term.id && t.lang === term.lang),
    rand,
  );
  const picked = sameTopic.slice(0, count);
  if (picked.length < count) {
    const rest = shuffle(
      dataset.terms.filter(
        (t) => t.id !== term.id && !picked.some((p) => p.id === t.id) && t.lang === term.lang,
      ),
      rand,
    );
    picked.push(...rest.slice(0, count - picked.length));
  }
  return picked;
}

/**
 * Generate a full session: shuffled questions, each with a random mode
 * from settings.modes. Choice modes get 4 options (correct + 3 distractors).
 */
export function generateSession(
  dataset: Dataset,
  settings: SessionSettings,
  progress: Map<string, TermProgress>,
  now: number = Date.now(),
  rand: () => number = Math.random,
): Question[] {
  const pool = shuffle(buildPool(dataset, settings, progress, now), rand);
  const limited = settings.count === 'all' ? pool : pool.slice(0, settings.count);
  const modes = settings.modes.length > 0 ? settings.modes : DEFAULT_SETTINGS.modes;

  return limited.map((term) => {
    const mode = modes[Math.floor(rand() * modes.length)];
    const q: Question = { term, mode };
    if (mode === 'def2term-choice' || mode === 'term2def-choice') {
      q.options = shuffle([term, ...pickDistractors(term, dataset, 3, rand)], rand);
    }
    return q;
  });
}

/** Summary helper: count terms per status for a set of terms. */
export function countByStatus(
  terms: Term[],
  progress: Map<string, TermProgress>,
  now: number = Date.now(),
): Record<ProgressStatus, number> {
  const counts: Record<ProgressStatus, number> = {
    new: 0,
    learning: 0,
    learned: 0,
    weak: 0,
    due: 0,
  };
  for (const t of terms) counts[statusOf(progress.get(t.id), now)]++;
  return counts;
}
