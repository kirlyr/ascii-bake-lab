// Player produksi: memutar JSON hasil bake sebagai teks di canvas. Tanpa Three.js.
import type { BakeFile } from '../shared/format';
import { composeFrame, createGrid, decodeSprite } from '../shared/compose';
import { AsciiCanvas, type ColorMode } from '../shared/ascii-canvas';

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
const view = new AsciiCanvas($<HTMLCanvasElement>('#stage'), file.palette, file.cellAspect);
view.resize(file.cols, file.rows);

const state = {
  clip: 'idle',
  facing: file.facing as 'left' | 'right',
  mode: 'texture' as ColorMode,
  layers: new Set(Object.keys(file.layers)),
  playing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
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

function draw() {
  composeFrame(sprite, grid, state.clip, state.frame, [...state.layers], state.facing !== file.facing);
  view.draw(grid, state.mode);
}

let last = performance.now();
let acc = 0;
const step = 1000 / file.fps;
function tick(now: number) {
  acc += now - last;
  last = now;
  if (state.playing && acc >= step) {
    state.frame += Math.floor(acc / step);
    acc %= step;
    draw();
  } else if (!state.playing) acc = 0;
  requestAnimationFrame(tick);
}
draw();
requestAnimationFrame(tick);

const frames = Object.values(file.layers).reduce((n, l) => n + Object.values(l.clips).reduce((m, f) => m + f.length, 0), 0);
info.textContent = `${file.cols}×${file.rows} sel · ${file.fps} fps · ${frames} frame total · ${(text.length / 1024).toFixed(0)} KB JSON (sebelum gzip)`;
