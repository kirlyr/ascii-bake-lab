// Rune / aura = emitter partikel glyph. Rune menempel ke socket blade, aura ke tepi silhouette satu layer.
// Tanpa Three.js.
// Partikel hidup di koordinat grid (unit sel) dan digambar di-snap ke sel supaya tetap terasa ASCII.
import type { BakeFile, BladeSocket } from './format';
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
    label: 'Fire ^',
    rate: 120,
    life: [0.4, 1.0],
    vel: [0, -8],
    jitter: 3,
    glyphs: '^^*:.',
    colors: ['#fff0b0', '#f6c45a', '#d8644c', '#6a2418'],
    glow: '#d8644c',
  },
  // Petir: umur pendek, sebaran lebar, glyph zigzag. Kesan berkedip tanpa logika khusus.
  lightning: {
    label: 'Lightning z',
    rate: 90,
    life: [0.08, 0.25],
    vel: [0, 0],
    jitter: 22,
    glyphs: 'zZ/\\',
    colors: ['#ffffff', '#c8e8ff', '#6aa0e8', '#203a68'],
    glow: '#8ac0ff',
  },
  // Darah: menetes ke bawah dari blade.
  blood: {
    label: 'Blood ~',
    rate: 45,
    life: [0.6, 1.4],
    vel: [0, 9],
    jitter: 0.6,
    glyphs: "~o.'",
    colors: ['#f08a6c', '#c0392b', '#7a1a12', '#2a0806'],
    glow: '#a83a2a',
  },
  venom: {
    label: 'Venom §',
    rate: 60,
    life: [0.5, 1.2],
    vel: [0, 5],
    jitter: 1.5,
    glyphs: '§o:.',
    colors: ['#e0f8b0', '#8fae6a', '#4a6a2a', '#1a2a10'],
    glow: '#8fae6a',
  },
  frost: {
    label: 'Frost *',
    rate: 70,
    life: [0.6, 1.4],
    vel: [0, 1.5],
    jitter: 2.5,
    glyphs: '*+:.',
    colors: ['#f0fbff', '#a8d8f0', '#5a90b8', '#1e3448'],
    glow: '#a8d8f0',
  },
} satisfies Record<string, RuneDef>;

export type RuneKey = keyof typeof RUNES;

