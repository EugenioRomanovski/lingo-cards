// Global app store (Zustand): dataset, loading/error, theme, progress cache.

import { create } from 'zustand';
import { loadDataset, type Dataset } from '@/lib/data';
import { getProgressMap, type TermProgress } from '@/lib/progress';

type ThemeName = 'light' | 'dark';

interface AppState {
  dataset: Dataset | null;
  datasetLoading: boolean;
  datasetError: string | null;
  /** Progress cache, refreshed after sessions / on demand. */
  progress: Map<string, TermProgress>;
  progressLoaded: boolean;
  theme: ThemeName;

  loadData: () => Promise<void>;
  refreshProgress: () => Promise<void>;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
}

const THEME_KEY = 'lingo-cards-theme';

function initialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(t: ThemeName) {
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle('dark', t === 'dark');
}

export const useAppStore = create<AppState>((set, get) => ({
  dataset: null,
  datasetLoading: false,
  datasetError: null,
  progress: new Map(),
  progressLoaded: false,
  theme: initialTheme(),

  loadData: async () => {
    if (get().dataset || get().datasetLoading) return;
    set({ datasetLoading: true, datasetError: null });
    try {
      const dataset = await loadDataset();
      set({ dataset, datasetLoading: false });
      await get().refreshProgress();
    } catch (e) {
      set({ datasetLoading: false, datasetError: e instanceof Error ? e.message : String(e) });
    }
  },

  refreshProgress: async () => {
    const ids = get().dataset?.terms.map((t) => t.id);
    const progress = await getProgressMap(ids);
    set({ progress, progressLoaded: true });
  },

  setTheme: (t) => {
    applyTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
    set({ theme: t });
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));

// Apply persisted theme as early as possible (module import side effect).
if (typeof document !== 'undefined') {
  applyTheme(useAppStore.getState().theme);
}
