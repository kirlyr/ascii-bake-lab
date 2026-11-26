// Material = cara menggambar satu part: glyph dan warna per shade level.
// Ganti material = ganti tabel ini di runtime, tanpa re-bake.

export interface Material {
  label: string;
  /**
   * Glyph per shade level (gelap → terang). Panjangnya disamakan dengan ramp bake.
   * Kosong = pakai ramp bake apa adanya (tepi silhouette dari shape vector tetap utuh).
   * Level rendah sebaiknya tetap `.:-=` supaya tepi tidak hilang.
   */
  glyphs?: string;
  /** stop warna gelap → terang, diinterpolasi linear per shade level. */
  colors: string[];
}

export const MATERIALS = {
  // Stop pertama tidak terlalu gelap supaya glyph tepi (`.:`) tetap terbaca di latar #120e0a.
  skin: { label: 'Kulit', colors: ['#6a4430', '#c48a5e', '#f2cfa4'] },
  plate: { label: 'Pelat', colors: ['#4a4238', '#9a8f7c', '#ead9b5'] },
  cloth: { label: 'Kain lumut', colors: ['#34402a', '#6f8a4c', '#b4cc8a'] },
  leather: { label: 'Kulit samak', colors: ['#4e3220', '#946038', '#d8a870'] },
  wood: { label: 'Kayu', colors: ['#4a3420', '#8a6038', '#c89a60'] },
  visor: { label: 'Visor', colors: ['#2a3a26', '#8fae6a'] },
  // Hiasan helm: warna emas tanpa ganti glyph, supaya bentuk helm tetap dari ramp bake.
  brass: { label: 'Kuningan', colors: ['#5a3e10', '#b88a3a', '#f0d080'] },
  // Material blade (Forge). Pasangan glyph mengikuti reel ansenjeo.
  iron: { label: 'Iron #%', glyphs: '.:-=+##%%', colors: ['#4a4a4e', '#9c9ca0', '#e0e0dc'] },
  steel: { label: 'Steel @%', glyphs: '.:-=+@@%%', colors: ['#34404c', '#90a4b8', '#eef4fa'] },
  gold: { label: 'Gold 0o', glyphs: '.:-=+00oo', colors: ['#5a3e10', '#d4a64a', '#f6dc8c'] },
  bloodiron: { label: 'Bloodiron B8', glyphs: '.:-=+BB88', colors: ['#3a0e0c', '#a83a2a', '#f08a6c'] },
} satisfies Record<string, Material>;

export type MaterialKey = keyof typeof MATERIALS;

export const BLADE_MATERIALS: MaterialKey[] = ['iron', 'steel', 'gold', 'bloodiron'];

/** Look default: part → material. Part yang tidak terdaftar memakai `plate`. */
export const DEFAULT_LOOK: Record<string, MaterialKey> = {
  skin: 'skin',
  armor: 'plate',
  helmet: 'plate',
  cloth: 'cloth',
  hilt: 'leather',
  blade: 'iron',
  shield: 'wood',
  wood: 'wood',
  visor: 'visor',
  trim: 'brass',
};

export const lookFor = (parts: string[], overrides: Record<string, MaterialKey> = {}): Record<string, Material> =>
  Object.fromEntries(parts.map((p) => [p, MATERIALS[overrides[p] ?? DEFAULT_LOOK[p] ?? 'plate']]));
