// Home (prototype): karakter dengan loadout dari Tavern. hero.bake dimuat dulu supaya karakter langsung tampil;
// file putar (hero-turn.bake) dimuat di belakang layar, lalu karakter bisa diputar (drag atau ⟲ ⟳).
import { loadBake, type BakeFile, type TurnFile } from '../shared/format';
import { createGrid, decodeSprite, type Sprite } from '../shared/compose';
import { AsciiCanvas } from '../shared/ascii-canvas';
import { AURAS, RUNES, RuneEmitter, alongBlade, alongEdge, type Spawn } from '../shared/runes';
import { levelOf, loadLoadout, materialsFor } from '../shared/loadout';
import { STEP, composeTurn, dragToRotate, normYaw, sideYaw, turnCols, turnSprites } from '../shared/turn';

const url = `${import.meta.env.BASE_URL}baked/hero.bake`;
const bake = await loadBake<BakeFile>(url);
if (!bake) throw new Error(`${url} tidak ada.`);
const file = bake.data;
await document.fonts.load('700 10px "JetBrains Mono"');

const lo = loadLoadout(file);
const sprite = decodeSprite(file, bake.planes);
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const view = new AsciiCanvas(canvas, file.cellAspect);
view.setLook({ parts: file.parts, ramp: file.ramp, materials: materialsFor(file, lo) });
let grid = createGrid(file.cols, file.rows);
view.resize(grid.cols, grid.rows);
let views: Map<number, Sprite> | null = null;
let yaw = sideYaw(file);

// Partikel = animasi, jadi aura/rune mati total saat reduced-motion (karakter tetap tampil diam).
const playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const rune = playing && lo.rune ? new RuneEmitter(RUNES[lo.rune], levelOf(lo, 'rune')) : null;
const auras = playing
  ? Object.entries(lo.auras)
      .filter(([slot]) => lo.equip[slot])
      .map(([slot, a]) => ({ slot, e: new RuneEmitter(AURAS[a], levelOf(lo, slot)) }))
  : [];
const spawn: Record<string, Spawn> = {};

let frame = 0;
function compose() {
  composeTurn(grid, sprite, views, yaw, 'idle', frame, lo.equip);
  for (const a of auras) spawn[a.slot] = alongEdge(grid, lo.equip[a.slot]!);
}
function paint() {
  view.draw(grid, 'material', false);
  for (const a of auras) a.e.draw(view.ctx, grid, view.cellW, view.cellH, view.background);
  rune?.draw(view.ctx, grid, view.cellW, view.cellH, view.background);
}
function draw() {
  compose();
  paint();
}

draw();
if (playing) {
  const step = 1000 / file.fps;
  let last = performance.now();
  let acc = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    acc += now - last;
    last = now;
    if (acc >= step) {
      frame += Math.floor(acc / step);
      acc %= step;
      compose();
    }
    rune?.update(dt, alongBlade(grid.blade));
    for (const a of auras) a.e.update(dt, spawn[a.slot] ?? null);
    paint();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Putar: aktif setelah file putar termuat.
const turnBake = await loadBake<TurnFile>(url.replace(/\.bake$/, '-turn.bake'));
if (turnBake) {
  views = turnSprites(turnBake.data, turnBake.planes);
  grid = createGrid(turnCols(file, turnBake.data), file.rows);
  view.resize(grid.cols, grid.rows);
  const rotate = (dir: number) => {
    yaw = normYaw(yaw + dir * STEP);
    draw();
  };
  dragToRotate(canvas, rotate);
  document.querySelector<HTMLButtonElement>('#rot-l')!.onclick = () => rotate(1);
  document.querySelector<HTMLButtonElement>('#rot-r')!.onclick = () => rotate(-1);
  document.querySelector<HTMLElement>('#turn')!.hidden = false;
  canvas.style.cursor = 'grab';
  draw();
}
