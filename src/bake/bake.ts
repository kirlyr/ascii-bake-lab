// Inti bake: render model 3D → grid sel (shade level + part id + depth) per layer per frame.
// Three.js hanya dipakai di sini (dev). Output = BakeFile JSON v2.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { b64encode, EMPTY_DEPTH, MAX_PARTS, MAX_SHADES, packCell, type BakeFile, type BladeSocket, type FrameData, type SocketPoint } from '../shared/format';
import { buildGlyphSet, makeMatcher, DIMS, REG_X, REG_Y } from './glyphs';

export interface LayerDef {
  label: string;
  /** part → mesh. Part menentukan material di runtime (lihat src/shared/materials.ts). */
  parts: Record<string, string[]>;
}

/**
 * Bagi satu mesh senjata jadi dua part di sepanjang sumbu lokalnya (mis. hilt | blade),
 * sekaligus sumber socket blade: pangkal = titik potong, ujung = ujung sumbu.
 */
export interface BladeSplit {
  mesh: string;
  axis: 'x' | 'y' | 'z';
  /** posisi potong di koordinat lokal mesh. */
  at: number;
  /** part di sisi < at dan >= at. Ujung blade = sisi `above`. */
  below: string;
  above: string;
}

/**
 * Aksesori (helm, pedang, dll.) dari file terpisah yang dipasang ke tulang model saat bake.
 * Mesh-nya terdaftar sebagai `<name>:<nama material>`, jadi part bisa dipetakan per material.
 */
