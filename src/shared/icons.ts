// Ikon item = layer itu sendiri (frame idle pertama), di-crop ke silhouette-nya dan digambar dengan font kecil.
// Tanpa bake tambahan, dan ikut berubah saat pewarna/material diganti.
import { EMPTY_DEPTH, cellPart } from './format';
import { composeFrame, createGrid, type Grid, type Sprite } from './compose';
import { AsciiCanvas, type Look } from './ascii-canvas';

const cache = new Map<string, Grid>();

/** Grid ter-crop untuk satu layer (di-cache; isinya tidak bergantung pada look). */
function iconGrid(sprite: Sprite, layer: string): Grid {
  let g = cache.get(layer);
  if (g) return g;
  const { cols, rows } = sprite.file;
  const full = createGrid(cols, rows);
  composeFrame(sprite, full, 'idle', 0, [layer], false);
  let [x0, y0, x1, y1] = [cols, rows, -1, -1];
  for (let i = 0; i < full.depth.length; i++) {
    if (full.depth[i] === EMPTY_DEPTH) continue;
    const x = i % cols;
    const y = Math.floor(i / cols);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const w = Math.max(1, x1 - x0 + 1);
  const h = Math.max(1, y1 - y0 + 1);
  g = createGrid(w, h);
  g.depth.fill(EMPTY_DEPTH);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y0 + y) * cols + x0 + x;
      g.cell[y * w + x] = full.cell[s];
      g.depth[y * w + x] = full.depth[s];
    }
  }
  cache.set(layer, g);
  return g;
}

/** Part id yang dipakai layer (untuk opsi pewarna di panel detail). */
export function layerParts(sprite: Sprite, layer: string): string[] {
  const g = iconGrid(sprite, layer);
  const ids = new Set<number>();
  g.depth.forEach((d, i) => d !== EMPTY_DEPTH && ids.add(cellPart(g.cell[i])));
  return [...ids].map((id) => sprite.file.parts[id]);
}

/**
 * Gambar ikon ke canvas, muat di kotak `box` px. Dirender dulu ke canvas offscreen lalu diskalakan.
 * Senjata diputar supaya blade menunjuk ke kanan atas (45°) seperti ikon inventory, karena di pose idle
 * senjata tergenggam miring dan ikonnya jadi garis tipis.
 */
export function drawIcon(canvas: HTMLCanvasElement, sprite: Sprite, layer: string, look: Look, box: number) {
  const g = iconGrid(sprite, layer);
  const off = document.createElement('canvas');
  const view = new AsciiCanvas(off, sprite.file.cellAspect, 8, 'transparent');
  view.setLook(look);
  view.resize(g.cols, g.rows);
  view.draw(g, 'material');
  const W = g.cols * view.cellW;
  const H = g.rows * view.cellH;
  const blade = sprite.layers[layer]?.idle?.[0]?.blade;
  const angle = blade
    ? -Math.PI / 4 - Math.atan2((blade.tip[1] - blade.base[1]) * view.cellH, (blade.tip[0] - blade.base[0]) * view.cellW)
    : 0;
  const [c, s] = [Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))];
  const bw = W * c + H * s;
  const bh = W * s + H * c;
  const k = Math.min(box / bw, box / bh, 1.25);
  const dpr = window.devicePixelRatio || 1;
  const [cw, ch] = [Math.ceil(bw * k), Math.ceil(bh * k)];
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(angle);
  ctx.scale(k, k);
  ctx.drawImage(off, -W / 2, -H / 2, W, H);
}
