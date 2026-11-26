// Runtime compose: tumpuk beberapa layer per sel berdasarkan depth terdekat.
// Tanpa Three.js. Dipakai player dan preview di bake tool.
import { b64decode, EMPTY_DEPTH, type BakeFile, type BladeSocket } from './format';

export interface DecodedFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  cell: Uint8Array;
  depth: Uint8Array;
  blade?: BladeSocket;
}

export interface Sprite {
  file: BakeFile;
  /** layer → clip → frame */
  layers: Record<string, Record<string, DecodedFrame[]>>;
}

export interface Grid {
  cols: number;
  rows: number;
  /** packCell(part, shade) per sel. */
  cell: Uint8Array;
  depth: Uint8Array;
  /** true = hasil compose dibalik; renderer menukar glyph asimetris (/ ↔ \). */
  mirror: boolean;
  /** socket blade frame ini (sudah di-mirror), kalau layer senjata aktif. */
  blade: BladeSocket | null;
}

export function decodeSprite(file: BakeFile): Sprite {
  if (file.version !== 2) throw new Error(`Format bake v${file.version} tidak didukung. Bake ulang dengan bake tool.`);
  const layers: Sprite['layers'] = {};
  for (const [lk, layer] of Object.entries(file.layers)) {
    layers[lk] = {};
    for (const [ck, frames] of Object.entries(layer.clips)) {
      layers[lk][ck] = frames.map((f) => ({ ...f, cell: b64decode(f.cell), depth: b64decode(f.depth) }));
    }
  }
  return { file, layers };
}

export function createGrid(cols: number, rows: number): Grid {
  return { cols, rows, cell: new Uint8Array(cols * rows), depth: new Uint8Array(cols * rows), mirror: false, blade: null };
}

/** Tulis satu frame (semua layer aktif) ke grid. `mirror` membalik arah hadap. */
export function composeFrame(sprite: Sprite, grid: Grid, clip: string, frame: number, activeLayers: string[], mirror: boolean, offsetX = 0, offsetY = 0) {
  grid.depth.fill(EMPTY_DEPTH);
  grid.mirror = mirror;
  grid.blade = null;
  const { cols } = sprite.file;
  for (const lk of activeLayers) {
    const frames = sprite.layers[lk]?.[clip];
    if (!frames?.length) continue;
    const f = frames[frame % frames.length];
    if (f.blade) {
      const m = ([x, y, d]: number[]): [number, number, number] => [(mirror ? cols - x : x) + offsetX, y + offsetY, d];
      grid.blade = { base: m(f.blade.base), tip: m(f.blade.tip) };
    }
    for (let y = 0; y < f.h; y++) {
      const gy = f.y + y + offsetY;
      if (gy < 0 || gy >= grid.rows) continue;
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        const d = f.depth[i];
        if (d === EMPTY_DEPTH) continue;
        const sx = f.x + x;
        const gx = (mirror ? cols - 1 - sx : sx) + offsetX;
        if (gx < 0 || gx >= grid.cols) continue;
        const gi = gy * grid.cols + gx;
        if (d >= grid.depth[gi]) continue;
        grid.depth[gi] = d;
        grid.cell[gi] = f.cell[i];
      }
    }
  }
}
