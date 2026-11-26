// Player produksi: memutar JSON hasil bake sebagai teks di canvas. Tanpa Three.js.
import type { BakeFile } from '../shared/format';
import { composeFrame, createGrid, decodeSprite } from '../shared/compose';
import { AsciiCanvas, type ColorMode } from '../shared/ascii-canvas';
import { RUNES, RuneEmitter, type RuneKey } from '../shared/runes';
import { BLADE_MATERIALS, MATERIALS, lookFor, type MaterialKey } from '../shared/materials';

const MODEL = new URLSearchParams(location.search).get('model') ?? 'knight';
const URL_JSON = `${import.meta.env.BASE_URL}baked/${MODEL}.json`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const info = $<HTMLElement>('#info');
$<HTMLElement>('h1').textContent = `┤ ${MODEL.toUpperCase()} ├`;

const res = await fetch(URL_JSON);
const text = await res.text();
const file = JSON.parse(text) as BakeFile;
await document.fonts.load('700 10px "JetBrains Mono"');

const sprite = decodeSprite(file);
const grid = createGrid(file.cols, file.rows);
const view = new AsciiCanvas($<HTMLCanvasElement>('#stage'), file.cellAspect);
view.resize(file.cols, file.rows);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {
  clip: 'idle',
  facing: file.facing as 'left' | 'right',
  mode: 'material' as ColorMode,
  blade: 'iron' as MaterialKey,
  sockets: false,
  layers: new Set(Object.keys(file.layers)),
  playing: !reducedMotion,
  rune: null as RuneEmitter | null,
  frame: 0,
};

// Layer toggle. Badan selalu ada; layer lain membuktikan compose berbasis depth.
const layersEl = $<HTMLElement>('#layers');
for (const [key, layer] of Object.entries(file.layers)) {
  const disabled = key === 'body' ? 'disabled' : '';
  layersEl.insertAdjacentHTML('beforeend', `<label><input type="checkbox" value="${key}" checked ${disabled}> ${layer.label}</label>`);
}
layersEl.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.checked) state.layers.add(input.value);
  else state.layers.delete(input.value);
  draw();
});

// Material blade: ganti tabel glyph/warna part "blade" saja, tanpa re-bake.
const applyLook = () => view.setLook({ parts: file.parts, ramp: file.ramp, materials: lookFor(file.parts, { blade: state.blade }) });
applyLook();
const bladeEl = $<HTMLElement>('#blade');
if (file.parts.includes('blade')) {
  for (const k of BLADE_MATERIALS) bladeEl.insertAdjacentHTML('beforeend', `<button data-blade="${k}" aria-pressed="${k === state.blade}">${MATERIALS[k].label}</button>`);
} else {
  bladeEl.innerHTML = '<span class="muted">Model ini tanpa blade.</span>';
}
$<HTMLInputElement>('#sockets').addEventListener('change', (e) => {
  state.sockets = (e.target as HTMLInputElement).checked;
  draw();
});

function bindGroup(attr: string, apply: (v: string) => void) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`);
  const select = (v: string) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === v)));
    apply(v);
    draw();
  };
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset[attr]!)));
  return select;
}
const setClip = bindGroup('clip', (v) => {
  if (v !== state.clip) state.frame = 0;
  state.clip = v;
});
const setDir = bindGroup('dir', (v) => (state.facing = v as 'left' | 'right'));
bindGroup('mode', (v) => (state.mode = v as ColorMode));
bindGroup('rune', (v) => {
  // Partikel = animasi, jadi mati total saat reduced-motion.
  state.rune = v === 'none' || reducedMotion ? null : new RuneEmitter(RUNES[v as RuneKey]);
  $<HTMLElement>('#rune-note').hidden = !(reducedMotion && v !== 'none');
});
bindGroup('blade', (v) => {
  state.blade = v as MaterialKey;
  applyLook();
});

const playBtn = $<HTMLButtonElement>('#play');
const syncPlay = () => {
  playBtn.textContent = state.playing ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-pressed', String(state.playing));
};
playBtn.addEventListener('click', () => {
  state.playing = !state.playing;
  syncPlay();
});
syncPlay();

// Keyboard: tahan panah = jalan ke arah itu, lepas = idle.
addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  setDir(e.key === 'ArrowLeft' ? 'left' : 'right');
  setClip('walk');
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setClip('idle');
});

function paint() {
  view.draw(grid, state.mode, state.sockets);
  state.rune?.draw(view.ctx, grid, view.cellW, view.cellH, view.background);
}
const compose = () => composeFrame(sprite, grid, state.clip, state.frame, [...state.layers], state.facing !== file.facing);
function draw() {
  compose();
  paint();
}

let last = performance.now();
let acc = 0;
const step = 1000 / file.fps;
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  acc += now - last;
  last = now;
  if (!state.playing) {
    acc = 0;
  } else {
    let changed = false;
    if (acc >= step) {
      state.frame += Math.floor(acc / step);
      acc %= step;
      compose();
      changed = true;
    }
    // Sprite berganti di fps bake; partikel rune diupdate tiap rAF supaya halus.
    if (state.rune) state.rune.update(dt, grid.blade);
    if (changed || state.rune) paint();
  }
  requestAnimationFrame(tick);
}
draw();
requestAnimationFrame(tick);

const frames = Object.values(file.layers).reduce((n, l) => n + Object.values(l.clips).reduce((m, f) => m + f.length, 0), 0);
info.textContent = `${file.cols}×${file.rows} sel · ${file.fps} fps · ${frames} frame total · ${(text.length / 1024).toFixed(0)} KB JSON (sebelum gzip)`;
