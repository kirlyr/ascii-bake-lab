// Inti bake: render model 3D → grid sel (char + depth + warna) per layer per frame.
// Three.js hanya dipakai di sini (dev). Output = BakeFile JSON.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { b64encode, EMPTY_DEPTH, type BakeFile, type FrameData } from '../shared/format';
import { buildGlyphSet, makeMatcher, DIMS, REG_X, REG_Y } from './glyphs';

export interface LayerDef {
  label: string;
  meshes: string[];
}

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
  /** mesh yang selalu disembunyikan. */
  hidden: string[];
  charset: string;
  /** kecerahan minimum area tertutup (0..1), supaya bagian gelap tetap rapat. */
  minLight: number;
  gamma: number;
  /** eksponen kontras shape vector. >1 = tepi lebih tajam. */
  sharpness: number;
  /** cakupan minimum sel (0..1) agar dianggap terisi. */
  minCoverage: number;
  paletteSize: number;
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
      meshes: ['Knight_Body', 'Knight_Head', 'Knight_ArmLeft', 'Knight_ArmRight', 'Knight_LegLeft', 'Knight_LegRight', 'Knight_Cape'],
    },
    helmet: { label: 'Helm', meshes: ['Knight_Helmet'] },
    weapon: { label: 'Senjata', meshes: ['1H_Sword'] },
    shield: { label: 'Perisai', meshes: ['Round_Shield'] },
  },
  hidden: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'],
  // Ramp density gelap → terang. Shape vector tetap memilih di antara glyph ini,
  // jadi tepi tetap mengikuti silhouette. Charset penuh terlalu ramai (lihat README).
  charset: '.:-=+*#%@',
  minLight: 0.22,
  gamma: 1.1,
  sharpness: 2.0,
  minCoverage: 0.12,
  paletteSize: 32,
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

export interface BakeContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  animations: THREE.AnimationClip[];
  meshes: Map<string, THREE.Object3D>;
}

export async function loadModel(url: string, renderer: THREE.WebGLRenderer): Promise<BakeContext> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = new THREE.Scene();
  const root = gltf.scene;
  scene.add(root);
  const meshes = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.set(o.name, o);
  });
  return {
    renderer,
    scene,
    camera: new THREE.OrthographicCamera(),
    root,
    mixer: new THREE.AnimationMixer(root),
    animations: gltf.animations,
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
  rgb: Float32Array;
  depth: Uint8Array;
}

function luma(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function sampleCells(
  p: BakeParams,
  col: Uint8Array,
  dep: Uint8Array,
  W: number,
  H: number,
  levels: { lo: number; hi: number },
): RawCells {
  const sw = p.sub;
  const sh = Math.round(p.sub / p.cellAspect);
  const n = p.cols * p.rows;
  const shape = new Float32Array(n * DIMS);
  const coverage = new Float32Array(n);
  const rgb = new Float32Array(n * 3);
  const depth = new Uint8Array(n).fill(EMPTY_DEPTH);
  const regCount = new Float32Array(DIMS);
  const range = Math.max(1e-3, levels.hi - levels.lo);
  for (let cy = 0; cy < p.rows; cy++) {
    for (let cx = 0; cx < p.cols; cx++) {
      const ci = cy * p.cols + cx;
      let cov = 0;
      let r = 0, g = 0, b = 0;
      let dmin = 255;
      regCount.fill(0);
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
          r += col[i];
          g += col[i + 1];
          b += col[i + 2];
          const lum = Math.min(1, Math.max(0, (luma(col[i], col[i + 1], col[i + 2]) - levels.lo) / range));
          shape[ci * DIMS + ri] += p.minLight + (1 - p.minLight) * Math.pow(lum, p.gamma);
          if (dep[i + 3] > 0) dmin = Math.min(dmin, dep[i]);
        }
      }
      for (let ri = 0; ri < DIMS; ri++) shape[ci * DIMS + ri] /= regCount[ri];
      coverage[ci] = cov / (sw * sh);
      if (cov > 0) {
        rgb[ci * 3] = r / cov;
        rgb[ci * 3 + 1] = g / cov;
        rgb[ci * 3 + 2] = b / cov;
        depth[ci] = Math.min(254, dmin);
      }
    }
  }
  return { shape, coverage, rgb, depth };
}

/** k-means sederhana di ruang sRGB untuk palet warna bersama. */
function buildPalette(samples: number[], k: number): number[][] {
  const hist = new Map<number, number>();
  for (let i = 0; i < samples.length; i += 3) {
    const key = ((samples[i] >> 3) << 10) | ((samples[i + 1] >> 3) << 5) | (samples[i + 2] >> 3);
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  const pts = [...hist].map(([key, w]) => ({ c: [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4], w }));
  pts.sort((a, b) => b.w - a.w);
  let cents = pts.slice(0, Math.min(k, pts.length)).map((p) => [...p.c]);
  for (let it = 0; it < 12; it++) {
    const acc = cents.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      const j = nearest(cents, p.c);
      acc[j][0] += p.c[0] * p.w;
      acc[j][1] += p.c[1] * p.w;
      acc[j][2] += p.c[2] * p.w;
      acc[j][3] += p.w;
    }
    cents = acc.map((a, j) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : cents[j]));
  }
  return cents.map((c) => c.map(Math.round));
}

