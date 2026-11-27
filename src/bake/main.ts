import * as THREE from 'three';
import { bake, loadModel, type BakeParams } from './bake';
import { PRESETS } from './presets';

const query = new URLSearchParams(location.search);
const modelKey = query.get('model') ?? 'hero';
// `?o={...}` menimpa field preset sebelum model dimuat (dipakai untuk tuning posisi aksesori).
const preset = PRESETS[modelKey] && { ...PRESETS[modelKey], ...JSON.parse(query.get('o') ?? '{}') };
if (!preset) throw new Error(`Preset model "${modelKey}" tidak ada. Pilihan: ${Object.keys(PRESETS).join(', ')}`);
import { packBake, type BakeFile, type TurnFile } from '../shared/format';
import { activeLayers, composeFrame, createGrid, decodeSprite, defaultEquipment } from '../shared/compose';
import { AsciiCanvas } from '../shared/ascii-canvas';
import { lookFor } from '../shared/materials';

// Parameter yang bisa diubah dari form. Sisanya (layer, clip, mesh) di presets.ts.
const FIELDS: (keyof BakeParams)[] = ['cols', 'rows', 'fps', 'yaw', 'pitch', 'sub', 'albedo', 'minLight', 'gamma', 'sharpness', 'minCoverage', 'ambient', 'keyLight', 'rimLight'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('params');
const status = $('status');
const preview = $<HTMLCanvasElement>('preview');
const canvas = $<HTMLCanvasElement>('three');

for (const f of FIELDS) {
  form.insertAdjacentHTML('beforeend', `<label for="f-${f}">${f}</label><input id="f-${f}" name="${f}" type="number" step="any" value="${preset[f]}">`);
}
const readParams = (): BakeParams => {
  const p: BakeParams = { ...preset };
  for (const f of FIELDS) (p as unknown as Record<string, number>)[f] = Number((form.elements.namedItem(f) as HTMLInputElement).value);
  return p;
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(240, 360, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Satu arah = BakeFile; banyak arah (`views`) = TurnFile.
let result: BakeFile | TurnFile | null = null;
const ctx = await loadModel(preset, renderer);
$('save').textContent = `Simpan ke public/baked/${modelKey}.bake`;
status.textContent = `Model ${modelKey} siap. Clip: ${ctx.animations.length}, mesh: ${ctx.meshes.size}.`;

// Preview 3D: layer tanpa slot + varian pertama tiap slot (varian lain saling tumpuk).
function showLayers(p: BakeParams, keys?: string[]) {
  const seen = new Set<string>();
  keys ??= Object.entries(p.layers)
    .filter(([, l]) => !l.slot || (!seen.has(l.slot) && seen.add(l.slot)))
    .map(([k]) => k);
  const show = new Set(keys.flatMap((k) => Object.values(p.layers[k].parts).flat()));
  for (const [name, m] of ctx.meshes) m.visible = show.has(name) && !p.hidden.includes(name);
}

async function run(p = readParams()) {
  $<HTMLButtonElement>('bake').disabled = true;
  const t0 = performance.now();
  const files = await bake(ctx, p, (msg) => (status.textContent = msg));
  result = p.views?.length ? { views: files } : files[0];
  const first = files.find((f) => f.yaw === p.yaw) ?? files[0];
  const sprite = decodeSprite(first);
  const grid = createGrid(first.cols, first.rows);
  composeFrame(sprite, grid, 'idle', 0, activeLayers(first, defaultEquipment(first)), false);
  const ac = new AsciiCanvas(preview, first.cellAspect);
  ac.setLook({ parts: first.parts, ramp: first.ramp, materials: lookFor(first.parts) });
  ac.resize(first.cols, first.rows);
  ac.draw(grid, 'material', true);
  // Render 3D pose idle frame 0 dengan framing yang sama, sebagai pembanding.
  showLayers(p);
  ctx.mixer.stopAllAction();
  ctx.mixer.clipAction(ctx.animations.find((a) => a.name === p.clips.idle)!).reset().play();
  ctx.mixer.setTime(0);
  const h = 360;
  renderer.setSize(Math.round((h * first.cols * first.cellAspect) / first.rows), h, false);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${h}px`;
  renderer.render(ctx.scene, ctx.camera);
  const json = JSON.stringify(result);
  status.textContent = `Selesai ${((performance.now() - t0) / 1000).toFixed(1)} dtk · grid ${first.cols}×${first.rows} · ${files.length} arah · ${(json.length / 1024).toFixed(1)} KB JSON`;
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
  a.download = `${modelKey}.json`;
  a.click();
};
$('save').onclick = async () => {
  if (!result) return;
  const res = await fetch(`/__bake/save?name=${modelKey}`, { method: 'POST', body: packBake(result) });
  status.textContent = res.ok ? `Tersimpan ke public/baked/${modelKey}.bake` : `Gagal simpan: ${res.status}`;
};

// Untuk bake headless (Playwright): window.__bake(overrides) → BakeFile
// Daftar nama mesh (termasuk aksesori `<name>:<material>`) untuk mengisi preset.
(window as unknown as Record<string, unknown>).__meshes = [...ctx.meshes.keys()];
(window as unknown as Record<string, unknown>).__bake = (o: Partial<BakeParams> = {}) => run({ ...readParams(), ...o });
// Inspeksi 3D (setelah bake, framing sama): window.__view('walk', 0.5) → dataURL render pose itu.
(window as unknown as Record<string, unknown>).__view = (clip: string, t: number, layers?: string[]) => {
  const p = readParams();
  showLayers(p, layers);
  ctx.mixer.stopAllAction();
  ctx.mixer.clipAction(ctx.animations.find((a) => a.name === (p.clips[clip] ?? clip))!).reset().play();
  ctx.mixer.setTime(t);
  renderer.render(ctx.scene, ctx.camera);
  return canvas.toDataURL();
};
// Posisi tulang (ruang model, sebelum animasi) untuk merancang aset prosedural: window.__bones() → {nama: [x,y,z]}.
const rest = new Map<string, number[]>();
ctx.root.updateMatrixWorld(true);
ctx.root.traverse((o) => {
  if ((o as THREE.Bone).isBone) rest.set(o.name, ctx.root.worldToLocal(o.getWorldPosition(new THREE.Vector3())).toArray());
});
(window as unknown as Record<string, unknown>).__bones = () => Object.fromEntries(rest);
// Inspeksi dekat satu tulang (mis. cek helm menembus kepala): window.__closeup('Head', yaw, layers?, size?, clip?, t?) → dataURL.
// clip/t opsional: cek pose lain (mis. jubah saat berjalan), kain ikut disimulasikan.
(window as unknown as Record<string, unknown>).__closeup = (bone: string, yaw: number, layers?: string[], size = 0.5, clip = 'idle', t = 0) => {
  const p = readParams();
  showLayers(p, layers);
  ctx.mixer.stopAllAction();
  ctx.mixer.clipAction(ctx.animations.find((a) => a.name === p.clips[clip])!).reset().play();
  ctx.mixer.setTime(t);
  ctx.root.updateMatrixWorld(true);
  for (const c of ctx.cloth) c.apply(p.clips[clip], t);
  const target = ctx.root.getObjectByName(bone)!.getWorldPosition(new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.01, 20);
  const r = (yaw * Math.PI) / 180;
  cam.position.set(target.x - Math.sin(r) * 5, target.y, target.z + Math.cos(r) * 5);
  cam.lookAt(target);
  const prev = renderer.getSize(new THREE.Vector2());
  renderer.setSize(400, 400, false);
  const lights = [new THREE.HemisphereLight(0xffffff, 0x404040, 2.5), new THREE.DirectionalLight(0xffffff, 2)];
  lights[1].position.copy(cam.position).add(new THREE.Vector3(0, 3, 0));
  ctx.scene.add(...lights);
  renderer.render(ctx.scene, cam);
  ctx.scene.remove(...lights);
  const url = canvas.toDataURL();
  renderer.setSize(prev.x, prev.y, false);
  return url;
};
