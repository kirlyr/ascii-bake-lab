// Putar karakter: pilih sprite per arah dan compose dengan perataan origin. Dipakai Tavern dan Home.
import type { BakeFile, Planes, TurnFile } from './format';
import { activeLayers, composeFrame, decodeSprite, type Equipment, type Grid, type Sprite } from './compose';

export const STEP = 22.5;

/** yaw → (-180, 180]. */
export const normYaw = (y: number) => {
  const n = ((((y + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
};

/** 16 arah dari hero-turn.bake, key = yaw ternormalisasi. Di-bake semua tanpa mirror (item satu sisi tetap di sisinya). */
export const turnSprites = (turn: TurnFile, planes: Planes) =>
  new Map<number, Sprite>(turn.views.map((v) => [normYaw(v.yaw ?? 0), decodeSprite(v, planes)]));

/** Lebar grid yang muat untuk semua arah. */
export const turnCols = (hero: BakeFile, turn: TurnFile | null) => Math.max(hero.cols, ...(turn?.views ?? []).map((v) => v.cols));

/** Arah bake hero.bake (hadap kanan = -90). */
export const sideYaw = (hero: BakeFile) => (hero.facing === 'right' ? -90 : 90);

/**
 * Compose satu frame di arah `yaw`. hero.bake (animasi penuh) dipakai di arah bake-nya dan saat berjalan ke
 * arah sebaliknya (mirror, seperti game 2D). Arah lain memakai view putar (idle napas) supaya tidak ada lompatan sisi.
 * `frame` = frame hero; view putar menurunkan frame-nya sendiri dari fps masing-masing.
 */
export function composeTurn(grid: Grid, hero: Sprite, views: Map<number, Sprite> | null, yaw: number, clip: string, frame: number, equip: Equipment) {
  const file = hero.file;
  const side = sideYaw(file);
  const tv = views?.get(yaw);
  const useHero = !tv || yaw === side || (Math.abs(yaw) === 90 && clip !== 'idle');
  const mirror = useHero && yaw === -side;
  const src = useHero ? hero : tv;
  const f = src.file;
  const [ox, oy] = f.origin ?? [f.cols / 2, f.rows];
  const dx = Math.round(grid.cols / 2 - (mirror ? f.cols - ox : ox));
  const dy = Math.round((file.origin?.[1] ?? file.rows) - oy);
  const [c, fr] = src === hero ? [clip, frame] : ['idle', Math.floor((frame * f.fps) / file.fps)];
  composeFrame(src, grid, c, fr, activeLayers(f, equip), mirror, dx, dy);
}

/** Drag horizontal di elemen = putar per STEP (24 px per langkah). `rotate(+1)` = putar ke kiri. */
export function dragToRotate(el: HTMLElement, rotate: (dir: number) => void) {
  let dragX: number | null = null;
  el.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    const steps = Math.trunc((e.clientX - dragX) / 24);
    if (!steps) return;
    dragX += steps * 24;
    rotate(-steps); // drag ke kanan = karakter berputar ke kanan (searah jarum jam dari atas)
  });
  const end = () => (dragX = null);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
