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
  skin: { label: 'Kulit', colors: ['#5a3a26', '#e6b98f'] },
  plate: { label: 'Pelat', colors: ['#3a342c', '#8a8070', '#e4dccb'] },
  cloth: { label: 'Kain', colors: ['#4a1812', '#d8644c'] },
  leather: { label: 'Kulit samak', colors: ['#3a2818', '#b08a5c'] },
  wood: { label: 'Kayu', colors: ['#3a2716', '#c0925a'] },
  visor: { label: 'Visor', colors: ['#1d2a1c', '#8fae6a'] },
  // Material blade (Forge). Pasangan glyph mengikuti reel ansenjeo.
  iron: { label: 'Iron #%', glyphs: '.:-=+##%%', colors: ['#3c3c40', '#8c8c90', '#d0d0d0'] },
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
  visor: 'visor',
};

export const lookFor = (parts: string[], overrides: Record<string, MaterialKey> = {}): Record<string, Material> =>
  Object.fromEntries(parts.map((p) => [p, MATERIALS[overrides[p] ?? DEFAULT_LOOK[p] ?? 'plate']]));
