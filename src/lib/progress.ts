// SM-2 spaced repetition + Dexie (IndexedDB) persistence.
// DB name: lingo-cards (see design/engineering.md).

import Dexie, { type EntityTable } from 'dexie';

export type Grade = 'good' | 'unsure' | 'bad';
export type Mode = 'def2term-input' | 'def2term-choice' | 'term2def-choice' | 'term2def-precision';
export type ProgressStatus = 'new' | 'learning' | 'learned' | 'weak' | 'due';

export interface TermProgress {
  termId: string;
  ease: number; // SM-2 easiness factor, start 2.5
  interval: number; // days
  nextReview: number; // epoch ms
  reps: number;
  lapses: number;
  correctStreak: number;
  lastGrade: Grade | null;
  lastReviewed: number; // epoch ms, 0 = never
  correctCount: number;
  wrongCount: number;
}

export interface SessionAnswer {
  termId: string;
  mode: Mode;
  ok: boolean;
  score?: number; // precision percent (term2def-precision)
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

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const db = new Dexie('lingo-cards') as Dexie & {
  progress: EntityTable<TermProgress, 'termId'>;
  sessions: EntityTable<SessionRecord, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

db.version(1).stores({
  progress: 'termId, nextReview, lastReviewed',
  sessions: '++id, finishedAt',
  meta: 'key',
});

// ---------- SM-2 ----------

export function freshProgress(termId: string): TermProgress {
  return {
    termId,
    ease: 2.5,
    interval: 0,
    nextReview: 0,
    reps: 0,
    lapses: 0,
    correctStreak: 0,
    lastGrade: null,
    lastReviewed: 0,
    correctCount: 0,
    wrongCount: 0,
  };
}

/** SM-2 quality: good=5, unsure=3, bad=1. */
export function applyGrade(p: TermProgress, grade: Grade, now: number = Date.now()): TermProgress {
  const q = grade === 'good' ? 5 : grade === 'unsure' ? 3 : 1;
  const next: TermProgress = { ...p, lastGrade: grade, lastReviewed: now };

  if (grade === 'good') {
    next.correctCount += 1;
    next.correctStreak += 1;
    next.reps += 1;
  } else if (grade === 'unsure') {
    // повторение засчитано, серия и интервал не растут
    next.reps += 1;
  } else {
    next.wrongCount += 1;
    next.correctStreak = 0;
    next.lapses += 1;
  }

  next.ease = Math.max(1.3, p.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (grade === 'good') {
    next.interval =
      p.lastGrade === null || p.interval === 0 ? 1 : p.interval < 6 ? 6 : Math.round(p.interval * next.ease);
  } else if (grade === 'unsure') {
    next.interval = Math.max(1, Math.round((p.interval || 1) * 0.5));
  } else {
    next.interval = 1;
  }

  next.nextReview = now + next.interval * 86_400_000;
  return next;
}

export function computeStatus(p: TermProgress | undefined, now: number = Date.now()): ProgressStatus {
  if (!p || p.lastReviewed === 0) return 'new';
  if (p.lastGrade === 'bad') return 'weak';
  if (p.lastGrade === 'good' && p.interval >= 21) return now >= p.nextReview ? 'due' : 'learned';
  return now >= p.nextReview ? 'due' : 'learning';
}

// ---------- persistence helpers ----------

export async function getProgress(termId: string): Promise<TermProgress | undefined> {
  return db.progress.get(termId);
}

export async function saveProgress(p: TermProgress): Promise<void> {
  await db.progress.put(p);
}

/** Load progress for the given term ids (undefined ids → all). */
export async function getProgressMap(ids?: string[]): Promise<Map<string, TermProgress>> {
  const rows = ids ? await db.progress.where('termId').anyOf(ids).toArray() : await db.progress.toArray();
  return new Map(rows.map((r) => [r.termId, r]));
}

export async function saveSession(s: SessionRecord): Promise<number> {
  return db.sessions.add(s);
}
