// Player produksi: memutar hasil bake (.bake) sebagai teks di canvas. Tanpa Three.js.
import { loadBake, type BakeFile, type TurnFile } from '../shared/format';
import { activeLayers, composeFrame, createGrid, decodeSprite, type Sprite } from '../shared/compose';
import { AsciiCanvas, type ColorMode } from '../shared/ascii-canvas';
import { AURAS, RUNES, RuneEmitter, alongBlade, alongEdge, type AuraKey, type RuneKey, type Spawn } from '../shared/runes';
import { BLADE_MATERIALS, DYEABLE, DYES, MATERIALS, type MaterialKey } from '../shared/materials';
import { SLOTS, itemText } from '../shared/items';
import { drawIcon, layerParts } from '../shared/icons';
import { loadLoadout, materialsFor, saveLoadout } from '../shared/loadout';

const MODEL = new URLSearchParams(location.search).get('model') ?? 'hero';
const URL_BAKE = `${import.meta.env.BASE_URL}baked/${MODEL}.bake`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const info = $<HTMLElement>('#info');

// `<model>-turn.bake` (opsional) = 16 arah idle napas (4 frame) untuk memutar karakter. Di portfolio cukup dimuat di Tavern.
const [main, turnBake] = await Promise.all([loadBake<BakeFile>(URL_BAKE), loadBake<TurnFile>(URL_BAKE.replace(/\.bake$/, '-turn.bake'))]);
if (!main) throw new Error(`${URL_BAKE} tidak ada. Bake dulu lewat /bake.html.`);
const file = main.data;
const turn = turnBake?.data ?? null;
await document.fonts.load('700 10px "JetBrains Mono"');

const sprite = decodeSprite(file, main.planes);
// yaw (-180..180] → sprite. 16 arah di-bake semua (tanpa mirror) supaya item satu sisi tidak pindah sisi.
const normYaw = (y: number) => {
  const n = ((((y + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
};
const turnViews = new Map<number, Sprite>((turn?.views ?? []).map((v) => [normYaw(v.yaw ?? 0), decodeSprite(v, turnBake!.planes)]));
// Grid cukup lebar untuk semua arah; tiap file disejajarkan lewat origin (titik antara kaki).
const cols = Math.max(file.cols, ...(turn?.views ?? []).map((v) => v.cols));
const grid = createGrid(cols, file.rows);
const view = new AsciiCanvas($<HTMLCanvasElement>('#stage'), file.cellAspect);
view.resize(cols, file.rows);
const SIDE = file.facing === 'right' ? -90 : 90;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Kustomisasi di sini (Tavern) disimpan sebagai loadout, Home memakai loadout yang sama.
const lo = loadLoadout(file);
const save = () => saveLoadout(lo);
const state = {
  clip: 'idle',
  /** arah kamera (derajat, kelipatan 22,5). -90 = hadap kanan, 90 = hadap kiri, 0 = depan. */
  yaw: SIDE,
  mode: 'material' as ColorMode,
  sockets: false,
  equip: lo.equip,
  playing: !reducedMotion,
  rune: null as RuneEmitter | null,
  /** aura per slot; partikel lahir di tepi silhouette item yang dipasang di slot itu. */
  auras: {} as Record<string, RuneEmitter>,
  frame: 0,
};
// Titik spawn aura per slot, dihitung ulang tiap compose (frame/equipment/arah berganti).
const auraSpawn: Record<string, Spawn> = {};

// ── Inventory ────────────────────────────────────────────────────────────────
// Tiap varian equipment = satu layer bake dengan `slot`. Ganti equipment = ganti daftar layer yang
// di-compose, tanpa decode ulang. Ikon item = layer itu sendiri (lihat icons.ts).
const items = Object.entries(file.layers).filter(([, l]) => l.slot).map(([k]) => k);
const slotOf = (key: string) => file.layers[key].slot!;
const slotLabel = (slot: string) => SLOTS.find((s) => s.key === slot)?.label ?? slot;
const text = (key: string) => itemText(key, file.layers[key].label);
let filter: string | null = null;
let selected: string | null = state.equip.weapon ?? items[0];
/** item/slot yang sedang di-drag (dataTransfer tidak bisa dibaca saat dragover). */
let dragging: { item?: string; fromSlot?: string } | null = null;

const look = () => ({ parts: file.parts, ramp: file.ramp, materials: materialsFor(file, lo) });
const applyLook = () => {
  view.setLook(look());
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]').forEach((c) => drawIcon(c, sprite, c.dataset.icon!, look(), +c.dataset.box!));
};
const icon = (key: string, box: number) => `<canvas data-icon="${key}" data-box="${box}" aria-hidden="true"></canvas>`;
const paintIcons = (root: HTMLElement) =>
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]').forEach((c) => drawIcon(c, sprite, c.dataset.icon!, look(), +c.dataset.box!));

function equip(key: string) {
  state.equip[slotOf(key)] = key;
  changed();
}
function unequip(slot: string) {
  state.equip[slot] = null;
  changed();
}
function changed() {
  save();
  renderSlots();
  renderBag();
  renderDetail();
  draw();
}

const SLOT_SIDE = { 'slots-l': ['helmet', 'shoulder', 'torso'], 'slots-r': ['weapon', 'legs', 'feet'] };
function renderSlots() {
  for (const [id, slots] of Object.entries(SLOT_SIDE)) {
    const el = $<HTMLElement>(`#${id}`);
    el.innerHTML = slots
      .filter((slot) => slot in state.equip)
      .map((slot) => {
        const k = state.equip[slot];
        const name = k ? text(k).name : 'empty';
        return `<button class="slot" data-slot="${slot}" draggable="${!!k}" aria-pressed="${filter === slot}" aria-label="${slotLabel(slot)}: ${name}">
          <span class="slot-label">${slotLabel(slot)}</span>${k ? icon(k, 64) : '<span class="empty">—</span>'}</button>`;
      })
      .join('');
    paintIcons(el);
  }
}

const bagEl = $<HTMLElement>('#bag');
function renderBag() {
  const list = items.filter((k) => !filter || slotOf(k) === filter);
  bagEl.innerHTML = list
    .map((k) => {
      const worn = state.equip[slotOf(k)] === k;
      return `<li><button class="item${worn ? ' worn' : ''}" data-item="${k}" draggable="true" aria-pressed="${selected === k}"
        aria-label="${text(k).name}${worn ? ' (equipped)' : ''}">${icon(k, 52)}${worn ? '<span class="badge">E</span>' : ''}</button></li>`;
    })
    .join('');
  paintIcons(bagEl);
}

const filterEl = $<HTMLElement>('#bag-filter');
function renderFilter() {
  filterEl.innerHTML = [['', 'All'], ...SLOTS.filter((s) => s.key in state.equip).map((s) => [s.key, s.label])]
    .map(([k, label]) => `<button data-filter="${k}" aria-pressed="${(filter ?? '') === k}">${label}</button>`)
    .join('');
}
filterEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]');
  if (!b) return;
  filter = b.dataset.filter || null;
  renderFilter();
  renderSlots();
  renderBag();
});

