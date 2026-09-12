// Local progress DB (Dexie/IndexedDB) + simplified SM-2 engine.
// Contract: design/engineering.md.

import Dexie, { type Table } from 'dexie';

export type ProgressStatus = 'new' | 'learning' | 'learned' | 'weak' | 'due';
export type Grade = 'good' | 'unsure' | 'bad';
export type Mode =
  | 'def2term-input'
  | 'def2term-choice'
  | 'term2def-choice'
  | 'term2def-precision';

export interface TermProgress {
  termId: string; // PK
  status: ProgressStatus;
  easiness: number; // SM-2, starts at 2.5
  interval: number; // days
  repetitions: number;
  nextReview: number; // timestamp
  lastResult: Grade | null;
  correctCount: number;
  wrongCount: number;
  favorite: boolean;
}

export interface SessionAnswer {
  termId: string;
  mode: Mode;
  ok: boolean;
  score?: number; // precision percent for term2def-precision
}

export interface SessionRecord {
  id?: number;
  startedAt: number;
  finishedAt: number;
  topics: string[];
  questionCount: number;
  correct: number;
  answers: SessionAnswer[];
}

class LingoCardsDB extends Dexie {
  progress!: Table<TermProgress, string>;
  sessions!: Table<SessionRecord, number>;

  constructor() {
    super('lingo-cards');
    this.version(1).stores({
      progress: 'termId, status, nextReview',
      sessions: '++id, startedAt, finishedAt',
    });
  }
}

export const db = new LingoCardsDB();

const DAY_MS = 86_400_000;

/** Default SM-2 state for a term that has never been trained. */
export function freshProgress(termId: string): TermProgress {
  return {
    termId,
    status: 'new',
    easiness: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: 0,
    lastResult: null,
    correctCount: 0,
    wrongCount: 0,
    favorite: false,
  };
}

/**
 * Simplified SM-2 (engineering.md):
 * - bad:    reps=0, interval=1, easiness=max(1.3, e-0.2), status='weak'
 * - unsure: interval=max(1, round(i*1.2)), easiness=max(1.3, e-0.15), reps+=1, status='learning'
 * - good:   reps+=1; interval = reps==1 ? 1 : reps==2 ? 3 : round(prev*e);
 *           easiness += 0.1 - 0.08*qualityAdjust; status='learning',
 *           if interval>=14 and reps>=3 -> 'learned'
 */
export function applyGrade(p: TermProgress, grade: Grade, now: number = Date.now()): TermProgress {
  const next: TermProgress = { ...p, lastResult: grade };
  if (grade === 'bad') {
    next.repetitions = 0;
    next.interval = 1;
    next.easiness = Math.max(1.3, p.easiness - 0.2);
    next.status = 'weak';
    next.wrongCount = p.wrongCount + 1;
  } else if (grade === 'unsure') {
    next.repetitions = p.repetitions + 1;
    next.interval = Math.max(1, Math.round(p.interval * 1.2));
    next.easiness = Math.max(1.3, p.easiness - 0.15);
    next.status = 'learning';
    next.wrongCount = p.wrongCount + 1;
  } else {
    const reps = p.repetitions + 1;
    next.repetitions = reps;
    next.interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(p.interval * p.easiness);
    next.easiness = Math.min(3.0, Math.max(1.3, p.easiness + 0.1));
    next.status = next.interval >= 14 && reps >= 3 ? 'learned' : 'learning';
    next.correctCount = p.correctCount + 1;
  }
  next.nextReview = now + next.interval * DAY_MS;
  return next;
}

/**
 * 'due' is computed, not stored: a learned/learning term whose nextReview has
 * passed is shown as "пора повторить". 'weak' stays 'weak' until retrained.
 */
export function computeStatus(p: TermProgress, now: number = Date.now()): ProgressStatus {
  if (p.status === 'new' || p.status === 'weak') return p.status;
  if (p.repetitions > 0 && p.nextReview > 0 && p.nextReview <= now) return 'due';
  return p.status;
}

/** Convenience: load all progress rows, filling gaps with fresh 'new' entries. */
export async function getProgressMap(termIds?: string[]): Promise<Map<string, TermProgress>> {
  const rows = await db.progress.toArray();
  const map = new Map(rows.map((r) => [r.termId, r]));
  if (termIds) {
    for (const id of termIds) if (!map.has(id)) map.set(id, freshProgress(id));
  }
  return map;
}

export async function saveProgress(p: TermProgress): Promise<void> {
  await db.progress.put(p);
}

export async function saveSession(s: SessionRecord): Promise<number> {
  return db.sessions.add(s);
}
