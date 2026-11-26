// Preset per model. Pilih lewat /bake.html?model=<key>. Hasil disimpan ke public/baked/<key>.json.
// Varian armor/helm/senjata berikutnya cukup jadi preset baru yang menimpa `outfits` / `attachments`.
import { DEFAULT_PARAMS, type BakeParams } from './bake';

export const PRESETS: Record<string, BakeParams> = {
  hero: DEFAULT_PARAMS,
  // Putar karakter: 16 arah pose diam (frame 0 idle). Bake 0..-180 per 22,5°, sisi lain = mirror di player.
  'hero-turn': {
    ...DEFAULT_PARAMS,
    clips: { idle: 'idle' },
    views: Array.from({ length: 9 }, (_, i) => -22.5 * i),
    still: true,
  },
};