export interface Attachment {
  name: string;
  url: string;
  /** nama tulang, tanpa ':' (mis. `mixamorigHead`). */
  bone: string;
  /** offset di ruang tulang. rotation dalam derajat (XYZ). */
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

const layerMeshes = (l: LayerDef) => Object.values(l.parts).flat();

export interface BakeParams {
  modelUrl: string;
  modelName: string;
  rows: number;
  cellAspect: number;
  /** 0 = otomatis dari lebar silhouette. */
  cols: number;
  /** sub-pixel per sel (horizontal). Vertikal = SUB / cellAspect. */
  sub: number;
  fps: number;
  /** derajat. 0 = kamera di depan model, -90 = samping (model hadap kanan). */
  yaw: number;
  /** arah hadap model di hasil bake (tergantung orientasi model + yaw). */
  facing: 'left' | 'right';
  /** derajat, kamera sedikit dari atas. */
  pitch: number;
  clips: Record<string, string>; // nama output → nama clip di glb
  layers: Record<string, LayerDef>;
  blade?: BladeSplit;
  /** clip dari file terpisah: nama clip → `url` (clip pertama) atau `url#NamaClip`. */
  animations?: Record<string, string>;
  attachments?: Attachment[];
  /** mesh yang selalu disembunyikan. */
  hidden: string[];
  /** ramp gelap → terang. Index glyph hasil shape matching = shade level. */
  charset: string;
  /** kecerahan minimum area tertutup (0..1), supaya bagian gelap tetap rapat. */
  minLight: number;
  gamma: number;
  /** eksponen kontras shape vector. >1 = tepi lebih tajam. */
  sharpness: number;
  /** cakupan minimum sel (0..1) agar dianggap terisi. */
  minCoverage: number;
  /** intensitas lampu: ambient (hemisphere), key (depan-atas), rim (belakang). */
  ambient: number;
  keyLight: number;
  rimLight: number;
  /** padding grid di sekitar bounding box, dalam sel. */
  pad: number;
}

export const DEFAULT_PARAMS: BakeParams = {
  modelUrl: '/assets/models/kaykit/Knight.glb',
  modelName: 'KayKit Adventurers 1.0 / Knight',
  cols: 0,
  rows: 60,
  cellAspect: 0.5,
  sub: 6,
  fps: 12,
  yaw: -90,
  facing: 'right',
  pitch: 8,
  clips: { idle: 'Idle', walk: 'Walking_A' },
  layers: {
    body: {
      label: 'Badan',
      parts: {
        armor: ['Knight_Body', 'Knight_ArmLeft', 'Knight_ArmRight', 'Knight_LegLeft', 'Knight_LegRight'],
        skin: ['Knight_Head'],
        cloth: ['Knight_Cape'],
      },
    },
    helmet: { label: 'Helm', parts: { helmet: ['Knight_Helmet'] } },
    weapon: { label: 'Senjata', parts: { blade: ['1H_Sword'] } },
    shield: { label: 'Perisai', parts: { shield: ['Round_Shield'] } },
  },
  // Pedang KayKit: sumbu lokal +Y, pommel -0.37, grip di 0, guard 0.15..0.25, ujung 1.41.
  blade: { mesh: '1H_Sword', axis: 'y', at: 0.26, below: 'hilt', above: 'blade' },
  hidden: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'],
  // Ramp density gelap → terang. Shape vector tetap memilih di antara glyph ini,
  // jadi tepi tetap mengikuti silhouette. Charset penuh terlalu ramai (lihat README).
  charset: '.:-=+*#%@',
  minLight: 0.22,
  gamma: 1.1,
  sharpness: 2.0,
  minCoverage: 0.12,
  ambient: 0.5,
  keyLight: 3.5,
  rimLight: 1.2,
  pad: 1,
};

const depthVert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying float vViewZ;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewZ = -mvPosition.z;
}`;
const depthFrag = /* glsl */ `
uniform float uNear;
uniform float uFar;
varying float vViewZ;
void main() {
  gl_FragColor = vec4(clamp((vViewZ - uNear) / (uFar - uNear), 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

function makeDepthMaterial(near: number, far: number) {
  return new THREE.ShaderMaterial({
    vertexShader: depthVert,
    fragmentShader: depthFrag,
    uniforms: { uNear: { value: near }, uFar: { value: far } },
  });
}

// Pass part id: tiap mesh dapat material ini dengan id-nya sendiri. Output = (id + 1) / 255,
// 0 = kosong. Mesh senjata yang di-split memilih id berdasarkan posisi lokal di sumbu.
const idVert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform vec3 uAxis;
varying float vT;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  vT = dot(position, uAxis);
  #include <skinning_vertex>
  #include <project_vertex>
}`;
const idFrag = /* glsl */ `
uniform float uBelow;
uniform float uAbove;
uniform float uAt;
varying float vT;
void main() {
  float id = vT < uAt ? uBelow : uAbove;
  gl_FragColor = vec4((id + 1.0) / 255.0, 0.0, 0.0, 1.0);
}`;

function makeIdMaterial(below: number, above = below, axis = new THREE.Vector3(0, 1, 0), at = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: idVert,
    fragmentShader: idFrag,
    uniforms: { uAxis: { value: axis }, uAt: { value: at }, uBelow: { value: below }, uAbove: { value: above } },
  });
}

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export interface BakeContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  animations: THREE.AnimationClip[];
  meshes: Map<string, THREE.Object3D>;
}

const loadAny = async (url: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> => {
  if (/\.fbx$/i.test(url)) {
    const g = await new FBXLoader().loadAsync(url);
    return { scene: g, animations: g.animations };
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  return { scene: gltf.scene, animations: gltf.animations };
};

/** Nama tulang dibandingkan tanpa karakter non-alfanumerik (GLTF/FBX loader membuang ':' secara berbeda). */
const norm = (n: string) => n.replace(/[^a-z0-9]/gi, '').toLowerCase();

export async function loadModel(p: BakeParams, renderer: THREE.WebGLRenderer): Promise<BakeContext> {
  const model = await loadAny(p.modelUrl);
  const scene = new THREE.Scene();
  const root = model.scene;
  scene.add(root);
  const meshes = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.set(o.name, o);
  });

  const animations = [...model.animations];
  for (const [name, ref] of Object.entries(p.animations ?? {})) {
    // `url#NamaClip` memilih clip tertentu; tanpa `#` = clip pertama di file.
    const [url, want] = ref.split('#');
    const all = (await loadAny(url)).animations;
    const clip = (want ? all.find((c) => c.name === want) : all[0])?.clone();
    if (!clip) throw new Error(`Animasi ${ref} tidak ada`);
    clip.name = name;
    animations.push(clip);
  }

  for (const a of p.attachments ?? []) {
    let bone: THREE.Object3D | undefined;
    root.traverse((o) => {
      if (!bone && norm(o.name) === norm(a.bone)) bone = o;
    });
    if (!bone) throw new Error(`Tulang "${a.bone}" tidak ada di model`);
    const acc = (await loadAny(a.url)).scene;
    const holder = new THREE.Group();
    holder.name = a.name;
    holder.add(acc);
    holder.position.fromArray(a.position);
    holder.rotation.set(...(a.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
    holder.scale.setScalar(a.scale);
    bone.add(holder);
    acc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.name = `${a.name}:${(m.material as THREE.Material).name}`;
      meshes.set(m.name, m);
    });
  }

  return {
    renderer,
    scene,
    camera: new THREE.OrthographicCamera(),
    root,
    mixer: new THREE.AnimationMixer(root),
    animations,
    meshes,
  };
}

