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
  linen: { label: 'Linen', colors: ['#4e4432', '#a89870', '#ead9b5'] },
  wool: { label: 'Wol', colors: ['#3e3024', '#7a6048', '#c0a080'] },
  ruby: { label: 'Rubi', colors: ['#4a0e0c', '#d8644c', '#f8b0a0'] },
  brass: { label: 'Kuningan', colors: ['#5a3e10', '#b88a3a', '#f0d080'] },
  // Material blade (Forge). Pasangan glyph mengikuti reel ansenjeo.
  iron: { label: 'Iron #%', glyphs: '.:-=+##%%', colors: ['#4a4a4e', '#9c9ca0', '#e0e0dc'] },
  steel: { label: 'Steel @%', glyphs: '.:-=+@@%%', colors: ['#34404c', '#90a4b8', '#eef4fa'] },
  gold: { label: 'Gold 0o', glyphs: '.:-=+00oo', colors: ['#5a3e10', '#d4a64a', '#f6dc8c'] },
  bloodiron: { label: 'Bloodiron B8', glyphs: '.:-=+BB88', colors: ['#3a0e0c', '#a83a2a', '#f08a6c'] },
  hair: { label: 'Rambut', colors: ['#141210', '#3a332c', '#7a6e60'] },
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
  linen: 'linen',
  wool: 'wool',
  gem: 'ruby',
  visor: 'visor',
  trim: 'brass',
  cloak: 'wool',
  feather: 'linen',
  plume: 'linen',
  hair: 'hair',
};

/**
 * Pewarna: hanya stop warna, glyph tetap dari ramp bake (bentuk dan tepi tidak berubah).
 * Kain dan kulit pakai DYES, logam pakai FINISHES. Berlaku per part, jadi semua item dengan part itu ikut.
 */
export const DYES = {
  moss: { label: 'Moss', colors: ['#34402a', '#6f8a4c', '#b4cc8a'] },
  crimson: { label: 'Crimson', colors: ['#4a1410', '#a83a2a', '#f08a6c'] },
  indigo: { label: 'Indigo', colors: ['#1e2440', '#4a5a98', '#a8b4e0'] },
  royal: { label: 'Royal purple', colors: ['#2e1a3a', '#6e4a8a', '#c8a8e0'] },
  ochre: { label: 'Ochre', colors: ['#4a3410', '#b08030', '#f0d08a'] },
  tan: { label: 'Tan', colors: ['#4e3220', '#946038', '#d8a870'] },
  brown: { label: 'Umber', colors: ['#3e3024', '#7a6048', '#c0a080'] },
  parchment: { label: 'Parchment', colors: ['#4e4432', '#a89870', '#ead9b5'] },
  snow: { label: 'Snow', colors: ['#5a5a58', '#c8c8c0', '#ffffff'] },
  raven: { label: 'Raven', colors: ['#18181c', '#3a3a44', '#76768a'] },
  charcoal: { label: 'Charcoal', colors: ['#2a2622', '#5a544c', '#b0a898'] },
} satisfies Record<string, Material>;

/** Warna rambut: hitam bawaan. Stop terang dijaga cukup terang supaya helai tetap terbaca di latar gelap. */
export const HAIR_DYES = {
  black: { label: 'Black', colors: ['#141210', '#3a332c', '#7a6e60'] },
  brown: { label: 'Brown', colors: ['#2a1a10', '#5e3c22', '#a8784a'] },
  auburn: { label: 'Auburn', colors: ['#2e120a', '#7a3018', '#c8643a'] },
  blond: { label: 'Blond', colors: ['#4a3a1a', '#a88a4a', '#ecd49a'] },
  grey: { label: 'Grey', colors: ['#34322e', '#7a7670', '#d0ccc4'] },
} satisfies Record<string, Material>;

export const FINISHES = {
  iron: { label: 'Iron', colors: ['#4a4238', '#9a8f7c', '#ead9b5'] },
  steel: { label: 'Steel', colors: ['#34404c', '#90a4b8', '#eef4fa'] },
  bronze: { label: 'Bronze', colors: ['#4a2e14', '#b07a40', '#f0c890'] },
  gold: { label: 'Gold', colors: ['#5a3e10', '#d4a64a', '#f6dc8c'] },
  black: { label: 'Blackened', colors: ['#2a2626', '#5a5450', '#b0a8a0'] },
} satisfies Record<string, Material>;

/** Part yang bisa diwarnai: palet + warna awal (sama dengan DEFAULT_LOOK). */
export const DYEABLE: Record<string, { label: string; palette: Record<string, Material>; initial: string }> = {
  cloth: { label: 'Cloth', palette: DYES, initial: 'moss' },
  leather: { label: 'Leather', palette: DYES, initial: 'tan' },
  linen: { label: 'Linen', palette: DYES, initial: 'parchment' },
  wool: { label: 'Wool', palette: DYES, initial: 'brown' },
  armor: { label: 'Plate', palette: FINISHES, initial: 'iron' },
  helmet: { label: 'Metal', palette: FINISHES, initial: 'iron' },
  trim: { label: 'Trim', palette: FINISHES, initial: 'gold' },
  cloak: { label: 'Cloak', palette: DYES, initial: 'charcoal' },
  feather: { label: 'Feather', palette: DYES, initial: 'raven' },
  plume: { label: 'Plumage', palette: DYES, initial: 'snow' },
  hair: { label: 'Hair', palette: HAIR_DYES, initial: 'black' },
};

/** Material per part. `overrides` = key MATERIALS atau Material langsung (pewarna). */
export const lookFor = (parts: string[], overrides: Record<string, MaterialKey | Material> = {}): Record<string, Material> =>
  Object.fromEntries(
    parts.map((p) => {
      const o = overrides[p];
      return [p, typeof o === 'object' ? o : MATERIALS[o ?? DEFAULT_LOOK[p] ?? 'plate']];
    }),
  );
