// Граф связей (design/graph.md). Route: `/graph` (+ query `?focus=<termId>`).
// Obsidian-style карта знаний: 264 узла, 389 рёбер. Canvas 2D (react-force-graph-2d),
// full-viewport, панели поверх канваса.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import ForceGraph2D from 'react-force-graph-2d';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Filter,
  Info,
  Locate,
  Maximize,
  Minus,
  Plus,
  Search,
  X,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { computeStatus } from '@/lib/progress';
import type { Term, Topic, TopicId } from '@/lib/data';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Типы графа
// ---------------------------------------------------------------------------

interface GNode {
  id: string;
  term: Term;
  degree: number; // степень в полном графе (размер)
  links: string[]; // все соседи
  status: StatusKey;
  cluster: Set<string> | null; // соседи 1-го порядка, если это выбранный узел
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

type LinkKind = 'twin' | 'hier' | 'plain';

interface GLink {
  source: string | GNode;
  target: string | GNode;
  kind: LinkKind;
  id: string;
}

interface HoverState {
  id: string;
  x: number; // координаты viewport (CSS px)
  y: number;
}

type StatusKey = 'new' | 'learning' | 'learned' | 'weak' | 'due';

const STATUS_LABEL: Record<StatusKey, string> = {
  learned: 'Выучен',
  learning: 'В процессе',
  weak: 'Слабый',
  due: 'Повторить',
  new: 'Новый',
};

const TOPIC_FALLBACK: Record<TopicId, string> = {
  grammar: 'Грамматика',
  phonetics: 'Фонетика',
  lexicology: 'Лексикология',
  stylistics: 'Стилистика',
};

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function parseHex(c: string): [number, number, number] {
  let h = c.trim().replace(/^#/, '');
  if (h.length === 3)
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexAlpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, a))})`;
}

function alpha(rgba: string, k: number): string {
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(rgba);
  if (!m) return rgba;
  return `rgba(${m[1]},${m[2]},${m[3]},${Math.min(1, Math.max(0, parseFloat(m[4]) * k))})`;
}

function nodeRadius(degree: number): number {
  return Math.min(11, 4 + degree * 0.6);
}

/** Иерархия «термин → подвид»: «Лексический архаизм» — подвид «Архаизм» (graph.md §1). */
function isHierarchyEdge(a: Term, b: Term): boolean {
  if (a.topic !== b.topic || a.lang !== b.lang) return false;
  const shorter = a.term.length <= b.term.length ? a.term : b.term;
  const longer = a.term.length <= b.term.length ? b.term : a.term;
  const parts = longer.toLowerCase().split(/[\s/()–-]+/).filter(Boolean);
  const short = shorter.toLowerCase().trim();
  return longer.toLowerCase() !== short && parts.some((p) => p === short);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ---------------------------------------------------------------------------
// Кастомные d3-force функции (совместимый интерфейс: (alpha) + initialize)
// ---------------------------------------------------------------------------

type ForceFn3 = ((alpha: number) => void) & { initialize?: (nodes: GNode[]) => void };

/** Лёгкое притяжение к центру (аналог d3 forceX/forceY). */
function centerPullX(strength: number): ForceFn3 {
  let nodes: GNode[] = [];
  const f = ((alpha: number) => {
    for (const n of nodes) n.vx = (n.vx ?? 0) - (n.x ?? 0) * strength * alpha;
  }) as ForceFn3;
  f.initialize = (ns) => {
    nodes = ns;
  };
  return f;
}

function centerPullY(strength: number): ForceFn3 {
  let nodes: GNode[] = [];
  const f = ((alpha: number) => {
    for (const n of nodes) n.vy = (n.vy ?? 0) - (n.y ?? 0) * strength * alpha;
  }) as ForceFn3;
  f.initialize = (ns) => {
    nodes = ns;
  };
  return f;
}

/** Столкновения: радиус узла + padding (аналог d3 forceCollide, O(n²) — 264 узла ок). */
function collideForce(padding: number): ForceFn3 {
  let nodes: GNode[] = [];
  const f = ((alpha: number) => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const ra = nodeRadius(a.degree) + padding;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        let d = Math.hypot(dx, dy);
        const min = ra + nodeRadius(b.degree) + padding;
        if (d >= min) continue;
        if (d < 0.01) d = 0.01;
        const push = ((min - d) / d) * 0.5 * alpha * 0.8;
        a.x = (a.x ?? 0) - dx * push;
        a.y = (a.y ?? 0) - dy * push;
        b.x = (b.x ?? 0) + dx * push;
        b.y = (b.y ?? 0) + dy * push;
      }
    }
  }) as ForceFn3;
  f.initialize = (ns) => {
    nodes = ns;
  };
  return f;
}

// ---------------------------------------------------------------------------
// Токены темы из CSS-переменных (canvas не понимает var())
// ---------------------------------------------------------------------------

interface GColors {
  bg: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  surface: string;
  surface2: string;
  border: string;
  st: Record<StatusKey, string>;
  topics: Record<string, string>;
}

function readColors(datasetTopics: Topic[]): GColors {
  const cs = getComputedStyle(document.documentElement);
  const g = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const topics: Record<string, string> = {};
  for (const t of datasetTopics) topics[t.id] = g(`--topic-${t.id}`, t.color);
  return {
    bg: g('--bg', '#F5F0E6'),
    text: g('--text', '#2A2420'),
    textMuted: g('--text-muted', '#756A5C'),
    textFaint: g('--text-faint', '#A79B8A'),
    accent: g('--accent', '#B0705A'),
    surface: g('--surface', '#FDFBF5'),
    surface2: g('--surface-2', '#EFE8D9'),
    border: g('--border', '#E2D9C6'),
    st: {
      learned: g('--st-learned', '#5E8A58'),
      learning: g('--st-learning', '#C79A3D'),
      weak: g('--st-weak', '#C05B4D'),
      due: g('--st-due', '#4E7FA6'),
      new: g('--st-new', '#A79B8A'),
    },
    topics,
  };
}

// ---------------------------------------------------------------------------
// Состояния фильтров
// ---------------------------------------------------------------------------

interface Filters {
  topics: Record<TopicId, boolean>;
  includeEN: boolean;
  onlyGaps: boolean;
  minDeg: number;
}

const ALL_TOPICS: TopicId[] = ['grammar', 'phonetics', 'lexicology', 'stylistics'];

const defaultFilters = (): Filters => ({
  topics: { grammar: true, phonetics: true, lexicology: true, stylistics: true },
  includeEN: true,
  onlyGaps: false,
  minDeg: 0,
});

// ---------------------------------------------------------------------------
// Страница
// ---------------------------------------------------------------------------

export default function GraphPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dataset = useAppStore((s) => s.dataset);
  const datasetLoading = useAppStore((s) => s.datasetLoading);
  const datasetError = useAppStore((s) => s.datasetError);
  const progress = useAppStore((s) => s.progress);
  const theme = useAppStore((s) => s.theme);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [defExpanded, setDefExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const colorsRef = useRef<GColors | null>(null);
  const hoverRef = useRef<HoverState | null>(null);
  const selectedRef = useRef<string | null>(null);
  const zoomRef = useRef(1);
  const reducedRef = useRef(reduced);
  // Синхронизация состояния в refs для canvas-колбэков (кадровый цикл читает refs)
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const lowFpsRef = useRef(false);
  const warmedRef = useRef(false);
  const pulseRef = useRef<{ id: string; t0: number } | null>(null);
  const breathRef = useRef<{ cluster: Set<string>; t0: number } | null>(null);
  const nodesByIdRef = useRef<Map<string, GNode>>(new Map());

  // ------------------------------------------------------------------
  // Тема: перечитываем CSS-переменные (canvas ререндерится кадровым циклом)
  // ------------------------------------------------------------------
  const [colors, setColors] = useState<GColors | null>(null);
  useEffect(() => {
    if (!dataset) return;
    const apply = () => {
      const c = readColors(dataset.topics);
      colorsRef.current = c;
      setColors(c);
    };
    apply();
    const id = window.setTimeout(apply, 300); // после transition темы
    return () => window.clearTimeout(id);
  }, [dataset, theme]);

  // ------------------------------------------------------------------
  // Размер контейнера (ResizeObserver — граф во весь viewport под TopBar)
  // ------------------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ------------------------------------------------------------------
  // Узлы и рёбра (полный граф; фильтрация — через видимость)
  // ------------------------------------------------------------------
  const allNodes = useMemo<GNode[]>(() => {
    if (!dataset) return [];
    const byId = new Map(dataset.terms.map((t) => [t.id, t]));
    const degree = new Map<string, number>();
    const links = new Map<string, string[]>();
    for (const t of dataset.terms) {
      const seen = new Set<string>();
      const arr: string[] = [];
      for (const l of t.links) {
        if (!byId.has(l) || l === t.id || seen.has(l)) continue;
        seen.add(l);
        arr.push(l);
        degree.set(l, (degree.get(l) ?? 0) + 1);
      }
      links.set(t.id, arr);
      degree.set(t.id, (degree.get(t.id) ?? 0) + arr.length);
    }
    return dataset.terms.map((t) => {
      const p = progress.get(t.id);
      const status: StatusKey = p ? computeStatus(p) : 'new';
      const neighbors = new Set(links.get(t.id) ?? []);
      neighbors.delete(t.id);
      return { id: t.id, term: t, degree: degree.get(t.id) ?? 0, links: links.get(t.id) ?? [], status, cluster: neighbors };
    });
  }, [dataset, progress]);

  const allLinks = useMemo<GLink[]>(() => {
    if (!dataset) return [];
    const byId = new Map(dataset.terms.map((t) => [t.id, t]));
    const map = new Map<string, GLink>();
    for (const t of dataset.terms) {
      for (const l of t.links) {
        const other = byId.get(l);
        if (!other || l === t.id) continue;
        const key = [t.id, l].sort().join('|');
        if (map.has(key)) continue;
        const twin = t.twinIds.includes(l) || other.twinIds.includes(t.id);
        const kind: LinkKind = twin ? 'twin' : isHierarchyEdge(t, other) ? 'hier' : 'plain';
        map.set(key, { source: t.id, target: l, kind, id: key });
      }
    }
    return [...map.values()];
  }, [dataset]);

  // Минимальный остов по темам (грамматика → фонетика → лексикология → стилистика),
  // чтобы компоненты графа не разлетались на острова.
  const bridgeLinks = useMemo<GLink[]>(() => {
    if (!dataset || allNodes.length === 0) return [];
    const rep: Record<TopicId, GNode | null> = { grammar: null, phonetics: null, lexicology: null, stylistics: null };
    for (const n of allNodes) {
      const cur = rep[n.term.topic];
      if (!cur || n.degree > cur.degree) rep[n.term.topic] = n;
    }
    const chain = ALL_TOPICS.map((t) => rep[t]).filter(Boolean) as GNode[];
    const out: GLink[] = [];
    for (let i = 0; i + 1 < chain.length; i++) {
      out.push({ source: chain[i].id, target: chain[i + 1].id, kind: 'plain', id: `bridge-${i}` });
    }
    return out;
  }, [dataset, allNodes]);

  const dataLinks = useMemo(() => [...allLinks, ...bridgeLinks], [allLinks, bridgeLinks]);

  const graphData = useMemo(() => ({ nodes: allNodes, links: dataLinks }), [allNodes, dataLinks]);

  const nodesById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);
  // Выбранный узел — из query ?focus= (deep-link из библиотеки)
  const focusParam = searchParams.get('focus');
  const selectedId = focusParam && nodesById.has(focusParam) ? focusParam : null;
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    nodesByIdRef.current = nodesById;
  }, [nodesById]);

  // Степень внутри видимого (отфильтрованного) графа — для подписей и слайдера
  const fdegMap = useMemo(() => {
    const visible = new Set(
      allNodes
        .filter(
          (n) =>
            filters.topics[n.term.topic] && (filters.includeEN || n.term.lang !== 'en'),
        )
        .map((n) => n.id),
    );
    const cnt = new Map<string, number>();
    for (const l of allLinks) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (visible.has(s) && visible.has(t)) {
        cnt.set(s, (cnt.get(s) ?? 0) + 1);
        cnt.set(t, (cnt.get(t) ?? 0) + 1);
      }
    }
    for (const n of allNodes) if (!visible.has(n.id)) cnt.set(n.id, 0);
    return cnt;
  }, [allNodes, allLinks, filters.topics, filters.includeEN]);

  const fdegRef = useRef<Map<string, number>>(fdegMap);
  useEffect(() => {
    fdegRef.current = fdegMap;
  }, [fdegMap]);

  // ------------------------------------------------------------------
  // Видимость узлов / рёбер (визуальная фильтрация)
  // ------------------------------------------------------------------
  const nodeVis = useCallback(
    (n: GNode): number => {
      const t = n.term;
      if (!filters.topics[t.topic]) return 0.06;
      if (!filters.includeEN && t.lang === 'en') return 0.06;
      if (filters.minDeg > 0 && (fdegRef.current.get(n.id) ?? 0) < filters.minDeg) return 0.06;
      if (filters.onlyGaps && n.status !== 'weak' && n.status !== 'due') return 0.08;
      const sel = selectedId;
      if (sel) {
        const sn = nodesByIdRef.current.get(sel);
        if (sn && n.id !== sel && !sn.cluster?.has(n.id)) return 0.08;
      }
      return 1;
    },
    [filters, selectedId],
  );

  const linkVis = useCallback(
    (l: GLink): number => {
      if (l.id.startsWith('bridge-')) return 0;
      const a = typeof l.source === 'string' ? nodesByIdRef.current.get(l.source) : l.source;
      const b = typeof l.target === 'string' ? nodesByIdRef.current.get(l.target) : l.target;
      if (!a || !b) return 0;
      return Math.min(nodeVis(a), nodeVis(b));
    },
    [nodeVis],
  );

  // Число узлов, проходящих фильтры (для пустого состояния; не учитывает затемнение выбора)
  const visibleCount = useMemo(() => {
    let c = 0;
    for (const n of allNodes) {
      if (!filters.topics[n.term.topic]) continue;
      if (!filters.includeEN && n.term.lang !== 'ru') continue;
      if (filters.minDeg > 0 && (fdegMap.get(n.id) ?? 0) < filters.minDeg) continue;
      c++;
    }
    return c;
  }, [allNodes, filters, fdegMap]);

  // ------------------------------------------------------------------
  // Физика (graph.md §1): charge −30, link distance 42, center + collide
  // ------------------------------------------------------------------
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || allNodes.length === 0 || ready) return;
    const charge = fg.d3Force('charge');
    if (charge?.strength) {
      charge.strength(-30);
      if (charge.distanceMax) charge.distanceMax(650);
    }
    const link = fg.d3Force('link') as { distance?: (d: number) => void } | undefined;
    if (link?.distance) link.distance(42);
    fg.d3Force('collide', collideForce(3));
    fg.d3Force('fx', centerPullX(0.03));
    fg.d3Force('fy', centerPullY(0.03));
  }, [allNodes, ready]);

  // ------------------------------------------------------------------
  // Монитор fps < 30 (2s) → упрощение анимаций (graph.md §4)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!ready || reduced) return;
    let raf = 0;
    let last = performance.now();
    let badSince: number | null = null;
    let done = false;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!done && dt > 0) {
        if (1000 / dt < 30) {
          if (badSince === null) badSince = now;
          else if (now - badSince > 2000) {
            done = true;
            lowFpsRef.current = true;
            breathRef.current = null;
            setToast('Упрощена анимация графа для плавности');
            window.setTimeout(() => setToast(null), 3500);
          }
        } else {
          badSince = null;
        }
      }
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, reduced]);

  // ------------------------------------------------------------------
  // Камера
  // ------------------------------------------------------------------
  const flyToNode = useCallback(
    (id: string, targetZoom: number, ms: number) => {
      const n = nodesByIdRef.current.get(id);
      const fg = fgRef.current;
      if (!n || !fg || n.x == null || n.y == null) return;
      const dur = reduced ? 0 : ms;
      fg.centerAt(n.x, n.y, dur);
      fg.zoom(targetZoom, dur);
    },
    [reduced],
  );

  const focusNode = useCallback(
    (id: string, opts?: { zoom?: number; ms?: number }) => {
      setDefExpanded(false);
      setHover(null);
      pulseRef.current = { id, t0: performance.now() };
      const n = nodesByIdRef.current.get(id);
      breathRef.current = n?.cluster ? { cluster: n.cluster, t0: performance.now() } : null;
      flyToNode(id, opts?.zoom ?? 1.4, opts?.ms ?? 800);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('focus', id);
          return p;
        },
        { replace: true },
      );
    },
    [flyToNode, setSearchParams],
  );

  const clearSelection = useCallback(() => {
    breathRef.current = null;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('focus');
        return p;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // Deep-link ?focus= — перелёт от общего вида после стабилизации (1400ms)
  const focusHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !selectedId || focusHandledRef.current === selectedId) return;
    focusHandledRef.current = selectedId;
    pulseRef.current = { id: selectedId, t0: performance.now() };
    const n = nodesByIdRef.current.get(selectedId);
    breathRef.current = n?.cluster ? { cluster: n.cluster, t0: performance.now() } : null;
    flyToNode(selectedId, 1.4, 1400);
  }, [ready, selectedId, flyToNode]);

  // Кластер для «Тренировать кластер (N)»: узел + видимые соседи 1-го порядка
  const clusterIds = useMemo(() => {
    if (!selectedId || !dataset) return [] as string[];
    const n = nodesById.get(selectedId);
    if (!n) return [] as string[];
    const ids = new Set<string>([selectedId]);
    for (const nid of n.cluster ?? []) {
      const nb = nodesById.get(nid);
      if (!nb) continue;
      if (filters.topics[nb.term.topic] && (filters.includeEN || nb.term.lang !== 'en')) ids.add(nid);
    }
    return [...ids];
  }, [selectedId, dataset, nodesById, filters.topics, filters.includeEN]);

  // Передача конкретных id сессии тренировки (fallback у /train/session — topics query)
  useEffect(() => {
    if (clusterIds.length === 0) return;
    try {
      sessionStorage.setItem('lc:train-cluster', JSON.stringify(clusterIds));
    } catch {
      /* sessionStorage может быть недоступен */
    }
  }, [clusterIds]);

  // ------------------------------------------------------------------
  // Канвас: узлы
  // ------------------------------------------------------------------
  const paintNode = useCallback((n: GNode, ctx: CanvasRenderingContext2D) => {
    const c = colorsRef.current;
    if (!c || n.x == null || n.y == null) return;
    const vis = nodeVis(n);
    if (vis <= 0) return;
    const now = performance.now();
    const hoverId = hoverRef.current?.id ?? null;
    const selId = selectedRef.current;
    const k = zoomRef.current;
    const t = n.term;
    const topicColor = c.topics[t.topic] ?? c.accent;
    const rBase = nodeRadius(n.degree);
    const inCluster = !!selId && (n.id === selId || !!nodesByIdRef.current.get(selId)?.cluster?.has(n.id));

    // «Дыхание» выбранного кластера: scale 1→1.03, 4s (отключается при low fps / reduced motion)
    let scale = 1;
    const breath = breathRef.current;
    if (breath && !lowFpsRef.current && !reducedRef.current && inCluster) {
      scale = 1 + 0.015 * (1 + Math.sin(((now - breath.t0) / 4000) * Math.PI * 2));
    }
    const r = (rBase * scale) / Math.sqrt(Math.max(k, 0.4));
    const isEN = t.lang === 'en';
    const fill = n.status === 'new' ? hexAlpha(topicColor, 0.45) : hexAlpha(topicColor, 1);

    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.globalAlpha = vis;

    // Пульс-кольца после выбора (2 расширяющихся круга, 900ms)
    const pulse = pulseRef.current;
    if (pulse && pulse.id === n.id) {
      const pr = (now - pulse.t0) / 900;
      if (pr < 1) {
        for (const off of [0, 0.5]) {
          const q = pr + off;
          if (q > 0 && q < 1) {
            ctx.beginPath();
            ctx.arc(0, 0, r + 2 + q * 14, 0, Math.PI * 2);
            ctx.strokeStyle = hexAlpha(topicColor, (1 - q) * 0.8);
            ctx.lineWidth = 1.5 / k;
            ctx.stroke();
          }
        }
      } else {
        pulseRef.current = null;
      }
    }

    // Обводка статуса: ring 2px с отступом 1.5px
    if (n.status !== 'new') {
      const stColor = c.st[n.status];
      const lineW = 2 / k;
      if (n.status === 'due') {
        ctx.setLineDash([3.2, 3.2]);
        // Вращение пунктира (6s loop) — только при zoom > 0.8 и не на слабом девайсе
        if (k > 0.8 && !lowFpsRef.current && !reducedRef.current) {
          ctx.lineDashOffset = -((now / 6000) * Math.PI * 2 * 3.2 * 2) % 12.8;
        }
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(0, 0, r + 1.5 + lineW / 2, 0, Math.PI * 2);
      ctx.strokeStyle = stColor;
      ctx.lineWidth = lineW;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Заливка: круг (RU) / ромб (EN)
    ctx.beginPath();
    if (isEN) {
      const rr = r * 1.15;
      ctx.moveTo(0, -rr);
      ctx.lineTo(rr, 0);
      ctx.lineTo(0, rr);
      ctx.lineTo(-rr, 0);
      ctx.closePath();
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = fill;
    ctx.fill();

    // Тонкая обводка при hover/выборе
    if (n.id === hoverId || n.id === selId) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1.6 / k;
      ctx.stroke();
    }

    // Подписи по плотности (graph.md §1)
    const labelAlways = n.id === hoverId || inCluster;
    const fdeg = fdegRef.current.get(n.id) ?? n.degree;
    const labelByDensity = k < 0.5 ? fdeg >= 6 : k <= 1.2 ? fdeg >= 3 : true;
    if (labelAlways || labelByDensity) {
      const fs = clamp(10.5 / Math.sqrt(k), 7, 13);
      ctx.font = `500 ${fs}px Manrope, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const ly = r + 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c.bg;
      ctx.lineWidth = 2 / k;
      ctx.strokeText(t.term, 0, ly);
      ctx.fillStyle = c.text;
      ctx.fillText(t.term, 0, ly);
    }
    ctx.restore();
  }, [nodeVis]);

  const paintPointerArea = useCallback((n: GNode, color: string, ctx: CanvasRenderingContext2D) => {
    if (n.x == null || n.y == null) return;
    const vis = nodeVis(n);
    if (vis < 0.5) return; // погашенные узлы не ловят указатель
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, Math.max(nodeRadius(n.degree) + 4, 6), 0, Math.PI * 2);
    ctx.fill();
  }, [nodeVis]);

  // ------------------------------------------------------------------
  // Канвас: рёбра
  // ------------------------------------------------------------------
  const paintLink = useCallback((l: GLink, ctx: CanvasRenderingContext2D) => {
    const c = colorsRef.current;
    if (!c) return;
    const a = typeof l.source === 'string' ? nodesByIdRef.current.get(l.source) : l.source;
    const b = typeof l.target === 'string' ? nodesByIdRef.current.get(l.target) : l.target;
    if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) return;
    const vis = linkVis(l);
    if (vis <= 0.005) return;

    const hoverId = hoverRef.current?.id ?? null;
    const selId = selectedRef.current;
    const focusId = hoverId ?? (selId && (a.id === selId || b.id === selId) ? selId : null);
    const connected = focusId ? a.id === focusId || b.id === focusId : false;
    const k = zoomRef.current;

    let stroke: string;
    let width: number;
    let dash: number[] | null = null;
    if (connected) {
      const fc = c.topics[(a.id === focusId ? a : b).term.topic] ?? c.accent;
      stroke = alpha(hexAlpha(fc, 0.9), vis);
      width = 1.5 / k;
    } else if (l.kind === 'twin') {
      stroke = alpha(hexAlpha(c.accent, 0.5), vis);
      width = 1 / k;
      dash = [4, 4];
    } else {
      stroke = alpha(hexAlpha(c.textFaint, 0.28), vis);
      width = 1 / k;
    }
    if (hoverId && !connected) stroke = alpha(hexAlpha(c.textFaint, 0.06), vis);

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Стрелка-маркер 3px у иерархических рёбер (к более длинному названию = подвиду)
    if (l.kind === 'hier') {
      const longer = a.term.term.length >= b.term.term.length ? a : b;
      const from = longer === a ? b : a;
      const to = longer;
      const dx = to.x! - from.x!;
      const dy = to.y! - from.y!;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const tR = nodeRadius(to.degree) + 3;
      const tipX = to.x! - ux * tR;
      const tipY = to.y! - uy * tR;
      const s = 3 / k;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - ux * s * 2 - uy * s, tipY - uy * s * 2 + ux * s);
      ctx.lineTo(tipX - ux * s * 2 + uy * s, tipY - uy * s * 2 - ux * s);
      ctx.closePath();
      ctx.fillStyle = stroke;
      ctx.fill();
    }
    ctx.restore();
  }, [linkVis]);

  // ------------------------------------------------------------------
  // События канваса
  // ------------------------------------------------------------------
  const onNodeHover = useCallback((n: GNode | null) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (!n || n.x == null || n.y == null) {
      setHover(null);
      wrap.style.cursor = '';
      return;
    }
    const pt = fgRef.current?.graph2ScreenCoords(n.x, n.y);
    if (!pt) {
      setHover(null);
      return;
    }
    wrap.style.cursor = 'pointer';
    setHover({ id: n.id, x: pt.x, y: pt.y });
  }, []);

  const onNodeClick = useCallback(
    (n: GNode) => {
      focusNode(n.id, { zoom: 1.4, ms: 800 });
    },
    [focusNode],
  );

  const onBackgroundClick = useCallback(() => {
    clearSelection();
    setFiltersOpen(false);
    setSearchOpen(false);
  }, [clearSelection]);

  // ------------------------------------------------------------------
  // Зум-контролы
  // ------------------------------------------------------------------
  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    const next = clamp(zoomRef.current * factor, 0.25, 4);
    fg.zoom(next, reduced ? 0 : 300);
  }, [reduced]);

  const zoomFit = useCallback(() => {
    fgRef.current?.zoomToFit(reduced ? 0 : 900, 56);
  }, [reduced]);

  const locateSelected = useCallback(() => {
    if (selectedId) flyToNode(selectedId, 1.4, 700);
  }, [selectedId, flyToNode]);

  // ------------------------------------------------------------------
  // Поиск (автодополнение, до 6 терминов)
  // ------------------------------------------------------------------
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !dataset) return [];
    return dataset.terms
      .filter((t) => t.term.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, dataset]);

  const pickSuggestion = useCallback(
    (id: string) => {
      setQuery('');
      setSearchOpen(false);
      focusNode(id, { zoom: 1.6, ms: 1200 });
    },
    [focusNode],
  );

  // ------------------------------------------------------------------
  // Панель выбранного термина
  // ------------------------------------------------------------------
  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null;
  const topicById = useMemo(() => {
    const m = new Map<string, Topic>();
    for (const t of dataset?.topics ?? []) m.set(t.id, t);
    return m;
  }, [dataset]);

  const statusColor = (s: StatusKey) => colors?.st[s] ?? 'var(--st-new)';

  const renderTopicChip = (topicId: TopicId) => {
    const tp = topicById.get(topicId);
    const color = colors?.topics[topicId] ?? tp?.color ?? '#999';
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-[0.09em] uppercase"
        style={{ borderColor: color, backgroundColor: hexAlpha(color, 0.14), color }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {tp?.title ?? TOPIC_FALLBACK[topicId]}
      </span>
    );
  };

  const renderStatusBadge = (s: StatusKey) => {
    const color = statusColor(s);
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold"
        style={{
          borderColor: color,
          backgroundColor: hexAlpha(color.startsWith('#') ? color : '#999999', 0.14),
          color,
          borderStyle: s === 'due' ? 'dashed' : 'solid',
        }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {STATUS_LABEL[s]}
      </span>
    );
  };

  const linkTypeLabel = (center: Term, other: Term): string => {
    if (center.twinIds.includes(other.id) || other.twinIds.includes(center.id)) return 'EN-близнец';
    if (isHierarchyEdge(center, other)) return 'подвид';
    return 'упоминается в определении';
  };

  // ------------------------------------------------------------------
  // Рендер
  // ------------------------------------------------------------------
  const hoverNode = hover ? (nodesById.get(hover.id) ?? null) : null;

  const panelAnim = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 12 } };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 3.5rem)' }}>
      <div ref={wrapRef} className="relative min-h-0 w-full flex-1 touch-none overflow-hidden bg-bg">
        {/* Канвас графа */}
        {dataset && (
          <ForceGraph2D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={graphData}
            backgroundColor={colors?.bg ?? 'rgba(0,0,0,0)'}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={paintPointerArea}
            linkCanvasObject={paintLink}
            linkCanvasObjectMode={() => 'replace'}
            warmupTicks={80}
            cooldownTime={2500}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.35}
            minZoom={0.25}
            maxZoom={4}
            enableNodeDrag
            onNodeHover={onNodeHover}
            onNodeClick={onNodeClick}
            onBackgroundClick={onBackgroundClick}
            onZoom={({ k }: { k: number }) => setZoom(k)}
            onEngineStop={() => {
              if (!warmedRef.current) {
                warmedRef.current = true;
                setReady(true);
                window.setTimeout(() => fgRef.current?.zoomToFit(reduced ? 0 : 900, 56), reduced ? 0 : 250);
              }
            }}
          />
        )}

        {/* Загрузка / ошибка */}
        {(!dataset || !ready) && !datasetError && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg/60 backdrop-blur-[2px]">
            <div className="flex items-end gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="block h-2 w-2 animate-pulse rounded-full bg-terra"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
            <p className="text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
              {datasetLoading || !dataset ? 'Загружаем словарь…' : `Строим карту из ${allLinks.length} связей…`}
            </p>
          </div>
        )}
        {datasetError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg">
            <p className="font-display text-[22px] font-semibold">Не удалось загрузить граф</p>
            <p className="text-sm text-ink-muted">{datasetError}</p>
            <button
              type="button"
              onClick={() => useAppStore.getState().loadData()}
              className="rounded-xl bg-terra px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terra-hover"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Пустое состояние: фильтры скрыли всё */}
        {dataset && ready && visibleCount === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg/70 backdrop-blur-[3px]">
            <img src={`${import.meta.env.BASE_URL}empty-graph.svg`} alt="" className="h-[140px] w-auto" />
            <p className="font-sans text-[17px] font-bold">Ни один узел не проходит фильтры</p>
            <button
              type="button"
              onClick={() => setFilters(defaultFilters())}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-terra transition-colors hover:bg-terra-soft"
            >
              Сбросить фильтры
            </button>
          </div>
        )}

        {/* Поиск (top-left) */}
        <div className="absolute top-3 left-3 z-20">
          {/* Мобильный: иконка-кнопка */}
          <button
            type="button"
            aria-label="Поиск термина"
            onClick={() => setSearchOpen(true)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface/90 text-ink-muted shadow-md backdrop-blur-[12px] transition-colors hover:text-ink sm:hidden',
              searchOpen && 'hidden',
            )}
          >
            <Search className="h-5 w-5" />
          </button>
          <div className={cn('relative', searchOpen ? 'block' : 'hidden sm:block')}>
            <div className="flex w-[min(260px,calc(100vw-32px))] items-center gap-2 rounded-xl border border-border bg-surface-2/95 px-3 py-2.5 shadow-md backdrop-blur-[12px] focus-within:border-border-strong">
              <Search className="h-4 w-4 shrink-0 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder="Найти термин…"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-ink-faint"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Очистить"
                  onClick={() => setQuery('')}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-faint hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <AnimatePresence>
              {query.trim() && (
                <motion.ul
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-full right-0 left-0 mt-2 overflow-hidden rounded-xl border border-border bg-surface/95 shadow-md backdrop-blur-[12px]"
                >
                  {suggestions.length === 0 && (
                    <li className="px-3 py-2.5 text-sm text-ink-faint">Ничего не найдено</li>
                  )}
                  {suggestions.map((t, i) => {
                    const p = progress.get(t.id);
                    const st: StatusKey = p ? computeStatus(p) : 'new';
                    return (
                      <motion.li
                        key={t.id}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.2 }}
                      >
                        <button
                          type="button"
                          onClick={() => pickSuggestion(t.id)}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: `var(--st-${st})` }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.term}</span>
                          <span className="shrink-0 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">
                            {topicById.get(t.topic)?.title ?? TOPIC_FALLBACK[t.topic]}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Фильтры (top-right) */}
        <div className="absolute top-3 right-3 z-20">
          <button
            type="button"
            aria-label="Фильтры графа"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-2xl border shadow-md backdrop-blur-[12px] transition-colors',
              filtersOpen
                ? 'border-terra bg-terra-soft text-terra-ink'
                : 'border-border bg-surface/90 text-ink-muted hover:text-ink',
            )}
          >
            <Filter className="h-5 w-5" />
          </button>
          <AnimatePresence>
            {filtersOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                style={{ transformOrigin: 'top right' }}
                className="absolute top-full right-0 mt-2 w-[280px] rounded-2xl border border-border bg-surface/95 p-4 shadow-md backdrop-blur-[12px]"
              >
                <p className="mb-2 text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">Темы</p>
                <div className="flex flex-col gap-1.5">
                  {(dataset?.topics ?? []).map((tp) => {
                    const checked = filters.topics[tp.id];
                    const count = dataset?.terms.filter((t) => t.topic === tp.id).length ?? 0;
                    const color = colors?.topics[tp.id] ?? tp.color;
                    return (
                      <button
                        key={tp.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            topics: { ...f.topics, [tp.id]: !f.topics[tp.id] },
                          }))
                        }
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span
                          className={cn(
                            'flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors',
                            checked ? 'border-transparent' : 'border-border-strong',
                          )}
                          style={checked ? { backgroundColor: color } : undefined}
                        >
                          {checked && (
                            <svg viewBox="0 0 10 10" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 5.2 4.2 7.4 8 2.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tp.title}</span>
                        <span className="tnum font-mono text-[12px] text-ink-faint">{count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
                  {(
                    [
                      ['includeEN', 'Показывать EN-узлы'],
                      ['onlyGaps', 'Только слабые и к повторению'],
                    ] as const
                  ).map(([key, label]) => {
                    const on = filters[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
                        className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-left"
                      >
                        <span className="text-sm font-medium">{label}</span>
                        <span
                          className={cn(
                            'relative h-[26px] w-11 shrink-0 rounded-full transition-colors',
                            on ? 'bg-terra' : 'bg-surface-3',
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                              on ? 'translate-x-[22px]' : 'translate-x-[3px]',
                            )}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium">Минимум связей</span>
                    <span className="tnum font-mono text-[13px] font-semibold text-terra-ink">{filters.minDeg}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={1}
                    value={filters.minDeg}
                    onChange={(e) => setFilters((f) => ({ ...f, minDeg: Number(e.target.value) }))}
                    className="w-full accent-[#B0705A]"
                    aria-label="Минимум связей"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setFilters(defaultFilters())}
                  className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  Сбросить фильтры
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Хедз-ап капсула (top-center) */}
        <div className="pointer-events-none absolute top-3 left-1/2 z-20 hidden -translate-x-1/2 sm:block">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 shadow-md backdrop-blur-[12px]">
            <span className="tnum font-mono text-[12px] font-medium tracking-[0.02em] text-ink-muted">
              {selectedNode
                ? `${selectedNode.term.term} · ${selectedNode.cluster?.size ?? 0} ${pluralNeighbors(selectedNode.cluster?.size ?? 0)}`
                : `${allNodes.length} узла · ${allLinks.length} связей`}
            </span>
            {selectedNode && (
              <button
                type="button"
                aria-label="Сбросить выбор"
                onClick={clearSelection}
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Легенда (bottom-left) */}
        <div className="absolute bottom-3 left-3 z-20">
          <button
            type="button"
            aria-label="Легенда графа"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((v) => !v)}
            className={cn(
              'flex items-center justify-center rounded-2xl border shadow-md backdrop-blur-[12px] transition-colors lg:hidden',
              legendOpen
                ? 'h-auto border-terra bg-terra-soft px-3 py-2.5 text-terra-ink'
                : 'h-11 w-11 border-border bg-surface/90 text-ink-muted hover:text-ink',
            )}
          >
            <Info className="h-5 w-5" />
          </button>
          <div className={cn(legendOpen ? 'block' : 'hidden lg:block')}>
            <div className="mt-2 w-[220px] rounded-2xl border border-border bg-surface/95 p-3.5 shadow-md backdrop-blur-[12px] lg:mt-0">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">Легенда</p>
                <button
                  type="button"
                  aria-label="Свернуть легенду"
                  onClick={() => setLegendOpen(false)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2 hover:text-ink lg:hidden"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mb-1 text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">Статусы</p>
              <ul className="mb-2.5 flex flex-col gap-1">
                {(['learned', 'learning', 'weak', 'due', 'new'] as StatusKey[]).map((s) => (
                  <li key={s} className="flex items-center gap-2 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                    <span
                      className="h-2.5 w-2.5 rounded-full border"
                      style={{
                        backgroundColor: s === 'new' ? 'var(--surface-3)' : `var(--st-${s})`,
                        borderColor: `var(--st-${s})`,
                        borderStyle: s === 'due' ? 'dashed' : 'solid',
                      }}
                    />
                    {STATUS_LABEL[s]}
                  </li>
                ))}
              </ul>
              <p className="mb-1 text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">Темы</p>
              <ul className="mb-2.5 flex flex-col gap-1">
                {(dataset?.topics ?? []).map((tp) => (
                  <li key={tp.id} className="flex items-center gap-2 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: colors?.topics[tp.id] ?? tp.color }}
                    />
                    {tp.title}
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-2 border-t border-border pt-2 text-[12.5px] font-medium tracking-[0.02em] text-ink-muted">
                <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
                  <path d="M6 1 11 6 6 11 1 6Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                ромб = английский термин
              </p>
            </div>
          </div>
        </div>

        {/* Зум-контролы (bottom-right) */}
        <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-2">
          <button
            type="button"
            aria-label="Приблизить"
            title="Приблизить"
            onClick={() => zoomBy(1.4)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/90 text-ink-muted shadow-md backdrop-blur-[12px] transition-all duration-200 hover:scale-[1.08] hover:text-ink"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="Отдалить"
            title="Отдалить"
            onClick={() => zoomBy(1 / 1.4)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/90 text-ink-muted shadow-md backdrop-blur-[12px] transition-all duration-200 hover:scale-[1.08] hover:text-ink"
          >
            <Minus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="Показать весь граф"
            title="Показать весь граф"
            onClick={zoomFit}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/90 text-ink-muted shadow-md backdrop-blur-[12px] transition-all duration-200 hover:scale-[1.08] hover:text-ink"
          >
            <Maximize className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="К выбранному узлу"
            title="К выбранному узлу"
            disabled={!selectedId}
            onClick={locateSelected}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/90 text-ink-muted shadow-md backdrop-blur-[12px] transition-all duration-200 hover:scale-[1.08] hover:text-ink disabled:opacity-45 disabled:hover:scale-100"
          >
            <Locate className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Tooltip при hover */}
        {hoverNode && hover && (
          <div
            className="pointer-events-none absolute z-30 w-[260px] rounded-xl border border-border bg-surface/95 p-3 shadow-md backdrop-blur-[12px]"
            style={{
              left: clamp(hover.x + 14, 8, size.w - 268),
              top: clamp(hover.y + 14, 8, size.h - 150),
            }}
          >
            <p className="font-display text-[15px] font-semibold">{hoverNode.term.term}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {renderTopicChip(hoverNode.term.topic)}
              {renderStatusBadge(hoverNode.status)}
            </div>
            <p
              className="mt-2 overflow-hidden text-sm text-ink-muted"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
            >
              {hoverNode.term.definition}
            </p>
            <p className="tnum mt-1.5 font-mono text-[12px] text-ink-faint">
              {hoverNode.degree} {pluralNeighbors(hoverNode.degree, true)}
            </p>
          </div>
        )}

        {/* Панель выбранного термина: мобильный bottom-sheet / десктоп drawer */}
        <AnimatePresence>
          {selectedNode && (
            <motion.aside
              key={selectedNode.id}
              {...panelAnim}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className={cn(
                'absolute z-30 flex flex-col overflow-hidden border-border bg-surface/95 shadow-lg backdrop-blur-[12px]',
                'inset-x-3 bottom-3 max-h-[55%] rounded-2xl border',
                'lg:inset-x-auto lg:top-3 lg:right-3 lg:bottom-3 lg:max-h-none lg:w-[360px]',
              )}
            >
              <div className="flex items-start justify-between gap-3 p-4 pb-3">
                <div className="min-w-0">
                  <h2 className="font-display text-[20px] leading-tight font-semibold">{selectedNode.term.term}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {renderTopicChip(selectedNode.term.topic)}
                    {selectedNode.term.lang === 'en' && (
                      <span className="rounded-lg bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-muted">
                        EN
                      </span>
                    )}
                    {renderStatusBadge(selectedNode.status)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Сбросить выбор"
                  onClick={clearSelection}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <p
                  className={cn('font-display text-[15px] leading-[26px]', !defExpanded && 'line-clamp-4')}
                  style={{ fontWeight: 450 }}
                >
                  {selectedNode.term.definition}
                </p>
                <button
                  type="button"
                  onClick={() => setDefExpanded((v) => !v)}
                  className="mt-1 text-sm font-semibold text-terra transition-colors hover:text-terra-hover"
                >
                  {defExpanded ? 'Свернуть' : 'Развернуть'}
                </button>

                {(selectedNode.cluster?.size ?? 0) > 0 && (
                  <>
                    <p className="mt-4 mb-1.5 text-[11px] font-bold tracking-[0.09em] text-ink-faint uppercase">
                      Связанные термины
                    </p>
                    <ul className="flex flex-col">
                      {[...(selectedNode.cluster ?? [])]
                        .map((id) => nodesById.get(id))
                        .filter((n): n is GNode => !!n)
                        .sort((a, b) => b.degree - a.degree)
                        .slice(0, 30)
                        .map((nb) => (
                          <li key={nb.id}>
                            <button
                              type="button"
                              onClick={() => focusNode(nb.id, { zoom: 1.4, ms: 700 })}
                              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: `var(--st-${nb.status})` }}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nb.term.term}</span>
                              <span className="shrink-0 text-[12px] font-medium text-ink-faint">
                                {linkTypeLabel(selectedNode.term, nb.term)}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-border p-4 pt-3">
                <Link
                  to={`/train/session?pool=force&count=all&topics=${selectedNode.term.topic}`}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-terra text-sm font-semibold text-white transition-all duration-200 hover:bg-terra-hover active:scale-[0.97]"
                >
                  <Zap className="h-[18px] w-[18px]" />
                  Тренировать кластер ({clusterIds.length})
                </Link>
                <div className="flex gap-2">
                  <Link
                    to={`/library/${selectedNode.id}`}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm font-semibold transition-colors hover:bg-surface-3"
                  >
                    <BookOpen className="h-4 w-4" />
                    Открыть карточку
                  </Link>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold text-terra transition-colors hover:bg-terra-soft"
                  >
                    Сбросить выбор
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Тихий toast об упрощении анимации */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
              className="absolute bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium shadow-md lg:bottom-6"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function pluralNeighbors(n: number, connections = false): string {
  const forms = connections ? ['связь', 'связи', 'связей'] : ['сосед', 'соседа', 'соседей'];
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
