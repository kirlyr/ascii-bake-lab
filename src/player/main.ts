// Player produksi: memutar JSON hasil bake sebagai teks di canvas. Tanpa Three.js.
import type { BakeFile, TurnFile } from '../shared/format';
import { activeLayers, composeFrame, createGrid, decodeSprite, defaultEquipment, type Sprite } from '../shared/compose';
import { AsciiCanvas, type ColorMode } from '../shared/ascii-canvas';
import { AURAS, RUNES, RuneEmitter, alongBlade, alongEdge, type AuraKey, type RuneKey, type Spawn } from '../shared/runes';
import { BLADE_MATERIALS, MATERIALS, lookFor, type MaterialKey } from '../shared/materials';

const MODEL = new URLSearchParams(location.search).get('model') ?? 'hero';
const URL_JSON = `${import.meta.env.BASE_URL}baked/${MODEL}.json`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const info = $<HTMLElement>('#info');
$<HTMLElement>('h1').textContent = `┤ ${MODEL.toUpperCase()} ├`;

// `<model>-turn.json` (opsional) = 16 arah idle napas (4 frame) untuk memutar karakter. Di portfolio cukup dimuat di Tavern.
const [text, turnText] = await Promise.all([
  fetch(URL_JSON).then((r) => r.text()),
  fetch(URL_JSON.replace(/\.json$/, '-turn.json')).then((r) => (r.ok ? r.text() : null)),
]);
const file = JSON.parse(text) as BakeFile;
const turn = turnText ? (JSON.parse(turnText) as TurnFile) : null;
await document.fonts.load('700 10px "JetBrains Mono"');

const sprite = decodeSprite(file);
// yaw view (0..-180) → sprite. Arah +yaw = mirror dari -yaw.
const turnViews = new Map<number, Sprite>((turn?.views ?? []).map((v) => [v.yaw ?? 0, decodeSprite(v)]));
// Grid cukup lebar untuk semua arah; tiap file disejajarkan lewat origin (titik antara kaki).
const cols = Math.max(file.cols, ...(turn?.views ?? []).map((v) => v.cols));
const grid = createGrid(cols, file.rows);
const view = new AsciiCanvas($<HTMLCanvasElement>('#stage'), file.cellAspect);
view.resize(cols, file.rows);
const SIDE = file.facing === 'right' ? -90 : 90;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {
  clip: 'idle',
  /** arah kamera (derajat, kelipatan 22,5). -90 = hadap kanan, 90 = hadap kiri, 0 = depan. */
  yaw: SIDE,
  mode: 'material' as ColorMode,
  blade: 'iron' as MaterialKey,
  sockets: false,
  equip: defaultEquipment(file),
  playing: !reducedMotion,
  rune: null as RuneEmitter | null,
  /** aura per slot; partikel lahir di tepi silhouette item yang dipasang di slot itu. */
  auras: {} as Record<string, RuneEmitter>,
  frame: 0,
};
// Titik spawn aura per slot, dihitung ulang tiap compose (frame/equipment/arah berganti).
const auraSpawn: Record<string, Spawn> = {};

