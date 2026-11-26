// Format file hasil bake. Dipakai bake tool (menulis) dan player (membaca).
// Tidak boleh import Three.js di sini, karena player ikut memakainya.

/** Nilai depth untuk sel kosong. Depth 0 = paling dekat ke kamera. */
export const EMPTY_DEPTH = 255;

/** Satu frame satu layer, di-crop ke bounding box sel yang terisi. */
export interface FrameData {
  x: number;
  y: number;
  w: number;
  h: number;
  /** w*h karakter, baris demi baris. Spasi = kosong. */
  chars: string;
  /** base64 Uint8Array(w*h). 0..254 = depth, 255 = kosong. */
  depth: string;
  /** base64 Uint8Array(w*h). Index ke `palette`. */
  color: string;
}

export interface LayerData {
  label: string;
  /** nama clip → frame berurutan (loop). */
  clips: Record<string, FrameData[]>;
}

export interface BakeFile {
  version: 1;
  model: string;
  cols: number;
  rows: number;
  /** lebar sel / tinggi sel, harus sama dengan font di player. */
  cellAspect: number;
  fps: number;
  /** arah hadap hasil bake. Arah sebaliknya = mirror di runtime. */
  facing: 'right' | 'left';
  palette: string[];
  layers: Record<string, LayerData>;
  bakedAt: string;
  params: Record<string, unknown>;
}

export function b64encode(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

const PAIRS = ['/\\', '()', '[]', '{}', '<>', 'bd', 'pq', '`\''];
export const MIRROR_MAP: Record<string, string> = {};
for (const [a, b] of PAIRS) {
  MIRROR_MAP[a] = b;
  MIRROR_MAP[b] = a;
}
export const mirrorChar = (c: string): string => MIRROR_MAP[c] ?? c;