const detailEl = $<HTMLElement>('#detail');
const choice = (attr: string, value: string, label: string, on: boolean, extra = '') =>
  `<button data-${attr}="${value}" aria-pressed="${on}" ${extra}>${label}</button>`;
function renderDetail() {
  if (!selected) {
    detailEl.innerHTML = '<p class="muted">Select an item.</p>';
    return;
  }
  const k = selected;
  const t = text(k);
  const slot = slotOf(k);
  const worn = state.equip[slot] === k;
  const parts = layerParts(sprite, k);
  let html = `<div class="detail-icon">${icon(k, 180)}</div>
    <h2 class="item-name">${t.name}</h2>
    <p class="muted">${t.kind || slotLabel(slot)}</p>
    <p>${t.desc}</p>
    <button class="primary" data-act="${worn ? 'off' : 'on'}">${worn ? 'Take off' : 'Equip'}</button>`;
  if (parts.includes('blade')) {
    html += `<h3>Blade material</h3><div class="row">${BLADE_MATERIALS.map((m) => choice('blade', m, MATERIALS[m].label, lo.blade === m)).join('')}</div>`;
  }
  if (!reducedMotion && slot === 'weapon') {
    html += `<h3>Rune</h3><div class="row">${choice('rune', '', 'None', !lo.rune)}${Object.entries(RUNES)
      .map(([r, d]) => choice('rune', r, d.label, lo.rune === r))
      .join('')}</div>`;
  }
  for (const part of parts.filter((p) => DYEABLE[p])) {
    const d = DYEABLE[part];
    html += `<h3>${d.label} dye</h3><div class="row" role="group" aria-label="${d.label} dye">${Object.entries(d.palette)
      .map(([key, m]) =>
        choice('dye', key, '', lo.dye[part] === key, `class="swatch" data-part="${part}" aria-label="${m.label}" title="${m.label}" style="--c:${m.colors[1]}"`),
      )
      .join('')}</div>`;
  }
  if (parts.some((p) => DYEABLE[p]?.palette === DYES)) html += '<p class="muted note">Dye colours every worn item made of the same material.</p>';
  if (!reducedMotion) {
    html += `<h3>Aura</h3><div class="row">${choice('aura', '', 'None', !lo.auras[slot])}${Object.entries(AURAS)
      .map(([a, d]) => choice('aura', a, d.label, lo.auras[slot] === a))
      .join('')}</div>`;
    if (!worn) html += '<p class="muted note">Aura and rune show once the item is equipped.</p>';
  } else {
    html += '<p class="muted note">Runes and auras are off because reduced motion is on.</p>';
  }
  detailEl.innerHTML = html;
  paintIcons(detailEl);
}
detailEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b || !selected) return;
  const slot = slotOf(selected);
  const d = b.dataset;
  if (d.act === 'on') return equip(selected);
  if (d.act === 'off') return unequip(slot);
  if (d.blade) lo.blade = d.blade as MaterialKey;
  else if (d.rune !== undefined) setRune((d.rune || null) as RuneKey | null);
  else if (d.part) lo.dye[d.part] = d.dye!;
  else if (d.aura !== undefined) setAura(slot, (d.aura || null) as AuraKey | null);
  else return;
  save();
  if (d.blade || d.part) applyLook();
  renderDetail();
  draw();
});

