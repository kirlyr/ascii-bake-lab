// Rune = emitter partikel glyph yang menempel ke socket blade. Tanpa Three.js.
// Partikel hidup di koordinat grid (unit sel) dan digambar di-snap ke sel supaya tetap terasa ASCII.
import type { BladeSocket } from './format';
import type { Grid } from './compose';

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

  /** dt dalam detik. Tanpa socket (senjata disembunyikan) = berhenti spawn, partikel lama tetap habis. */
  update(dt: number, blade: BladeSocket | null) {
    const r = this.rune;
    for (const p of this.ps) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.ps = this.ps.filter((p) => p.age < p.life);
    if (!blade) return;
    this.carry += r.rate * dt;
    const [bx, by] = blade.base;
    const [tx, ty] = blade.tip;
    while (this.carry >= 1 && this.ps.length < MAX_PARTICLES) {
      this.carry--;
      const t = Math.random();
      this.ps.push({
        x: bx + (tx - bx) * t,
        y: by + (ty - by) * t,
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
