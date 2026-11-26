// Runtime compose: tumpuk beberapa layer per sel berdasarkan depth terdekat.
// Tanpa Three.js. Dipakai player dan preview di bake tool.
import { b64decode, EMPTY_DEPTH, mirrorChar, type BakeFile } from './format';

export interface DecodedFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  chars: string;
  depth: Uint8Array;
  color: Uint8Array;
}

export interface Sprite {
  file: BakeFile;
  /** layer → clip → frame */
  layers: Record<string, Record<string, DecodedFrame[]>>;
}

export interface Grid {
  cols: number;
  rows: number;
  chars: string[];
  color: Uint8Array;
  depth: Uint8Array;
}

export function decodeSprite(file: BakeFile): Sprite {
  const layers: Sprite['layers'] = {};
  for (const [lk, layer] of Object.entries(file.layers)) {
    layers[lk] = {};
    for (const [ck, frames] of Object.entries(layer.clips)) {
      layers[lk][ck] = frames.map((f) => ({ ...f, depth: b64decode(f.depth), color: b64decode(f.color) }));
    }
  }
  return { file, layers };
}

export function createGrid(cols: number, rows: number): Grid {
  return { cols, rows, chars: new Array(cols * rows).fill(' '), color: new Uint8Array(cols * rows), depth: new Uint8Array(cols * rows) };
}

/**
 * Tulis satu frame (semua layer aktif) ke grid.
 * `mirror` membalik arah hadap: kolom dibalik dan karakter asimetris ditukar (/ ↔ \).
 */
export function composeFrame(sprite: Sprite, grid: Grid, clip: string, frame: number, activeLayers: string[], mirror: boolean, offsetX = 0, offsetY = 0) {
  grid.chars.fill(' ');
  grid.depth.fill(EMPTY_DEPTH);
  const { cols } = sprite.file;
  for (const lk of activeLayers) {
    const frames = sprite.layers[lk]?.[clip];
    if (!frames?.length) continue;
    const f = frames[frame % frames.length];
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
        grid.chars[gi] = mirror ? mirrorChar(f.chars[i]) : f.chars[i];
        grid.color[gi] = f.color[i];
      }
    }
  }
}
