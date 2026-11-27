// Rune / aura = emitter partikel glyph. Rune menempel ke socket blade, aura ke tepi silhouette satu layer.
// Tanpa Three.js.
// Partikel hidup di koordinat grid (unit sel) dan digambar di-snap ke sel supaya tetap terasa ASCII.
import type { BladeSocket } from './format';
import { edgeCells, type Grid } from './compose';

export interface RuneDef {
  label: string;
  /** partikel per detik. */
  rate: number;
  /** umur partikel (detik), min..max. */
  life: [number, number];
  /** kecepatan awal (sel/detik). y negatif = naik. */
  vel: [number, number];
  /** acak kecepatan ±. */
  jitter: number;
  /** glyph menurut umur: index 0 = baru lahir. */
  glyphs: string;
  /** warna menurut umur: baru → mati. */
  colors: string[];
  glow: string;
}

export const RUNES = {
  fire: {
    label: 'Api ^',
    rate: 120,
    life: [0.4, 1.0],
    vel: [0, -8],
    jitter: 3,
    glyphs: '^^*:.',
    colors: ['#fff0b0', '#f6c45a', '#d8644c', '#6a2418'],
    glow: '#d8644c',
  },
} satisfies Record<string, RuneDef>;

export type RuneKey = keyof typeof RUNES;

/** Aura per item: partikel lahir di tepi silhouette layer, lebih jarang dan lambat dari rune. */
export const AURAS = {
  ember: { ...RUNES.fire, label: 'Bara', rate: 45, vel: [0, -5], jitter: 2 },
  holy: {
    label: 'Suci',
    rate: 40,
    life: [0.6, 1.4],
    vel: [0, -3],
    jitter: 1.5,
    glyphs: "+*'.",
    colors: ['#fff6d0', '#f6dc8c', '#d4a64a', '#5a3e10'],
    glow: '#f6dc8c',
  },
  frost: {
    label: 'Es',
    rate: 40,
    life: [0.6, 1.4],
    vel: [0, 2],
    jitter: 2,
    glyphs: '*+:.',
    colors: ['#f0fbff', '#a8d8f0', '#5a90b8', '#1e3448'],
    glow: '#a8d8f0',
  },
  shadow: {
    label: 'Bayangan',
    rate: 50,
    life: [0.7, 1.6],
    vel: [0, -4],
    jitter: 3,
    glyphs: '%~:.',
    colors: ['#d8b0f0', '#8a5ab0', '#4a2a68', '#1a0e24'],
    glow: '#8a5ab0',
  },
  venom: {
    label: 'Racun',
    rate: 40,
    life: [0.5, 1.2],
    vel: [0, 4],
    jitter: 1,
    glyphs: '§o:.',
    colors: ['#e0f8b0', '#8fae6a', '#4a6a2a', '#1a2a10'],
    glow: '#8fae6a',
  },
} satisfies Record<string, RuneDef>;

export type AuraKey = keyof typeof AURAS;

/** Titik spawn partikel di koordinat grid (unit sel), atau null = berhenti spawn. */
export type Spawn = (() => [number, number]) | null;

/** Spawn acak di sepanjang socket blade. */
export const alongBlade = (blade: BladeSocket | null): Spawn =>
  blade &&
  (() => {
    const t = Math.random();
    return [blade.base[0] + (blade.tip[0] - blade.base[0]) * t, blade.base[1] + (blade.tip[1] - blade.base[1]) * t];
  });

/** Spawn acak di sel tepi silhouette satu layer. Dihitung ulang saat frame berganti. */
export function alongEdge(grid: Grid, layer: string): Spawn {
  const edge = edgeCells(grid, layer);
  if (!edge.length) return null;
  return () => {
    const i = edge[Math.floor(Math.random() * edge.length)];
    return [(i % grid.cols) + Math.random(), Math.floor(i / grid.cols) + Math.random()];
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const MAX_PARTICLES = 400;

export class RuneEmitter {
  private ps: Particle[] = [];
  private carry = 0;
  private styles: string[];

  constructor(readonly rune: RuneDef) {
    // Warna diskret per umur (8 langkah), supaya fillStyle tidak dibuat ulang tiap partikel.
    const stops = rune.colors.map(parse);
    this.styles = Array.from({ length: 8 }, (_, k) => {
      const x = (k / 7) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(x));
      const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * (x - i)));
      return `rgb(${c.join(',')})`;
    });
  }

  /** dt dalam detik. Tanpa spawn (item dilepas) = berhenti spawn, partikel lama tetap habis. */
  update(dt: number, spawn: Spawn) {
    const r = this.rune;
    for (const p of this.ps) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.ps = this.ps.filter((p) => p.age < p.life);
    if (!spawn) return;
    this.carry += r.rate * dt;
    while (this.carry >= 1 && this.ps.length < MAX_PARTICLES) {
      this.carry--;
      const [x, y] = spawn();
      this.ps.push({
        x,
        y,
        vx: r.vel[0] + (Math.random() * 2 - 1) * r.jitter,
        vy: r.vel[1] + (Math.random() * 2 - 1) * r.jitter,
        age: 0,
        life: r.life[0] + Math.random() * (r.life[1] - r.life[0]),
      });
    }
    this.carry = Math.min(this.carry, 1);
  }

  /** Partikel menimpa sel di bawahnya (latar sel dibersihkan dulu) supaya tetap terbaca di atas blade/badan. */
  draw(ctx: CanvasRenderingContext2D, grid: Grid, cellW: number, cellH: number, background: string) {
    const { cols, rows } = grid;
    if (!this.ps.length) return;
    const r = this.rune;
    ctx.save();
    ctx.shadowColor = r.glow;
    ctx.shadowBlur = 6;
    for (const p of this.ps) {
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const k = p.age / p.life;
      ctx.shadowBlur = 0;
      ctx.fillStyle = background;
      ctx.fillRect(cx * cellW, cy * cellH, cellW, cellH);
      ctx.shadowBlur = 8;
      ctx.fillStyle = this.styles[Math.min(7, Math.floor(k * 8))];
      ctx.fillText(r.glyphs[Math.min(r.glyphs.length - 1, Math.floor(k * r.glyphs.length))], cx * cellW, cy * cellH + cellH / 2);
    }
    ctx.restore();
  }

  clear() {
    this.ps = [];
    this.carry = 0;
  }
}
