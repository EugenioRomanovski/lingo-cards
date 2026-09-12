// Text matching: normalization, Levenshtein, soft term check, precision scoring.
// Contract: design/engineering.md. Pure functions.

/** lower, ё→е, trim, collapse spaces, strip punctuation. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export interface TermCheckResult {
  ok: boolean;
  /** true when the answer matched only via the fuzzy (typo) path. */
  typo: boolean;
}

/**
 * Soft term check (def2term-input): exact match OR
 * Levenshtein <= 1 (words <= 7 chars) / <= 2 (longer).
 */
export function checkTerm(answer: string, reference: string): TermCheckResult {
  const a = normalize(answer);
  const r = normalize(reference);
  if (!a) return { ok: false, typo: false };
  if (a === r) return { ok: true, typo: false };
  const dist = levenshtein(a, r);
  const limit = r.length <= 7 ? 1 : 2;
  return { ok: dist <= limit, typo: dist <= limit };
}

// ---------- precision mode ----------

const STOP_WORDS = new Set([
  // RU
  'и', 'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'по', 'за', 'из', 'у', 'о', 'об', 'от', 'до',
  'для', 'или', 'а', 'но', 'не', 'же', 'ли', 'бы', 'то', 'это', 'этот', 'эта', 'эти',
  'который', 'которая', 'которое', 'которые', 'также', 'как', 'что', 'чем', 'тот', 'та',
  'те', 'все', 'его', 'ее', 'их', 'свой', 'сам', 'так', 'там', 'здесь', 'при', 'над', 'под',
  'без', 'между', 'через', 'перед', 'после', 'более', 'менее', 'очень', 'может', 'быть',
  'является', 'являются', 'есть', 'один', 'одна', 'одно', 'другой', 'другие', 'каждый',
  // EN
  'the', 'of', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'this', 'these', 'those', 'it',
  'its', 'as', 'not', 'no', 'but', 'if', 'than', 'then', 'so', 'such', 'which', 'who', 'whom',
]);

// RU suffix-stemmer: longest-match list of common inflectional endings.
const RU_ENDINGS = [
  'иями', 'ями', 'ами', 'ией', 'иях', 'ения', 'ение', 'ений', 'ению', 'ением',
  'ости', 'ость', 'остью', 'ов', 'ев', 'ей', 'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее',
  'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'у', 'ю', 'ы', 'и', 'а', 'я', 'о', 'е',
  // verb endings
  'ают', 'уют', 'яют', 'ает', 'ует', 'яет', 'ать', 'ять', 'ить', 'ыть', 'еть',
  'ит', 'ят', 'ет', 'ут', 'ют', 'ал', 'ял', 'ил', 'ела', 'ала', 'ило',
  // abstract noun endings
  'ие', 'ия', 'иям', 'ием', 'ция', 'цию', 'ции',
];
// EN suffix-stemmer.
const EN_ENDINGS = ['ing', 'ies', 'es', 'ed', 's'];

// Stems that should also be treated as stop words (inflected forms of stop words).
const STOP_STEMS = new Set([
  'котор', 'эт', 'тот', 'сво', 'сам', 'одн', 'друг', 'кажд', 'вс', 'так', 'межд',
]);

export function stem(word: string): string {
  if (/^[a-z]+$/.test(word)) {
    for (const end of EN_ENDINGS) {
      if (word.length - end.length >= 3 && word.endsWith(end)) {
        let w = word.slice(0, -end.length);
        if (end === 'ies') w += 'y';
        return w;
      }
    }
    return word;
  }
  if (/^[а-я-]+$/.test(word)) {
    for (const end of RU_ENDINGS_SORTED) {
      // keep a stem of at least 3 chars so short roots survive
      if (word.length - end.length >= 3 && word.endsWith(end)) {
        return word.slice(0, -end.length);
      }
    }
    return word;
  }
  return word;
}

const RU_ENDINGS_SORTED = [...RU_ENDINGS].sort((a, b) => b.length - a.length);

function isStopWord(surface: string): boolean {
  return STOP_WORDS.has(surface) || STOP_STEMS.has(stem(surface));
}

function contentStems(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !isStopWord(w))
    .map(stem);
}

/** Two stems match when equal or within a Levenshtein distance of 20% of length (typos). */
function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const tol = Math.floor(Math.max(a.length, b.length) * 0.2);
  if (tol === 0) return false;
  return levenshtein(a, b) <= tol;
}

export interface PrecisionResult {
  percent: number;
  /** Content words from the reference (original surface form) missing in the answer. */
  missedWords: string[];
}

/**
 * precisionScore(answer, reference) — engineering.md "Precision mode".
 * percent = round(100 * (0.6*completeness + 0.4*similarity))
 * completeness: share of reference content-stems found in the answer.
 * similarity: normalized word-sequence similarity over stems (LCS-based).
 * Scale: >=90 good, 70-89 unsure, 50-69 unsure, <50 bad.
 */
export function precisionScore(answer: string, reference: string): PrecisionResult {
  const refWords = normalize(reference)
    .split(' ')
    .filter((w) => w.length > 0);
  const refContentIdx: number[] = [];
  const refStems: string[] = [];
  refWords.forEach((w, i) => {
    if (w.length > 1 && !isStopWord(w)) {
      refContentIdx.push(i);
      refStems.push(stem(w));
    }
  });
  const ansStems = contentStems(answer);

  if (refStems.length === 0) {
    return { percent: ansStems.length > 0 ? 100 : 0, missedWords: [] };
  }

  // completeness: greedy matching of reference content stems against answer stems
  const used = new Array(ansStems.length).fill(false);
  const missed: string[] = [];
  let found = 0;
  refStems.forEach((rs, i) => {
    const j = ansStems.findIndex((as, k) => !used[k] && stemsMatch(rs, as));
    if (j >= 0) {
      used[j] = true;
      found++;
    } else {
      missed.push(refWords[refContentIdx[i]]);
    }
  });
  const completeness = found / refStems.length;

  // similarity: LCS over stem sequences (order-aware), normalized
  const a = ansStems;
  const b = refStems;
  const m = a.length;
  const n = b.length;
  let dp = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const prev = dp;
    dp = new Array<number>(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      dp[j] = stemsMatch(a[i - 1], b[j - 1]) ? prev[j - 1] + 1 : Math.max(prev[j], dp[j - 1]);
    }
  }
  const lcs = dp[n];
  const similarity = m === 0 ? 0 : (2 * lcs) / (m + n);

  const percent = Math.round(100 * (0.6 * completeness + 0.4 * similarity));
  return { percent, missedWords: missed };
}

/** Map a precision percent to an SM-2 grade (engineering.md scale). */
export function precisionGrade(percent: number): 'good' | 'unsure' | 'bad' {
  if (percent >= 90) return 'good';
  if (percent >= 50) return 'unsure';
  return 'bad';
}