function setVisible(ctx: BakeContext, names: Set<string> | null) {
  for (const [name, m] of ctx.meshes) m.visible = names ? names.has(name) : true;
}

function poseAt(ctx: BakeContext, clipName: string, t: number) {
  const clip = ctx.animations.find((a) => a.name === clipName);
  if (!clip) throw new Error(`Clip "${clipName}" tidak ada di model`);
  ctx.mixer.stopAllAction();
  const action = ctx.mixer.clipAction(clip);
  action.reset().play();
  ctx.mixer.setTime(t);
  ctx.root.updateMatrixWorld(true);
  return clip;
}

function frameCount(clip: THREE.AnimationClip, fps: number) {
  return Math.max(1, Math.round(clip.duration * fps));
}

/** Pasang kamera + lampu, framing tetap untuk semua frame semua clip. */
function setupCamera(ctx: BakeContext, p: BakeParams, visible: Set<string>) {
  const yaw = THREE.MathUtils.degToRad(p.yaw);
  const pitch = THREE.MathUtils.degToRad(p.pitch);
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const cam = ctx.camera;
  cam.position.copy(dir).multiplyScalar(20);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);

  // Framing diukur dari hasil render (silhouette), bukan bounding box geometri:
  // bounding box skinned mesh KayKit terlalu longgar. Pass 1: frustum lebar.
  setVisible(ctx, visible);
  poseAt(ctx, Object.values(p.clips)[0], 0);
  const sphere = new THREE.Box3().setFromObject(ctx.root).getBoundingSphere(new THREE.Sphere());
  const R = sphere.radius * 2;
  const c0 = sphere.center.clone().applyMatrix4(cam.matrixWorldInverse);
  Object.assign(cam, { left: c0.x - R, right: c0.x + R, bottom: c0.y - R, top: c0.y + R, near: 0.01, far: 40 });
  cam.updateProjectionMatrix();

  const M = 512;
  const rt = new THREE.WebGLRenderTarget(M, M);
  const mat = makeDepthMaterial(cam.near, cam.far);
  const buf = new Uint8Array(M * M * 4);
  let x0 = M, x1 = -1, y0 = M, y1 = -1, d0 = 255, d1 = 0;
  const r = ctx.renderer;
  r.setClearColor(0x000000, 0);
  ctx.scene.overrideMaterial = mat;
  for (const clipName of Object.values(p.clips)) {
    const n = frameCount(poseAt(ctx, clipName, 0), p.fps);
    for (let i = 0; i < n; i++) {
      poseAt(ctx, clipName, i / p.fps);
      r.setRenderTarget(rt);
      r.clear();
      r.render(ctx.scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, M, M, buf);
      for (let y = 0; y < M; y++)
        for (let x = 0; x < M; x++) {
          const k = (y * M + x) * 4;
          if (!buf[k + 3]) continue;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          d0 = Math.min(d0, buf[k]); d1 = Math.max(d1, buf[k]);
        }
    }
  }
  ctx.scene.overrideMaterial = null;
  r.setRenderTarget(null);
  rt.dispose();
  mat.dispose();
  if (x1 < 0) throw new Error('Model tidak terlihat oleh kamera');

  const px = (2 * R) / M;
  const minX = cam.left + x0 * px, maxX = cam.left + (x1 + 1) * px;
  const minY = cam.bottom + y0 * px, maxY = cam.bottom + (y1 + 1) * px;
  const near = cam.near + (d0 / 255) * (cam.far - cam.near) - 0.05;
  const far = cam.near + ((d1 + 1) / 255) * (cam.far - cam.near) + 0.05;

  // Tinggi model = rows (minus padding). cols = 0 berarti lebar grid otomatis
  // mengikuti lebar silhouette; kalau diisi, grid dipaksa ke ukuran itu.
  const cellH = (maxY - minY) / (p.rows - 2 * p.pad);
  const cellW = cellH * p.cellAspect;
  const cols = p.cols > 0 ? p.cols : Math.ceil((maxX - minX) / cellW) + 2 * p.pad;
  let w = maxX - minX + 2 * p.pad * cellW;
  let h = maxY - minY + 2 * p.pad * cellH;
  const gridAspect = (cols * p.cellAspect) / p.rows;
  if (w / h > gridAspect) h = w / gridAspect;
  else w = h * gridAspect;
  const padH = p.pad * cellH;
  const cx = (minX + maxX) / 2;
  // Kaki menempel ke bawah grid supaya idle/walk sejajar.
  const bottom = minY - padH;
  cam.left = cx - w / 2;
  cam.right = cx + w / 2;
  cam.bottom = bottom;
  cam.top = bottom + h;
  cam.near = Math.max(0.01, near - 0.5);
  cam.far = far + 0.5;
  cam.updateProjectionMatrix();

  // Lampu: key dari depan-atas (sisi kamera), fill lembut, rim dari belakang.
  ctx.scene.children.filter((o) => (o as THREE.Light).isLight).forEach((l) => ctx.scene.remove(l));
  ctx.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1d12, p.ambient));
  const key = new THREE.DirectionalLight(0xffffff, p.keyLight);
  const keyDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(35));
  key.position.copy(keyDir).multiplyScalar(10).add(new THREE.Vector3(0, 8, 0));
  ctx.scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9a0, p.rimLight);
  rim.position.copy(dir).multiplyScalar(-10).add(new THREE.Vector3(0, 4, 0));
  ctx.scene.add(rim);
  return { near, far, cols };
}

