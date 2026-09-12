// Dataset types and loader (see design/engineering.md).
// terms.json is fetched once and cached at module level + in the Zustand store.

export type TopicId = 'grammar' | 'phonetics' | 'lexicology' | 'stylistics';

export interface Topic {
  id: TopicId;
  title: string;
  color: string;
}

export interface Term {
  id: string; // "gr-001", "st-014-en"
  term: string;
  definition: string;
  etymology: string; // may be ""
  topic: TopicId;
  subtopic: string;
  lang: 'ru' | 'en';
  twinIds: string[]; // RU<->EN twins (stylistics)
  links: string[]; // linked term ids (graph)
}

export interface Dataset {
  version: string;
  topics: Topic[];
  terms: Term[];
}

let cache: Promise<Dataset> | null = null;

/** Fetch and cache the terms dataset. Safe to call repeatedly. */
export function loadDataset(): Promise<Dataset> {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}data/terms.json`).then((res) => {
      if (!res.ok) throw new Error(`Не удалось загрузить словарь терминов (HTTP ${res.status})`);
      return res.json() as Promise<Dataset>;
    });
    // Allow retry after a failure
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

/** O(1) lookup helpers, built from a dataset. */
export function indexTerms(dataset: Dataset): Map<string, Term> {
  return new Map(dataset.terms.map((t) => [t.id, t]));
}

export function topicById(dataset: Dataset, id: TopicId): Topic | undefined {
  return dataset.topics.find((t) => t.id === id);
}
