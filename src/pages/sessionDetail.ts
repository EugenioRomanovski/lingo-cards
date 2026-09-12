// Общие типы детального протокола сессии (TrainSession → TrainResults через sessionStorage).

import type { Grade, Mode, ProgressStatus } from '@/lib/progress';
import type { SessionSettings } from '@/lib/session';
import type { Term } from '@/lib/data';

export interface SessionAnswerDetail {
  termId: string;
  mode: Mode;
  grade: Grade;
  ok: boolean;
  score?: number; // precision percent
  yourAnswer: string;
  skipped: boolean;
  term: Pick<Term, 'id' | 'term' | 'definition' | 'etymology' | 'topic' | 'lang'>;
  statusBefore: ProgressStatus;
  statusAfter: ProgressStatus;
}

export interface SessionDetail {
  startedAt: number;
  finishedAt: number;
  settings: SessionSettings & { termIds?: string[] };
  answers: SessionAnswerDetail[];
}

export const sessionDetailKey = (id: number) => `lingo-cards-session-${id}`;