// Equipment per slot: pilih satu varian atau kosongkan. Tiap varian = satu layer bake,
// jadi ganti equipment = ganti daftar layer yang di-compose, tanpa decode ulang.
const SLOT_LABEL: Record<string, string> = { helmet: 'Helm', shoulder: 'Bahu', torso: 'Baju', legs: 'Celana', feet: 'Sepatu', weapon: 'Senjata', armor: 'Armor' };
const auraOptions = ['<option value="">Aura: tanpa</option>', ...Object.entries(AURAS).map(([k, a]) => `<option value="${k}">Aura: ${a.label}</option>`)].join('');
const equipEl = $<HTMLElement>('#equip');
for (const slot of Object.keys(state.equip)) {
  const variants = Object.entries(file.layers).filter(([, l]) => l.slot === slot);
  const buttons = [...variants.map(([k, l]) => [k, l.label]), ['', 'Lepas']]
    .map(([k, label]) => `<button data-slot="${slot}" data-layer="${k}" aria-pressed="${state.equip[slot] === k}">${label}</button>`)
    .join('');
  const name = SLOT_LABEL[slot] ?? slot;
  const aura = reducedMotion ? '' : `<select data-aura="${slot}" aria-label="Aura ${name}">${auraOptions}</select>`;
  equipEl.insertAdjacentHTML('beforeend', `<span class="slot-name">${name} ${aura}</span><div class="row" role="group" aria-label="${name}">${buttons}</div>`);
}
equipEl.addEventListener('change', (e) => {
  const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-aura]');
  if (!sel) return;
  const slot = sel.dataset.aura!;
  if (sel.value) state.auras[slot] = new RuneEmitter(AURAS[sel.value as AuraKey]);
  else delete state.auras[slot];
  draw();
});
equipEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
  if (!b) return;
  const slot = b.dataset.slot!;
  state.equip[slot] = b.dataset.layer || null;
  equipEl.querySelectorAll<HTMLButtonElement>(`[data-slot="${slot}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
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
const setDir = bindGroup('dir', (v) => setYaw(v === file.facing ? SIDE : -SIDE));
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

// Putar: drag di canvas atau tombol ⟲ ⟳, per 22,5°. Animasi hanya di arah samping (hero.json);
// arah lain = idle napas 4 frame dari hero-turn.json.
const norm = (y: number) => ((((y + 180) % 360) + 360) % 360) - 180;
const isSide = () => Math.abs(state.yaw) === 90;
const yawEl = $<HTMLElement>('#yaw');
function setYaw(y: number) {
  state.yaw = norm(y) === -180 ? 180 : norm(y);
  if (!isSide() && state.clip !== 'idle') setClip('idle');
  document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((b) =>
    b.setAttribute('aria-pressed', String(isSide() && (b.dataset.dir === file.facing) === (state.yaw === SIDE))),
  );
  yawEl.textContent = `${state.yaw}°`;
  draw();
}
const STEP = 22.5;
const rotate = (dir: number) => turn && setYaw(state.yaw + dir * STEP);
$<HTMLButtonElement>('#rot-l').onclick = () => rotate(1);
$<HTMLButtonElement>('#rot-r').onclick = () => rotate(-1);
const stage = $<HTMLCanvasElement>('#stage');
let dragX: number | null = null;
stage.addEventListener('pointerdown', (e) => {
  if (!turn) return;
  dragX = e.clientX;
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  const steps = Math.trunc((e.clientX - dragX) / 24);
  if (!steps) return;
  dragX += steps * 24;
  rotate(-steps); // drag ke kanan = karakter berputar ke kanan (searah jarum jam dari atas)
});
stage.addEventListener('pointerup', () => (dragX = null));
stage.addEventListener('pointercancel', () => (dragX = null));
if (!turn) $<HTMLElement>('#turn').hidden = true;

function paint() {
  view.draw(grid, state.mode, state.sockets);
  for (const a of Object.values(state.auras)) a.draw(view.ctx, grid, view.cellW, view.cellH, view.background);
  state.rune?.draw(view.ctx, grid, view.cellW, view.cellH, view.background);
}
function compose() {
  const mirror = state.yaw > 0 && state.yaw < 180;
  const src = isSide() || !turn ? sprite : turnViews.get(mirror || state.yaw === 180 ? -state.yaw : state.yaw)!;
  const f = src.file;
  const [ox, oy] = f.origin ?? [f.cols / 2, f.rows];
  const dx = Math.round(cols / 2 - (mirror ? f.cols - ox : ox));
  const dy = Math.round((file.origin?.[1] ?? file.rows) - oy);
  // View putar: beberapa frame idle (napas) dengan fps sendiri; waktu diturunkan dari frame hero.
  const [clip, frame] = src === sprite ? [state.clip, state.frame] : ['idle', Math.floor((state.frame * f.fps) / file.fps)];
  composeFrame(src, grid, clip, frame, activeLayers(f, state.equip), mirror, dx, dy);
  for (const slot of Object.keys(state.auras)) {
    const layer = state.equip[slot];
    auraSpawn[slot] = layer ? alongEdge(grid, layer) : null;
  }
}
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
    // Sprite berganti di fps bake; partikel rune/aura diupdate tiap rAF supaya halus.
    state.rune?.update(dt, alongBlade(grid.blade));
    for (const [slot, a] of Object.entries(state.auras)) a.update(dt, auraSpawn[slot] ?? null);
    if (changed || state.rune || Object.keys(state.auras).length) paint();
  }
  requestAnimationFrame(tick);
}
draw();
requestAnimationFrame(tick);

const frames = Object.values(file.layers).reduce((n, l) => n + Object.values(l.clips).reduce((m, f) => m + f.length, 0), 0);
info.textContent = `${file.cols}×${file.rows} sel · ${file.fps} fps · ${frames} frame total · ${(text.length / 1024).toFixed(0)} KB JSON (sebelum gzip)`;