/** Aura per item: partikel lahir di tepi silhouette layer, lebih jarang dan lambat dari rune. */
export const AURAS = {
  ember: { ...RUNES.fire, label: 'Ember', rate: 80, vel: [0, -5], jitter: 2 },
  holy: {
    label: 'Holy',
    rate: 70,
    life: [0.6, 1.4],
    vel: [0, -3],
    jitter: 1.5,
    glyphs: "+*'.",
    colors: ['#fff6d0', '#f6dc8c', '#d4a64a', '#5a3e10'],
    glow: '#f6dc8c',
  },
  frost: {
    label: 'Frost',
    rate: 70,
    life: [0.6, 1.4],
    vel: [0, 2],
    jitter: 2,
    glyphs: '*+:.',
    colors: ['#f0fbff', '#a8d8f0', '#5a90b8', '#1e3448'],
    glow: '#a8d8f0',
  },
  shadow: {
    label: 'Shadow',
    rate: 80,
    life: [0.7, 1.6],
    vel: [0, -4],
    jitter: 3,
    glyphs: '%~:.',
    colors: ['#d8b0f0', '#8a5ab0', '#4a2a68', '#1a0e24'],
    glow: '#8a5ab0',
  },
  venom: {
    label: 'Venom',
    rate: 70,
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

/** Part id dari `fx` layer (part yang memancarkan efek), atau undefined = seluruh layer. */
const fxParts = (file: BakeFile, layer: string) => file.layers[layer]?.fx?.map((p) => file.parts.indexOf(p));

/** Spawn aura satu layer: tepi silhouette-nya, atau hanya part `fx` layer itu. */
export const auraSpawn = (grid: Grid, file: BakeFile, layer: string): Spawn => alongEdge(grid, layer, fxParts(file, layer));

/** Spawn rune: socket blade, kecuali senjata punya `fx` (flail: rantai + bola, bukan gagang). */
export function runeSpawn(grid: Grid, file: BakeFile, weapon: string | null | undefined): Spawn {
  const fx = weapon ? fxParts(file, weapon) : undefined;
  return fx && weapon ? alongEdge(grid, weapon, fx) : alongBlade(grid.blade);
}

/** Spawn acak di sel tepi silhouette satu layer. Dihitung ulang saat frame berganti. */
export function alongEdge(grid: Grid, layer: string, parts?: number[]): Spawn {
  const edge = edgeCells(grid, layer, parts);
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
  /** partikel besar: glyph 2× tanpa snap ke sel, kesan percikan yang lebih mewah. */
  big: boolean;
}

/** Level intensitas efek (1 = halus, 2 = terang, 3 = megah). */
export type EffectLevel = 1 | 2 | 3;
export const LEVELS: Record<EffectLevel, string> = { 1: 'Faint', 2: 'Bright', 3: 'Radiant' };
// Pengali per level: jumlah partikel, sebaran, umur, peluang partikel besar, kekuatan halo.
const LEVEL = {
  1: { rate: 0.7, spread: 1, life: 1, big: 0.03, halo: 0.6 },
  2: { rate: 1.4, spread: 1.3, life: 1.25, big: 0.08, halo: 1 },
  3: { rate: 2.4, spread: 1.7, life: 1.5, big: 0.16, halo: 1.6 },
} satisfies Record<EffectLevel, object>;

const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const MAX_PARTICLES = 1200;

/** Sprite halo (gradien radial warna glow), digambar sekali lalu di-drawImage per partikel: murah. */
function haloSprite(color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const [r, gr, b] = parse(color);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
  grad.addColorStop(0.35, `rgba(${r},${gr},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export class RuneEmitter {
  private ps: Particle[] = [];
  private carry = 0;
  private styles: string[];
  private halo: HTMLCanvasElement;
  private lv: (typeof LEVEL)[EffectLevel];

  constructor(
    readonly rune: RuneDef,
    readonly level: EffectLevel = 2,
  ) {
    this.lv = LEVEL[level];
    this.halo = haloSprite(rune.glow);
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
    const lv = this.lv;
    for (const p of this.ps) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.ps = this.ps.filter((p) => p.age < p.life);
    if (!spawn) return;
    this.carry += r.rate * lv.rate * dt;
    while (this.carry >= 1 && this.ps.length < MAX_PARTICLES) {
      this.carry--;
      const [x, y] = spawn();
      const big = Math.random() < lv.big;
      const j = r.jitter * lv.spread;
      this.ps.push({
        x,
        y,
        vx: r.vel[0] + (Math.random() * 2 - 1) * j,
        vy: (r.vel[1] + (Math.random() * 2 - 1) * j) * (big ? 0.7 : 1),
        age: 0,
        life: (r.life[0] + Math.random() * (r.life[1] - r.life[0])) * lv.life * (big ? 1.3 : 1),
        big,
      });
    }
    this.carry = Math.min(this.carry, 1);
  }

  /**
   * Lapis: sel di bawah glyph kecil dikosongkan (supaya terbaca di atas badan), halo (bloom, blend 'lighter'),
   * glyph kecil yang di-snap ke sel, lalu glyph besar 2× yang melayang bebas.
   */
  draw(ctx: CanvasRenderingContext2D, grid: Grid, cellW: number, cellH: number, background: string) {
    const { cols, rows } = grid;
    if (!this.ps.length) return;
    const r = this.rune;
    const font = ctx.font;
    const fontPx = cellW / 0.6;
    ctx.save();
    // 1. kosongkan sel di bawah glyph kecil dulu, supaya halo yang menyusul ikut menerangi sel itu (tanpa kotak gelap).
    ctx.fillStyle = background;
    const cells: [number, number, Particle][] = [];
    for (const p of this.ps) {
      if (p.big) continue;
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      ctx.fillRect(cx * cellW, cy * cellH, cellW, cellH);
      cells.push([cx, cy, p]);
    }
    // 2. halo (bloom)
    ctx.globalCompositeOperation = 'lighter';
    const hs = cellW * 5 * this.lv.halo;
    for (const p of this.ps) {
      const k = p.age / p.life;
      // dibagi akar jumlah partikel supaya level tinggi tidak jadi gumpalan putih (blend 'lighter' cepat jenuh).
      ctx.globalAlpha = ((1 - k) * (p.big ? 0.32 : 0.11) * Math.min(1.2, this.lv.halo)) / Math.sqrt(this.lv.rate);
      const size = p.big ? hs * 1.8 : hs;
      ctx.drawImage(this.halo, p.x * cellW - size / 2, p.y * cellH - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // 3. glyph kecil, di-snap ke sel
    ctx.shadowColor = r.glow;
    ctx.shadowBlur = 8;
    for (const [cx, cy, p] of cells) {
      const k = p.age / p.life;
      ctx.fillStyle = this.styles[Math.min(7, Math.floor(k * 8))];
      ctx.fillText(r.glyphs[Math.min(r.glyphs.length - 1, Math.floor(k * r.glyphs.length))], cx * cellW, cy * cellH + cellH / 2);
    }
    // 4. glyph besar
    ctx.font = `700 ${Math.round(fontPx * 2)}px "JetBrains Mono", monospace`;
    ctx.shadowBlur = 14;
    for (const p of this.ps) {
      if (!p.big) continue;
      const k = p.age / p.life;
      ctx.fillStyle = this.styles[Math.min(7, Math.floor(k * 8))];
      ctx.fillText(r.glyphs[Math.min(r.glyphs.length - 1, Math.floor(k * r.glyphs.length))], p.x * cellW - cellW, p.y * cellH);
    }
    ctx.font = font;
    ctx.restore();
  }

  clear() {
    this.ps = [];
    this.carry = 0;
  }
}
