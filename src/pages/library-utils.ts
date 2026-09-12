// Shared helpers for the Library pages (/library, /library/:termId).
// Status colours come from the global --st-* tokens (design.md §2.4).

import type { ProgressStatus } from '@/lib/progress';

export interface StatusMeta {
  label: string;
  /** tailwind text colour class */
  text: string;
  /** tailwind bg colour class */
  bg: string;
  /** soft pill background (bg + /15 alpha via arbitrary value is avoided — uses bg + text) */
  dot: string;
}

export const STATUS_META: Record<ProgressStatus, StatusMeta> = {
  learned: { label: 'Выучен', text: 'text-st-learned', bg: 'bg-st-learned', dot: 'bg-st-learned' },
  learning: { label: 'В процессе', text: 'text-st-learning', bg: 'bg-st-learning', dot: 'bg-st-learning' },
  weak: { label: 'Слабый', text: 'text-st-weak', bg: 'bg-st-weak', dot: 'bg-st-weak' },
  due: { label: 'Пора повторить', text: 'text-st-due', bg: 'bg-st-due', dot: 'bg-st-due' },
  new: { label: 'Новый', text: 'text-st-new', bg: 'bg-st-new', dot: 'bg-st-new' },
};

/** Order for "По статусу" sorting: most action-needed first. */
export const STATUS_SORT_ORDER: Record<ProgressStatus, number> = {
  due: 0,
  weak: 1,
  learning: 2,
  new: 3,
  learned: 4,
};

export const ALL_STATUSES: ProgressStatus[] = ['new', 'learning', 'learned', 'weak', 'due'];

const DAY_MS = 86_400_000;

/** Russian plural: plural(5, 'повторение', 'повторения', 'повторений'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 > 1 && mod10 < 5) return few;
  if (mod10 === 1) return one;
  return many;
}

/** "сегодня" / "вчера" / "3 дня назад" for past timestamps. */
export function formatPastRelative(ts: number, now: number = Date.now()): string {
  const days = Math.floor((now - ts) / DAY_MS);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
}

/** "через 12 дней" / "завтра" for future timestamps. */
export function formatFutureRelative(ts: number, now: number = Date.now()): string {
  const days = Math.ceil((ts - now) / DAY_MS);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Session deep-link contract shared with the training pages (see Home.tsx). */
export function sessionHref(params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  return `/train/session?${q.toString()}`;
}