function nearest(cents: number[][], c: number[]) {
  let best = 0, bd = Infinity;
  for (let j = 0; j < cents.length; j++) {
    const d = (cents[j][0] - c[0]) ** 2 + (cents[j][1] - c[1]) ** 2 + (cents[j][2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

export type Progress = (msg: string) => void;

export async function bake(ctx: BakeContext, p: BakeParams, onProgress: Progress = () => {}): Promise<BakeFile> {
  const allLayerMeshes = new Set(Object.values(p.layers).flatMap((l) => l.meshes));
  for (const h of p.hidden) allLayerMeshes.delete(h);
  const cam0 = setupCamera(ctx, p, allLayerMeshes);
  const { near, far } = cam0;
  p = { ...p, cols: cam0.cols };
  const cam = ctx.camera;

  const glyphs = await buildGlyphSet(p.charset, 'JetBrains Mono', p.cellAspect);
  const match = makeMatcher(glyphs);

  const sw = p.sub;
  const sh = Math.round(p.sub / p.cellAspect);
  const W = p.cols * sw;
  const H = p.rows * sh;
  const colorRT = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const depthRT = new THREE.WebGLRenderTarget(W, H);
  // Normalisasi depth ke rentang model (bukan near/far kamera) supaya 8-bit cukup presisi.
  const depthMat = makeDepthMaterial(near, far);

  const r = ctx.renderer;
  const prevClear = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  r.setClearColor(0x000000, 0);
  const colBuf = new Uint8Array(W * H * 4);
  const depBuf = new Uint8Array(W * H * 4);

  const render = () => {
    ctx.scene.overrideMaterial = null;
    r.setRenderTarget(colorRT);
    r.clear();
    r.render(ctx.scene, cam);
    r.readRenderTargetPixels(colorRT, 0, 0, W, H, colBuf);
    ctx.scene.overrideMaterial = depthMat;
    r.setRenderTarget(depthRT);
    r.clear();
    r.render(ctx.scene, cam);
    r.readRenderTargetPixels(depthRT, 0, 0, W, H, depBuf);
    ctx.scene.overrideMaterial = null;
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

  type Pending = { layer: string; clip: string; cells: RawCells; chars: string[] };
  const pending: Pending[] = [];
  const colorSamples: number[] = [];

  for (const [layerKey, layer] of Object.entries(p.layers)) {
    setVisible(ctx, new Set(layer.meshes));
    for (const [clipKey, clipName] of Object.entries(p.clips)) {
      const clip = poseAt(ctx, clipName, 0);
      const n = frameCount(clip, p.fps);
      for (let f = 0; f < n; f++) {
        poseAt(ctx, clipName, f / p.fps);
        render();
        const cells = sampleCells(p, colBuf, depBuf, W, H, levels);
        const chars: string[] = new Array(p.cols * p.rows);
        const v = new Float32Array(DIMS);
        for (let ci = 0; ci < chars.length; ci++) {
          if (cells.coverage[ci] < p.minCoverage) {
            chars[ci] = ' ';
            cells.depth[ci] = EMPTY_DEPTH;
            continue;
          }
          let m = 0;
          for (let d = 0; d < DIMS; d++) m = Math.max(m, cells.shape[ci * DIMS + d]);
          for (let d = 0; d < DIMS; d++) v[d] = m > 0 ? Math.pow(cells.shape[ci * DIMS + d] / m, p.sharpness) * m : 0;
          chars[ci] = match(v);
          colorSamples.push(cells.rgb[ci * 3], cells.rgb[ci * 3 + 1], cells.rgb[ci * 3 + 2]);
        }
        pending.push({ layer: layerKey, clip: clipKey, cells, chars });
        if (f === 0) onProgress(`${layer.label} / ${clipKey}: ${n} frame`);
        await new Promise((res) => setTimeout(res, 0));
      }
    }
  }
  r.setClearColor(prevClear, prevAlpha);
  colorRT.dispose();
  depthRT.dispose();

  onProgress('Membuat palet warna…');
  const palette = buildPalette(colorSamples, p.paletteSize);
  const out: BakeFile = {
    version: 1,
    model: p.modelName,
    cols: p.cols,
    rows: p.rows,
    cellAspect: p.cellAspect,
    fps: p.fps,
    facing: p.facing,
    palette: palette.map(hex),
    layers: {},
    bakedAt: new Date().toISOString(),
    params: { ...p, modelUrl: undefined, layers: undefined },
  };
  for (const [k, l] of Object.entries(p.layers)) out.layers[k] = { label: l.label, clips: {} };
  const palCache = new Map<number, number>();
  for (const pd of pending) {
    const frame = cropFrame(p, pd.chars, pd.cells, (ci) => {
      const c = [pd.cells.rgb[ci * 3], pd.cells.rgb[ci * 3 + 1], pd.cells.rgb[ci * 3 + 2]];
      const key = ((c[0] >> 2) << 12) | ((c[1] >> 2) << 6) | (c[2] >> 2);
      let j = palCache.get(key);
      if (j === undefined) palCache.set(key, (j = nearest(palette, c)));
      return j;
    });
    (out.layers[pd.layer].clips[pd.clip] ??= []).push(frame);
  }
  return out;
}

function cropFrame(p: BakeParams, chars: string[], cells: RawCells, colorIndex: (ci: number) => number): FrameData {
  let x0 = p.cols, y0 = p.rows, x1 = -1, y1 = -1;
  for (let y = 0; y < p.rows; y++)
    for (let x = 0; x < p.cols; x++)
      if (chars[y * p.cols + x] !== ' ') {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0, chars: '', depth: '', color: '' };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  let s = '';
  const depth = new Uint8Array(w * h);
  const color = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ci = (y0 + y) * p.cols + (x0 + x);
      s += chars[ci];
      depth[y * w + x] = chars[ci] === ' ' ? EMPTY_DEPTH : cells.depth[ci];
      color[y * w + x] = chars[ci] === ' ' ? 0 : colorIndex(ci);
    }
  return { x: x0, y: y0, w, h, chars: s, depth: b64encode(depth), color: b64encode(color) };
}