interface RawCells {
  /** shape vector per sel, panjang cols*rows*DIMS */
  shape: Float32Array;
  coverage: Float32Array;
  /** part id mayoritas di sel. */
  part: Uint8Array;
  depth: Uint8Array;
}

function luma(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function sampleCells(
  p: BakeParams,
  col: Uint8Array,
  dep: Uint8Array,
  ids: Uint8Array,
  W: number,
  H: number,
  levels: { lo: number; hi: number },
): RawCells {
  const sw = p.sub;
  const sh = Math.round(p.sub / p.cellAspect);
  const n = p.cols * p.rows;
  const shape = new Float32Array(n * DIMS);
  const coverage = new Float32Array(n);
  const part = new Uint8Array(n);
  const votes = new Uint16Array(MAX_PARTS + 1);
  const depth = new Uint8Array(n).fill(EMPTY_DEPTH);
  const regCount = new Float32Array(DIMS);
  const range = Math.max(1e-3, levels.hi - levels.lo);
  for (let cy = 0; cy < p.rows; cy++) {
    for (let cx = 0; cx < p.cols; cx++) {
      const ci = cy * p.cols + cx;
      let cov = 0;
      let dmin = 255;
      regCount.fill(0);
      votes.fill(0);
      for (let sy = 0; sy < sh; sy++) {
        const py = cy * sh + sy;
        const row = H - 1 - py; // readPixels bottom-up
        const ry = Math.min(REG_Y - 1, Math.floor((sy * REG_Y) / sh));
        for (let sx = 0; sx < sw; sx++) {
          const px = cx * sw + sx;
          const rx = Math.min(REG_X - 1, Math.floor((sx * REG_X) / sw));
          const ri = ry * REG_X + rx;
          regCount[ri]++;
          const i = (row * W + px) * 4;
          if (col[i + 3] < 128) continue;
          cov++;
          votes[Math.min(MAX_PARTS, ids[i])]++;
          const lum = Math.min(1, Math.max(0, (luma(col[i], col[i + 1], col[i + 2]) - levels.lo) / range));
          shape[ci * DIMS + ri] += p.minLight + (1 - p.minLight) * Math.pow(lum, p.gamma);
          if (dep[i + 3] > 0) dmin = Math.min(dmin, dep[i]);
        }
      }
      for (let ri = 0; ri < DIMS; ri++) shape[ci * DIMS + ri] /= regCount[ri];
      coverage[ci] = cov / (sw * sh);
      if (cov > 0) {
        let best = 1;
        for (let k = 2; k <= MAX_PARTS; k++) if (votes[k] > votes[best]) best = k;
        part[ci] = best - 1;
        depth[ci] = Math.min(254, dmin);
      }
    }
  }
  return { shape, coverage, part, depth };
}

export type Progress = (msg: string) => void;

export async function bake(ctx: BakeContext, p: BakeParams, onProgress: Progress = () => {}): Promise<BakeFile> {
  const allLayerMeshes = new Set(Object.values(p.layers).flatMap(layerMeshes));
  for (const h of p.hidden) allLayerMeshes.delete(h);
  const cam0 = setupCamera(ctx, p, allLayerMeshes);
  const { near, far } = cam0;
  p = { ...p, cols: cam0.cols };
  const cam = ctx.camera;

  const glyphs = await buildGlyphSet(p.charset, 'JetBrains Mono', p.cellAspect);
  if (glyphs.chars.length > MAX_SHADES) throw new Error(`charset maksimal ${MAX_SHADES} glyph`);
  const match = makeMatcher(glyphs);

  // Part id global: urutan kemunculan di layer, plus part hasil split blade.
  const parts: string[] = [];
  const partOf = new Map<string, number>();
  const addPart = (name: string) => {
    if (!parts.includes(name)) parts.push(name);
    return parts.indexOf(name);
  };
  for (const l of Object.values(p.layers)) for (const [part, ms] of Object.entries(l.parts)) for (const m of ms) partOf.set(m, addPart(part));
  const split = p.blade && ctx.meshes.has(p.blade.mesh) ? p.blade : undefined;
  if (split) addPart(split.below), addPart(split.above);
  if (parts.length > MAX_PARTS) throw new Error(`part maksimal ${MAX_PARTS}`);

  // Material pass id per mesh. Mesh di luar layer tetap dapat id (tidak terlihat juga).
  const idMats = new Map<THREE.Object3D, THREE.ShaderMaterial>();
  for (const [name, m] of ctx.meshes) {
    const id = partOf.get(name) ?? 0;
    idMats.set(m, split?.mesh === name ? makeIdMaterial(parts.indexOf(split.below), parts.indexOf(split.above), AXES[split.axis], split.at) : makeIdMaterial(id));
  }

  // Socket blade di ruang lokal mesh: pangkal = titik potong, ujung = ujung sumbu sisi `above`.
  let bladeLocal: { base: THREE.Vector3; tip: THREE.Vector3; mesh: THREE.Object3D } | null = null;
  if (split) {
    const mesh = ctx.meshes.get(split.mesh)! as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3());
    const base = c.clone().setComponent('xyz'.indexOf(split.axis), split.at);
    const tip = c.clone().setComponent('xyz'.indexOf(split.axis), bb.max[split.axis]);
    bladeLocal = { base, tip, mesh };
  }
  const project = (v: THREE.Vector3): SocketPoint => {
    const view = v.clone().applyMatrix4(cam.matrixWorldInverse);
    const ndc = v.clone().project(cam);
    const d = Math.min(254, Math.max(0, Math.round(((-view.z - near) / (far - near)) * 255)));
    const r1 = (x: number) => Math.round(x * 10) / 10;
    return [r1(((ndc.x + 1) / 2) * p.cols), r1(((1 - ndc.y) / 2) * p.rows), d];
  };
  const bladeSocket = (): BladeSocket | undefined => {
    if (!bladeLocal) return undefined;
    const mw = bladeLocal.mesh.matrixWorld;
    return { base: project(bladeLocal.base.clone().applyMatrix4(mw)), tip: project(bladeLocal.tip.clone().applyMatrix4(mw)) };
  };

  const sw = p.sub;
  const sh = Math.round(p.sub / p.cellAspect);
  const W = p.cols * sw;
  const H = p.rows * sh;
  const colorRT = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const depthRT = new THREE.WebGLRenderTarget(W, H);
  const idRT = new THREE.WebGLRenderTarget(W, H);
  // Normalisasi depth ke rentang model (bukan near/far kamera) supaya 8-bit cukup presisi.
  const depthMat = makeDepthMaterial(near, far);

  const r = ctx.renderer;
  const prevClear = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  r.setClearColor(0x000000, 0);
  const colBuf = new Uint8Array(W * H * 4);
  const depBuf = new Uint8Array(W * H * 4);
  const idBuf = new Uint8Array(W * H * 4);

  const pass = (rt: THREE.WebGLRenderTarget, buf: Uint8Array) => {
    r.setRenderTarget(rt);
    r.clear();
    r.render(ctx.scene, cam);
    r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  };
  const render = () => {
    ctx.scene.overrideMaterial = null;
    pass(colorRT, colBuf);
    ctx.scene.overrideMaterial = depthMat;
    pass(depthRT, depBuf);
    ctx.scene.overrideMaterial = null;
    const orig = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    for (const [m, mat] of idMats) {
      const mesh = m as THREE.Mesh;
      orig.set(mesh, mesh.material);
      mesh.material = mat;
    }
    pass(idRT, idBuf);
    for (const [mesh, mat] of orig) mesh.material = mat;
    r.setRenderTarget(null);
  };

  // Auto-levels dari pose pertama (semua layer), supaya kontras konsisten antar frame.
  setVisible(ctx, allLayerMeshes);
  poseAt(ctx, Object.values(p.clips)[0], 0);
  render();
  const lums: number[] = [];
  for (let i = 0; i < W * H; i++) if (colBuf[i * 4 + 3] >= 128) lums.push(luma(colBuf[i * 4], colBuf[i * 4 + 1], colBuf[i * 4 + 2]));
  lums.sort((a, b) => a - b);
  const levels = { lo: lums[Math.floor(lums.length * 0.02)] ?? 0, hi: lums[Math.floor(lums.length * 0.98)] ?? 1 };

  const out: BakeFile = {
    version: 2,
    model: p.modelName,
    cols: p.cols,
    rows: p.rows,
    cellAspect: p.cellAspect,
    fps: p.fps,
    facing: p.facing,
    ramp: glyphs.chars.join(''),
    parts,
    layers: {},
    bakedAt: new Date().toISOString(),
    params: { ...p, modelUrl: undefined, layers: undefined },
  };

  for (const [layerKey, layer] of Object.entries(p.layers)) {
    const meshes = new Set(layerMeshes(layer));
    out.layers[layerKey] = { label: layer.label, clips: {} };
    setVisible(ctx, meshes);
    const withBlade = !!split && meshes.has(split.mesh);
    for (const [clipKey, clipName] of Object.entries(p.clips)) {
      const clip = poseAt(ctx, clipName, 0);
      const n = frameCount(clip, p.fps);
      const frames: FrameData[] = (out.layers[layerKey].clips[clipKey] = []);
      for (let f = 0; f < n; f++) {
        poseAt(ctx, clipName, f / p.fps);
        render();
        const cells = sampleCells(p, colBuf, depBuf, idBuf, W, H, levels);
        const shade = new Uint8Array(p.cols * p.rows);
        const v = new Float32Array(DIMS);
        for (let ci = 0; ci < shade.length; ci++) {
          if (cells.coverage[ci] < p.minCoverage) {
            cells.depth[ci] = EMPTY_DEPTH;
            continue;
          }
          let m = 0;
          for (let d = 0; d < DIMS; d++) m = Math.max(m, cells.shape[ci * DIMS + d]);
          for (let d = 0; d < DIMS; d++) v[d] = m > 0 ? Math.pow(cells.shape[ci * DIMS + d] / m, p.sharpness) * m : 0;
          shade[ci] = match(v);
        }
        const frame = cropFrame(p, shade, cells);
        if (withBlade) frame.blade = bladeSocket();
        frames.push(frame);
        if (f === 0) onProgress(`${layer.label} / ${clipKey}: ${n} frame`);
        await new Promise((res) => setTimeout(res, 0));
      }
    }
  }
  r.setClearColor(prevClear, prevAlpha);
  colorRT.dispose();
  depthRT.dispose();
  idRT.dispose();
  depthMat.dispose();
  for (const m of idMats.values()) m.dispose();
  return out;
}

function cropFrame(p: BakeParams, shade: Uint8Array, cells: RawCells): FrameData {
  let x0 = p.cols, y0 = p.rows, x1 = -1, y1 = -1;
  for (let y = 0; y < p.rows; y++)
    for (let x = 0; x < p.cols; x++)
      if (cells.depth[y * p.cols + x] !== EMPTY_DEPTH) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0, cell: '', depth: '' };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const depth = new Uint8Array(w * h);
  const cell = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ci = (y0 + y) * p.cols + (x0 + x);
      depth[y * w + x] = cells.depth[ci];
      cell[y * w + x] = cells.depth[ci] === EMPTY_DEPTH ? 0 : packCell(cells.part[ci], shade[ci]);
    }
  return { x: x0, y: y0, w, h, cell: b64encode(cell), depth: b64encode(depth) };
}
