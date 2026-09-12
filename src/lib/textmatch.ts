// Fuzzy text matching для режимов ввода и precision (design/training.md §precision).
// Русскоязычная нормализация, простой стемминг, Levenshtein, Jaccard по стемам.

const RU_STOPWORDS = new Set([
  'и', 'в', 'на', 'с', 'по', 'к', 'о', 'об', 'от', 'до', 'из', 'у', 'за', 'для', 'не', 'что',
  'это', 'как', 'или', 'а', 'но', 'же', 'ли', 'то', 'его', 'её', 'их', 'the', 'a', 'an', 'of',
  'to', 'in', 'on', 'is', 'are', 'was', 'were', 'be', 'been', 'which', 'that', 'this', 'it',
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Очень грубый стеммер: отрезает типичные RU/EN-окончания. Достаточно для сравнения форм слова. */
export function stem(word: string): string {
  let w = word;
  const ruEndings = [
    'иями', 'ями', 'ами', 'ией', 'иях', 'иям', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
    'ость', 'есть', 'ание', 'ение', 'ения', 'ением', 'ать', 'ять', 'ить', 'еть', 'уть',
    'ый', 'ий', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ов', 'ев', 'ей', 'ам', 'ям',
    'ах', 'ях', 'ом', 'ем', 'у', 'ю', 'а', 'я', 'ы', 'и', 'е', 'о',
  ];
  for (const e of ruEndings) {
    if (w.length > e.length + 3 && w.endsWith(e)) {
      w = w.slice(0, -e.length);
      break;
    }
  }
  const enEndings = ['tions', 'tion', 'sion', 'ness', 'ment', 'able', 'ible', 'ally', 'ing', 'ies', 'ed', 'es', 's', 'ly'];
  for (const e of enEndings) {
    if (w.length > e.length + 3 && w.endsWith(e)) {
      w = w.slice(0, -e.length);
      if (e === 'ies') w += 'y';
      break;
    }
  }
  return w;
}

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

/** Ключевые слова определения: без стоп-слов, длиной > 2, со стемами. */
export function keyWords(definition: string): { raw: string[]; stems: Set<string> } {
  const raw = normalize(definition)
    .split(' ')
    .filter((w) => w.length > 2 && !RU_STOPWORDS.has(w));
  return { raw, stems: new Set(raw.map(stem)) };
}

export interface PrecisionResult {
  percent: number;
  matched: string[];
  missedWords: string[];
}

/** Процент покрытия ключевых слов эталона ответом (по стемам). */
export function precisionScore(answer: string, reference: string): PrecisionResult {
  const { raw, stems } = keyWords(reference);
  if (raw.length === 0) return { percent: 0, matched: [], missedWords: [] };
  const answerStems = new Set(normalize(answer).split(' ').filter(Boolean).map(stem));
  const matched: string[] = [];
  const missedWords: string[] = [];
  for (const w of raw) {
    if (answerStems.has(stem(w))) matched.push(w);
    else missedWords.push(w);
  }
  const coverage = matched.length / raw.length;
  // небольшой бонус за полноту формулировки (длина ответа ≥ 40% эталона)
  const lenRatio = normalize(answer).split(' ').length / Math.max(1, normalize(reference).split(' ').length);
  const bonus = Math.min(10, Math.max(0, (lenRatio - 0.4) * 10));
  const percent = Math.max(0, Math.min(100, Math.round(coverage * 100 * 0.92 + bonus)));
  void stems;
  return { percent, matched, missedWords };
}

/** Автооценка precision: ≥85 знаю, ≥50 неуверенно, иначе не знаю. */
export function precisionGrade(percent: number): 'good' | 'unsure' | 'bad' {
  if (percent >= 85) return 'good';
  if (percent >= 50) return 'unsure';
  return 'bad';
}

export interface TermCheckResult {
  ok: boolean;
  typo: boolean; // почти точно (1-2 опечатки)
}

/** Проверка введённого термина: точное совпадение или опечатка ≤2 (≤3 для длинных слов). */
export function checkTerm(input: string, term: string): TermCheckResult {
  const a = normalize(input);
  const b = normalize(term);
  if (a === b) return { ok: true, typo: false };
  if (a.length < 3) return { ok: false, typo: false };
  const dist = levenshtein(a, b);
  const allowed = b.length >= 10 ? 3 : 2;
  if (dist <= allowed) return { ok: true, typo: true };
  // совпадение по стему (форма слова)
  if (stem(a) === stem(b) && a.length > 3) return { ok: true, typo: true };
  return { ok: false, typo: false };
}
