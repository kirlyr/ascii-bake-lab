// Runtime compose: tumpuk beberapa layer per sel berdasarkan depth terdekat (dikurangi bias layer).
// Tanpa Three.js. Dipakai player dan preview di bake tool.
import { b64decode, EMPTY_DEPTH, type BakeFile, type BladeSocket, type Planes } from './format';

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
  /** layer pemilik tiap sel: index ke `layers` + 1 (0 = kosong). Sumber aura. */
  owner: Uint8Array;
  /** layer aktif frame ini, urutan sama dengan `owner`. */
  layers: string[];
}

/** `planes` = plane dari container `.bake` (frame punya `o`); tanpa itu, frame dibaca dari base64 JSON. */
export function decodeSprite(file: BakeFile, planes?: Planes): Sprite {
  if (file.version !== 2) throw new Error(`Format bake v${file.version} tidak didukung. Bake ulang dengan bake tool.`);
  const layers: Sprite['layers'] = {};
  for (const [lk, layer] of Object.entries(file.layers)) {
    layers[lk] = {};
    for (const [ck, frames] of Object.entries(layer.clips)) {
      layers[lk][ck] = frames.map((f) => {
        const n = f.w * f.h;
        if (planes && f.o !== undefined) return { ...f, cell: planes.cell.subarray(f.o, f.o + n), depth: planes.depth.subarray(f.o, f.o + n) };
        return { ...f, cell: b64decode(f.cell ?? ''), depth: b64decode(f.depth ?? '') };
      });
    }
  }
  return { file, layers };
}

/** Layer tanpa slot selalu tampil. Per slot: varian yang dipasang (null = kosong). */
export type Equipment = Record<string, string | null>;

/** Equipment awal: layer pertama tiap slot. */
export function defaultEquipment(file: BakeFile): Equipment {
  const eq: Equipment = {};
  for (const [k, l] of Object.entries(file.layers)) if (l.slot && !(l.slot in eq)) eq[l.slot] = l.unequipped ? null : k;
  return eq;
}

/** Layer aktif untuk compose, urut sesuai file (urutan tidak memengaruhi hasil, depth yang menentukan). */
export function activeLayers(file: BakeFile, eq: Equipment): string[] {
  const on = Object.entries(file.layers).filter(([k, l]) => !l.slot || eq[l.slot] === k);
  const hidden = new Set(on.flatMap(([, l]) => l.hides ?? []));
  return on.filter(([, l]) => !l.slot || !hidden.has(l.slot)).map(([k]) => k);
}

export function createGrid(cols: number, rows: number): Grid {
  const n = cols * rows;
  return { cols, rows, cell: new Uint8Array(n), depth: new Uint8Array(n), mirror: false, blade: null, owner: new Uint8Array(n), layers: [] };
}

/** Tulis satu frame (semua layer aktif) ke grid. `mirror` membalik arah hadap. */
export function composeFrame(sprite: Sprite, grid: Grid, clip: string, frame: number, activeLayers: string[], mirror: boolean, offsetX = 0, offsetY = 0) {
  grid.depth.fill(EMPTY_DEPTH);
  grid.mirror = mirror;
  grid.blade = null;
  grid.owner.fill(0);
  grid.layers = activeLayers;
  const { cols } = sprite.file;
  for (const [li, lk] of activeLayers.entries()) {
    const frames = sprite.layers[lk]?.[clip];
    if (!frames?.length) continue;
    const f = frames[frame % frames.length];
    const bias = sprite.file.layers[lk].bias ?? 0;
    if (f.blade) {
      const m = ([x, y, d]: number[]): [number, number, number] => [(mirror ? cols - x : x) + offsetX, y + offsetY, d];
      grid.blade = { base: m(f.blade.base), tip: m(f.blade.tip) };
    }
    for (let y = 0; y < f.h; y++) {
      const gy = f.y + y + offsetY;
      if (gy < 0 || gy >= grid.rows) continue;
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        if (f.depth[i] === EMPTY_DEPTH) continue;
        const d = Math.max(0, f.depth[i] - bias);
        const sx = f.x + x;
        const gx = (mirror ? cols - 1 - sx : sx) + offsetX;
        if (gx < 0 || gx >= grid.cols) continue;
        const gi = gy * grid.cols + gx;
        if (d >= grid.depth[gi]) continue;
        grid.depth[gi] = d;
        grid.cell[gi] = f.cell[i];
        grid.owner[gi] = li + 1;
      }
    }
  }
}

/**
 * Sel tepi silhouette milik satu layer (yang terlihat): sel milik layer dengan tetangga 4-arah kosong
 * atau milik layer lain. Sumber spawn aura. Hasil = index sel.
 */
export function edgeCells(grid: Grid, layer: string): number[] {
  const id = grid.layers.indexOf(layer) + 1;
  if (!id) return [];
  const { cols, rows, owner } = grid;
  const out: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (owner[i] !== id) continue;
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1 || owner[i - 1] !== id || owner[i + 1] !== id || owner[i - cols] !== id || owner[i + cols] !== id) out.push(i);
    }
  return out;
}
