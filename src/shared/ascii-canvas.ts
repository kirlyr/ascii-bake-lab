// Gambar Grid ke <canvas> sebagai teks monospace. Tanpa Three.js.
// Tiap sel = packCell(part, shade). Glyph + warna diambil dari tabel 256 entri
// yang dibangun dari material per part, jadi ganti material = bangun ulang tabel.
import { EMPTY_DEPTH, MAX_SHADES, mirrorChar, packCell } from './format';
import type { Grid } from './compose';
import type { Material } from './materials';

export type ColorMode = 'material' | 'part' | 'depth';

const FONT = '"JetBrains Mono", monospace';

const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toCss = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

function gradient(stops: string[], t: number) {
  const s = stops.map(parse);
  if (s.length === 1) return s[0];
  const x = Math.min(1, Math.max(0, t)) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(x));
  return mix(s[i], s[i + 1], x - i);
}

/** Warna debug per part id (mode "part"). */
const PART_HUES = ['#d4a64a', '#8fae6a', '#d8644c', '#6aa0c8', '#c88ad0', '#e0e0a0', '#70c8b0', '#d09060'];

export interface Look {
  /** nama part, index = part id (dari BakeFile.parts). */
  parts: string[];
  /** ramp bake (BakeFile.ramp). */
  ramp: string;
  materials: Record<string, Material>;
}

export class AsciiCanvas {
  readonly ctx: CanvasRenderingContext2D;
  cellW = 0;
  cellH = 0;
  private glyph: string[] = [];
  private glyphMirror: string[] = [];
  private styles: Record<'material' | 'part', string[]> = { material: [], part: [] };
  private depthStyles: string[];

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly cellAspect: number,
    readonly fontSize = 10,
    readonly background = '#120e0a',
    readonly fontWeight = 700,
  ) {
    this.ctx = canvas.getContext('2d')!;
    // depth: dekat = emas terang, jauh = coklat gelap.
    this.depthStyles = Array.from({ length: 256 }, (_, d) => toCss(mix(parse('#f0c060'), parse('#3a2c1e'), d / 254)));
  }

  /** Bangun tabel glyph/warna per byte sel dari material tiap part. */
  setLook({ parts, ramp, materials }: Look) {
    const n = ramp.length;
    this.glyph = new Array(256).fill(' ');
    this.styles = { material: new Array(256).fill('#000'), part: new Array(256).fill('#000') };
    parts.forEach((name, pid) => {
      const mat = materials[name];
      const glyphs = mat?.glyphs ?? ramp;
      for (let s = 0; s < Math.min(n, MAX_SHADES); s++) {
        const t = n > 1 ? s / (n - 1) : 1;
        const c = packCell(pid, s);
        // Panjang glyphs material boleh beda dari ramp: ambil posisi relatif.
        this.glyph[c] = glyphs[Math.round(t * (glyphs.length - 1))];
        this.styles.material[c] = toCss(gradient(mat?.colors ?? ['#4a3b2a', '#ead9b5'], t));
        this.styles.part[c] = toCss(mix(parse('#2a2018'), parse(PART_HUES[pid % PART_HUES.length]), 0.35 + 0.65 * t));
      }
    });
    this.glyphMirror = this.glyph.map(mirrorChar);
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

  draw(grid: Grid, mode: ColorMode, showSockets = false) {
    const { ctx, cellW, cellH } = this;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, grid.cols * cellW, grid.rows * cellH);
    ctx.font = `${this.fontWeight} ${this.fontSize}px ${FONT}`;
    ctx.textBaseline = 'middle';
    // JetBrains Mono punya ligature (==, ->). Matikan supaya tiap karakter tetap 1 sel.
    ctx.textRendering = 'optimizeSpeed';
    ctx.fontKerning = 'none';
    const glyph = grid.mirror ? this.glyphMirror : this.glyph;
    const styleOf = (j: number) => (mode === 'depth' ? this.depthStyles[grid.depth[j]] : this.styles[mode][grid.cell[j]]);
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
        const style = styleOf(gi);
        const x0 = x;
        let s = '';
        while (x < grid.cols) {
          const j = y * grid.cols + x;
          if (grid.depth[j] === EMPTY_DEPTH || styleOf(j) !== style) break;
          s += glyph[grid.cell[j]];
          x++;
        }
        ctx.fillStyle = style;
        ctx.fillText(s, x0 * cellW, cy);
      }
    }
    if (showSockets && grid.blade) {
      // Penanda debug: hijau = pangkal blade, merah = ujung.
      const dot = ([x, y]: number[], color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x * cellW, y * cellH, 3, 0, Math.PI * 2);
        ctx.fill();
      };
      ctx.strokeStyle = 'rgba(234,217,181,0.5)';
      ctx.beginPath();
      ctx.moveTo(grid.blade.base[0] * cellW, grid.blade.base[1] * cellH);
      ctx.lineTo(grid.blade.tip[0] * cellW, grid.blade.tip[1] * cellH);
      ctx.stroke();
      dot(grid.blade.base, '#8fae6a');
      dot(grid.blade.tip, '#d8644c');
    }
  }
}
