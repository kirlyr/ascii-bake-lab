// Home (prototype): karakter sudut samping dengan loadout dari Tavern. Hanya memuat hero.bake (tanpa file putar).
import { loadBake, type BakeFile } from '../shared/format';
import { activeLayers, composeFrame, createGrid, decodeSprite } from '../shared/compose';
import { AsciiCanvas } from '../shared/ascii-canvas';
import { AURAS, RUNES, RuneEmitter, alongBlade, alongEdge, type Spawn } from '../shared/runes';
import { loadLoadout, materialsFor } from '../shared/loadout';

const url = `${import.meta.env.BASE_URL}baked/hero.bake`;
const bake = await loadBake<BakeFile>(url);
if (!bake) throw new Error(`${url} tidak ada.`);
const file = bake.data;
await document.fonts.load('700 10px "JetBrains Mono"');

const lo = loadLoadout(file);
const sprite = decodeSprite(file, bake.planes);
const grid = createGrid(file.cols, file.rows);
const view = new AsciiCanvas(document.querySelector<HTMLCanvasElement>('#stage')!, file.cellAspect);
view.resize(file.cols, file.rows);
view.setLook({ parts: file.parts, ramp: file.ramp, materials: materialsFor(file, lo) });
const layers = activeLayers(file, lo.equip);

// Partikel = animasi, jadi aura/rune mati total saat reduced-motion (karakter tetap tampil diam).
const playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const rune = playing && lo.rune ? new RuneEmitter(RUNES[lo.rune]) : null;
const auras = playing ? Object.entries(lo.auras).filter(([slot]) => lo.equip[slot]).map(([slot, a]) => ({ slot, e: new RuneEmitter(AURAS[a]) })) : [];
const spawn: Record<string, Spawn> = {};

let frame = 0;
function compose() {
  composeFrame(sprite, grid, 'idle', frame, layers, false);
  for (const a of auras) spawn[a.slot] = alongEdge(grid, lo.equip[a.slot]!);
}
function paint() {
  view.draw(grid, 'material', false);
  for (const a of auras) a.e.draw(view.ctx, grid, view.cellW, view.cellH, view.background);
  rune?.draw(view.ctx, grid, view.cellW, view.cellH, view.background);
}

compose();
paint();
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
