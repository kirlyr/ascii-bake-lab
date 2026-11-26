import * as THREE from 'three';
import modelUrl from '../../assets/models/kaykit/Knight.glb?url';
import { bake, loadModel, DEFAULT_PARAMS, type BakeParams } from './bake';
import type { BakeFile } from '../shared/format';
import { composeFrame, createGrid, decodeSprite } from '../shared/compose';
import { AsciiCanvas } from '../shared/ascii-canvas';

// Parameter yang bisa diubah dari form. Sisanya (layer, clip, mesh) di DEFAULT_PARAMS.
const FIELDS: (keyof BakeParams)[] = ['cols', 'rows', 'fps', 'yaw', 'pitch', 'sub', 'minLight', 'gamma', 'sharpness', 'minCoverage', 'paletteSize', 'ambient', 'keyLight', 'rimLight'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('params');
const status = $('status');
const preview = $<HTMLCanvasElement>('preview');
const canvas = $<HTMLCanvasElement>('three');

for (const f of FIELDS) {
  form.insertAdjacentHTML('beforeend', `<label for="f-${f}">${f}</label><input id="f-${f}" name="${f}" type="number" step="any" value="${DEFAULT_PARAMS[f]}">`);
}
const readParams = (): BakeParams => {
  const p: BakeParams = { ...DEFAULT_PARAMS, modelUrl };
  for (const f of FIELDS) (p as unknown as Record<string, number>)[f] = Number((form.elements.namedItem(f) as HTMLInputElement).value);
  return p;
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(240, 360, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

let result: BakeFile | null = null;
const ctx = await loadModel(modelUrl, renderer);
status.textContent = `Model siap. Clip: ${ctx.animations.length}, mesh: ${ctx.meshes.size}.`;

async function run(p = readParams()) {
  $<HTMLButtonElement>('bake').disabled = true;
  const t0 = performance.now();
  result = await bake(ctx, p, (msg) => (status.textContent = msg));
  const sprite = decodeSprite(result);
  const grid = createGrid(result.cols, result.rows);
  composeFrame(sprite, grid, 'idle', 0, Object.keys(result.layers), false);
  const ac = new AsciiCanvas(preview, result.palette, result.cellAspect);
  ac.resize(result.cols, result.rows);
  ac.draw(grid, 'texture');
  // Render 3D pose idle frame 0 dengan framing yang sama, sebagai pembanding.
  for (const [name, m] of ctx.meshes) m.visible = !p.hidden.includes(name);
  ctx.mixer.stopAllAction();
  ctx.mixer.clipAction(ctx.animations.find((a) => a.name === p.clips.idle)!).reset().play();
  ctx.mixer.setTime(0);
  const h = 360;
  renderer.setSize(Math.round((h * result.cols * result.cellAspect) / result.rows), h, false);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${h}px`;
  renderer.render(ctx.scene, ctx.camera);
  const json = JSON.stringify(result);
  status.textContent = `Selesai ${((performance.now() - t0) / 1000).toFixed(1)} dtk · grid ${result.cols}×${result.rows} · ${(json.length / 1024).toFixed(1)} KB JSON`;
  $<HTMLButtonElement>('bake').disabled = false;
  $<HTMLButtonElement>('save').disabled = false;
  $<HTMLButtonElement>('download').disabled = false;
  return result;
}

$('bake').onclick = () => run();
$('download').onclick = () => {
  if (!result) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: 'application/json' }));
  a.download = 'knight.json';
  a.click();
};
$('save').onclick = async () => {
  if (!result) return;
  const res = await fetch('/__bake/save?name=knight', { method: 'POST', body: JSON.stringify(result) });
  status.textContent = res.ok ? 'Tersimpan ke public/baked/knight.json' : `Gagal simpan: ${res.status}`;
};

// Untuk bake headless (Playwright): window.__bake(overrides) → BakeFile
(window as unknown as Record<string, unknown>).__bake = (o: Partial<BakeParams> = {}) => run({ ...readParams(), ...o });