function select(key: string) {
  selected = key;
  bagEl.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.item === key)));
  renderDetail();
}
bagEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-item]');
  if (b) select(b.dataset.item!);
});
bagEl.addEventListener('dblclick', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-item]');
  if (!b) return;
  const k = b.dataset.item!;
  if (state.equip[slotOf(k)] === k) unequip(slotOf(k));
  else equip(k);
});
bagEl.addEventListener('keydown', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-item]');
  if (!b || e.key !== 'Enter') return;
  e.preventDefault(); // Enter = equip/lepas, bukan klik
  select(b.dataset.item!);
  const k = b.dataset.item!;
  if (state.equip[slotOf(k)] === k) unequip(slotOf(k));
  else equip(k);
  bagEl.querySelector<HTMLButtonElement>(`[data-item="${k}"]`)?.focus();
});
// Klik slot: filter bag ke slot itu + tampilkan item yang dipakai.
for (const id of Object.keys(SLOT_SIDE)) {
  $<HTMLElement>(`#${id}`).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-slot]');
    if (!b) return;
    const slot = b.dataset.slot!;
    filter = filter === slot ? null : slot;
    if (state.equip[slot]) selected = state.equip[slot];
    renderFilter();
    renderSlots();
    renderBag();
    renderDetail();
  });
}

// Drag & drop (HTML5 DnD, desktop dulu). Item → slot yang cocok / ke karakter = pakai. Slot → bag = lepas.
const highlight = (slot: string | null) =>
  document.querySelectorAll<HTMLElement>('.slot').forEach((el) => el.classList.toggle('drop-ok', el.dataset.slot === slot));
document.addEventListener('dragstart', (e) => {
  const t = e.target as HTMLElement;
  const item = t.closest<HTMLElement>('[data-item]')?.dataset.item;
  const fromSlot = t.closest<HTMLElement>('.slot')?.dataset.slot;
  if (!item && !(fromSlot && state.equip[fromSlot])) return;
  dragging = item ? { item } : { fromSlot };
  e.dataTransfer!.setData('text/plain', item ?? state.equip[fromSlot!]!);
  e.dataTransfer!.effectAllowed = 'move';
  if (item) highlight(slotOf(item));
});
document.addEventListener('dragend', () => {
  dragging = null;
  highlight(null);
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
});
/** target drop yang valid untuk drag saat ini, atau null. */
function dropTarget(t: HTMLElement): HTMLElement | null {
  if (!dragging) return null;
  if (dragging.item) {
    const slot = t.closest<HTMLElement>('.slot');
    if (slot) return slot.dataset.slot === slotOf(dragging.item) ? slot : null;
    return t.closest<HTMLElement>('.stage-wrap');
  }
  return t.closest<HTMLElement>('.bag, .bag-head, .hint');
}
document.addEventListener('dragover', (e) => {
  const target = dropTarget(e.target as HTMLElement);
  document.querySelectorAll('.drag-over').forEach((el) => el !== target && el.classList.remove('drag-over'));
  if (!target) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  target.classList.add('drag-over');
});
document.addEventListener('drop', (e) => {
  const target = dropTarget(e.target as HTMLElement);
  if (!target || !dragging) return;
  e.preventDefault();
  target.classList.remove('drag-over');
  highlight(null);
  if (dragging.item) {
    selected = dragging.item;
    equip(dragging.item);
  } else if (dragging.fromSlot) {
    unequip(dragging.fromSlot);
  }
});

function setAura(slot: string, aura: AuraKey | null) {
  if (aura) state.auras[slot] = new RuneEmitter(AURAS[aura]);
  else delete state.auras[slot];
  if (aura) lo.auras[slot] = aura;
  else delete lo.auras[slot];
}
function setRune(r: RuneKey | null) {
  lo.rune = r;
  state.rune = r && !reducedMotion ? new RuneEmitter(RUNES[r]) : null;
}
if (!reducedMotion) for (const [slot, aura] of Object.entries(lo.auras)) setAura(slot, aura);
setRune(lo.rune);
view.setLook(look());
renderFilter();
renderSlots();
renderBag();
renderDetail();

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
  // hero.bake (animasi penuh) hanya di arah bake-nya, plus saat berjalan ke arah sebaliknya (mirror, seperti
  // game 2D). Arah lain, termasuk sisi sebaliknya saat idle, memakai view putar supaya tidak ada lompatan sisi.
  const tv = turn && turnViews.get(state.yaw);
  const useHero = !tv || state.yaw === SIDE || (isSide() && state.clip !== 'idle');
  const mirror = useHero && state.yaw === -SIDE;
  const src = useHero ? sprite : tv;
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
info.textContent = `${file.cols}×${file.rows} sel · ${file.fps} fps · ${frames} frame total · ` +
  [main, turnBake].filter((b) => b?.bytes).map((b, i) => ` · ${i ? 'turn' : 'hero'} ${(b!.bytes / 1024).toFixed(0)} KB`).join('');
