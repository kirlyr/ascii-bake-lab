// Gambar Grid ke <canvas> sebagai teks monospace. Tanpa Three.js.
import { EMPTY_DEPTH } from './format';
import type { Grid } from './compose';

export type ColorMode = 'texture' | 'medieval' | 'depth';

const FONT = '"JetBrains Mono", monospace';
/** Glyph hanya menutup sebagian sel, jadi warna perlu diangkat supaya terbaca di latar gelap. */
const gain = (c: number[], g: number) => c.map((v) => 255 * Math.min(1, Math.pow(v / 255, 0.8) * g));

const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toCss = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

// Ramp palet medieval: border → muted → parchment → emas tua untuk highlight.
const RAMP = ['#4a3b2a', '#8a7558', '#b0a083', '#ead9b5'].map(parse);
function ramp(t: number) {
  const x = Math.min(0.999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  return mix(RAMP[i], RAMP[i + 1], x - i);
}

export class AsciiCanvas {
  readonly ctx: CanvasRenderingContext2D;
  cellW = 0;
  cellH = 0;
  private styles: Record<ColorMode, string[]>;
  private depthStyles: string[];

  constructor(
    readonly canvas: HTMLCanvasElement,
    palette: string[],
    readonly cellAspect: number,
    readonly fontSize = 10,
    readonly background = '#120e0a',
    readonly fontWeight = 700,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const pal = palette.map(parse);
    this.styles = {
      texture: pal.map((c) => toCss(gain(c, 1.35))),
      // Warna tekstur ditarik ke ramp parchment supaya menyatu dengan UI.
      medieval: pal.map((c) => toCss(mix(gain(c, 1.35), ramp(lum(c) * 1.5), 0.6))),
      depth: [],
    };
    // depth: dekat = emas terang, jauh = coklat gelap.
    this.depthStyles = Array.from({ length: 256 }, (_, d) => toCss(mix(parse('#f0c060'), parse('#3a2c1e'), d / 254)));
  }

  resize(cols: number, rows: number) {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${FONT}`;
    this.cellW = this.ctx.measureText('M').width;
    this.cellH = this.cellW / this.cellAspect;
    const w = Math.ceil(cols * this.cellW);
    const h = Math.ceil(rows * this.cellH);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(grid: Grid, mode: ColorMode) {
    const { ctx, cellW, cellH } = this;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, grid.cols * cellW, grid.rows * cellH);
    ctx.font = `${this.fontWeight} ${this.fontSize}px ${FONT}`;
    ctx.textBaseline = 'middle';
    // JetBrains Mono punya ligature (==, ->). Matikan supaya tiap karakter tetap 1 sel.
    ctx.textRendering = 'optimizeSpeed';
    ctx.fontKerning = 'none';
    for (let y = 0; y < grid.rows; y++) {
      const cy = y * cellH + cellH / 2;
      let x = 0;
      while (x < grid.cols) {
        const gi = y * grid.cols + x;
        if (grid.depth[gi] === EMPTY_DEPTH) {
          x++;
          continue;
        }
        // Satu fillText per run sel berwarna sama, jauh lebih murah daripada per sel.
        const style = mode === 'depth' ? this.depthStyles[grid.depth[gi]] : this.styles[mode][grid.color[gi]];
        const x0 = x;
        let s = '';
        while (x < grid.cols) {
          const j = y * grid.cols + x;
          if (grid.depth[j] === EMPTY_DEPTH) break;
          const st = mode === 'depth' ? this.depthStyles[grid.depth[j]] : this.styles[mode][grid.color[j]];
          if (st !== style) break;
          s += grid.chars[j];
          x++;
        }
        ctx.fillStyle = style;
        ctx.fillText(s, x0 * cellW, cy);
      }
    }
  }
}
