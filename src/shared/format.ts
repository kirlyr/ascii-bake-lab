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
  /** base64 Uint8Array(w*h). packCell(part, shade). Abaikan kalau depth kosong. Hanya di JSON (output bake mentah). */
  cell?: string;
  /** base64 Uint8Array(w*h). 0..254 = depth, 255 = kosong. Hanya di JSON. */
  depth?: string;
  /** offset frame ini di plane cell/depth container `.bake` (pengganti cell/depth). */
  o?: number;
  /** hanya di layer senjata. */
  blade?: BladeSocket;
}

export interface LayerData {
  label: string;
  /** slot equipment. Layer dengan slot sama = varian; player memasang maksimal satu per slot. Tanpa slot = selalu tampil. */
  slot?: string;
  /** slot lain yang disembunyikan selama layer ini terpasang (mis. helm menutup rambut). */
  hides?: string[];
  /** true = slot ini kosong di susunan bawaan (hanya dibaca di layer pertama slot). */
  unequipped?: boolean;
  /** part yang memancarkan aura/rune (mis. flail: kepala berduri, bukan gagang). Tanpa ini: seluruh layer / socket blade. */
  fx?: string[];
  /**
   * Prioritas compose dalam unit depth: layer ini menang atas layer lain yang lebih dekat
   * asal selisihnya ≤ bias. Untuk armor yang ditembus badan (mesh badan sedikit lebih besar dari outfit).
   */
  bias?: number;
  /**
   * Prioritas tambahan (unit depth) terhadap layer di slot tertentu saja, mis. jubah vs rompi yang menembus
   * punggung jauh lebih dalam dari bias biasa, tanpa ikut menimpa lengan (badan).
   */
  over?: Record<string, number>;
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

/** Hasil bake banyak arah (idle napas beberapa frame, untuk memutar karakter). Arah lain = mirror dari salah satu view. */
export interface TurnFile {
  views: BakeFile[];
}

// ── Container biner `.bake` ────────────────────────────────────────────────────────────────────────
// gzip( magic "ASB3" | u32 panjang header | header JSON | plane cell | plane depth ).
// Header = BakeFile/TurnFile tanpa cell/depth base64; tiap frame punya `o` (offset di plane).
// Plane dipisah (semua cell dulu, lalu semua depth) karena gzip lebih efektif: ±33% lebih kecil dari JSON.
// Delta antar frame sudah diuji dan justru lebih besar (karakter bergerak, XOR jadi noise).

const MAGIC = 0x33425341; // "ASB3" little-endian

export interface Planes {
  cell: Uint8Array;
  depth: Uint8Array;
}

function eachFrame(obj: BakeFile | TurnFile, fn: (f: FrameData) => void) {
  for (const v of 'views' in obj ? obj.views : [obj]) for (const l of Object.values(v.layers)) for (const fs of Object.values(l.clips)) fs.forEach(fn);
}

/** JSON hasil bake → container biner (belum di-gzip). */
export function packBake(obj: BakeFile | TurnFile): Uint8Array<ArrayBuffer> {
  const head = JSON.parse(JSON.stringify(obj)) as BakeFile | TurnFile;
  const cells: Uint8Array[] = [];
  const depths: Uint8Array[] = [];
  let n = 0;
  eachFrame(head, (f) => {
    f.o = n;
    n += f.w * f.h;
    cells.push(f.w * f.h ? b64decode(f.cell ?? '') : new Uint8Array());
    depths.push(f.w * f.h ? b64decode(f.depth ?? '') : new Uint8Array());
    delete f.cell;
    delete f.depth;
  });
  const json = new TextEncoder().encode(JSON.stringify(head));
  const out = new Uint8Array(8 + json.length + 2 * n);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, json.length, true);
  out.set(json, 8);
  let p = 8 + json.length;
  for (const c of cells) out.set(c, p), (p += c.length);
  for (const d of depths) out.set(d, p), (p += d.length);
  return out;
}

export function unpackBake<T extends BakeFile | TurnFile>(buf: Uint8Array): { data: T; planes: Planes } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('Bukan file .bake (ASB3)');
  const len = dv.getUint32(4, true);
  const data = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + len))) as T;
  const rest = buf.subarray(8 + len);
  const n = rest.length / 2;
  return { data, planes: { cell: rest.subarray(0, n), depth: rest.subarray(n) } };
}

/** Muat `.bake` (gzip) tanpa bergantung pada Content-Encoding server. */
export async function loadBake<T extends BakeFile | TurnFile>(url: string): Promise<{ data: T; planes: Planes; bytes: number } | null> {
  const res = await fetch(url);
  if (!res.ok || !res.body) return null;
  const bytes = Number(res.headers.get('content-length') ?? 0);
  const raw = new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return { ...unpackBake<T>(raw), bytes };
}
