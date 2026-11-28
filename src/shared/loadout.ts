// Loadout = hasil kustomisasi karakter (Tavern) yang juga dipakai Home.
// Disimpan di localStorage pengunjung; tiap pengunjung punya versinya sendiri, default = susunan bawaan bake.
import type { BakeFile } from './format';
import { defaultEquipment, type Equipment } from './compose';
import { BLADE_MATERIALS, DYEABLE, lookFor, type Material, type MaterialKey } from './materials';
import { AURAS, RUNES, type AuraKey, type EffectLevel, type RuneKey } from './runes';

export interface Loadout {
  equip: Equipment;
  /** part → key palet di DYEABLE */
  dye: Record<string, string>;
  blade: MaterialKey;
  /** slot → aura */
  auras: Record<string, AuraKey>;
  rune: RuneKey | null;
  /** intensitas efek: key = slot (aura) atau 'rune'. Tanpa entri = 2. */
  levels: Record<string, EffectLevel>;
}

const KEY = 'ascii-hero-loadout';

export function defaultLoadout(file: BakeFile): Loadout {
  return {
    equip: defaultEquipment(file),
    dye: Object.fromEntries(Object.entries(DYEABLE).map(([p, d]) => [p, d.initial])),
    blade: 'iron',
    auras: {},
    rune: null,
    levels: {},
  };
}

/**
 * Baca loadout tersimpan. Nilai yang tidak dikenal file ini (layer dihapus, palet diganti) jatuh ke default.
 * `fallback` dipakai kalau belum ada yang tersimpan (mis. susunan karakter pilihan pemilik situs).
 */
export function loadLoadout(file: BakeFile, fallback: Partial<Loadout> | null = null): Loadout {
  const out = defaultLoadout(file);
  let saved: Partial<Loadout> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    // storage diblokir / JSON rusak: pakai fallback
  }
  saved ??= fallback;
  if (!saved || typeof saved !== 'object') return out;
  for (const [slot, layer] of Object.entries(saved.equip ?? {})) {
    if (!(slot in out.equip)) continue;
    if (layer === null || file.layers[layer]?.slot === slot) out.equip[slot] = layer;
  }
  for (const [part, key] of Object.entries(saved.dye ?? {})) if (DYEABLE[part]?.palette[key]) out.dye[part] = key;
  if (BLADE_MATERIALS.includes(saved.blade as MaterialKey)) out.blade = saved.blade!;
  for (const [slot, aura] of Object.entries(saved.auras ?? {})) if (slot in out.equip && aura in AURAS) out.auras[slot] = aura;
  if (saved.rune && saved.rune in RUNES) out.rune = saved.rune;
  for (const [k, v] of Object.entries(saved.levels ?? {})) if ((k === 'rune' || k in out.equip) && [1, 2, 3].includes(v)) out.levels[k] = v;
  return out;
}

export function saveLoadout(l: Loadout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // Private mode / storage diblokir: kustomisasi tetap jalan, hanya tidak diingat.
  }
}

/** Tabel material sesuai pewarna + material blade loadout. */
export function materialsFor(file: BakeFile, l: Loadout): Record<string, Material> {
  const dyes = Object.fromEntries(Object.entries(l.dye).map(([p, k]) => [p, DYEABLE[p].palette[k]]));
  return lookFor(file.parts, { ...dyes, blade: l.blade });
}

export const levelOf = (l: Loadout, key: string): EffectLevel => l.levels[key] ?? 2;
