// Format file hasil bake. Dipakai bake tool (menulis) dan player (membaca).
// Tidak boleh import Three.js di sini, karena player ikut memakainya.
//
// v2: tiap sel menyimpan shade level + part id + depth, bukan char final.
// Runtime memetakan (part, shade) → glyph + warna lewat material (lihat materials.ts),
// jadi material bisa diganti tanpa re-bake.

/** Nilai depth untuk sel kosong. Depth 0 = paling dekat ke kamera. */
export const EMPTY_DEPTH = 255;

/** Maksimum shade level dan part. Satu byte sel = part * 16 + shade. */
export const MAX_SHADES = 16;
export const MAX_PARTS = 16;
export const packCell = (part: number, shade: number) => part * MAX_SHADES + shade;
export const cellPart = (cell: number) => cell >> 4;
export const cellShade = (cell: number) => cell & 15;

/**
 * Socket dalam koordinat grid (unit sel, kontinu, y ke bawah, sebelum mirror).
 * [x, y, depth 0..254]. Mirror: x' = cols - x.
 */
export type SocketPoint = [number, number, number];

/** Socket blade: pangkal (guard) dan ujung. Dipakai emitter partikel rune. */
export interface BladeSocket {
  base: SocketPoint;
  tip: SocketPoint;
}

/** Satu frame satu layer, di-crop ke bounding box sel yang terisi. */
export interface FrameData {
  x: number;
  y: number;
  w: number;
  h: number;
  /** base64 Uint8Array(w*h). packCell(part, shade). Abaikan kalau depth kosong. */
  cell: string;
  /** base64 Uint8Array(w*h). 0..254 = depth, 255 = kosong. */
  depth: string;
  /** hanya di layer senjata. */
  blade?: BladeSocket;
}

export interface LayerData {
  label: string;
  /** slot equipment. Layer dengan slot sama = varian; player memasang maksimal satu per slot. Tanpa slot = selalu tampil. */
  slot?: string;
  /**
   * Prioritas compose dalam unit depth: layer ini menang atas layer lain yang lebih dekat
   * asal selisihnya ≤ bias. Untuk armor yang ditembus badan (mesh badan sedikit lebih besar dari outfit).
   */
  bias?: number;
  /** nama clip → frame berurutan (loop). */
  clips: Record<string, FrameData[]>;
}

export interface BakeFile {
  version: 2;
  /** arah kamera saat bake (derajat). -90 = samping, model hadap kanan; 0 = depan; ±180 = belakang. */
  yaw?: number;
  /** posisi origin model (titik antara kaki) di grid [x, y], sebelum mirror. Untuk menyejajarkan file/arah berbeda. */
  origin?: [number, number];
  model: string;
  cols: number;
  rows: number;
  /** lebar sel / tinggi sel, harus sama dengan font di player. */
  cellAspect: number;
  fps: number;
  /** arah hadap hasil bake. Arah sebaliknya = mirror di runtime. */
  facing: 'right' | 'left';
  /** charset yang dipakai shape matching. Index = shade level (gelap → terang). */
  ramp: string;
  /** nama part. Index = part id. */
  parts: string[];
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

/** Hasil bake banyak arah (pose diam untuk memutar karakter). Arah lain = mirror dari salah satu view. */
export interface TurnFile {
  views: BakeFile[];
}
