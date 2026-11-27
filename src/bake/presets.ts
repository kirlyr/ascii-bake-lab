// Preset per model. Pilih lewat /bake.html?model=<key>. Hasil disimpan ke public/baked/<key>.json.
// Varian armor/helm/senjata berikutnya cukup jadi preset baru yang menimpa `outfits` / `attachments`.
import { DEFAULT_PARAMS, type BakeParams } from './bake';

export const PRESETS: Record<string, BakeParams> = {
  hero: DEFAULT_PARAMS,
  // Putar karakter: 16 arah penuh, 4 frame idle merata sepanjang clip (napas). Tanpa mirror, karena karakter tidak
  // simetris (pauldron satu sisi, senjata di tangan kanan): mirror memindahkan item ke sisi lain saat diputar.
  'hero-turn': {
    ...DEFAULT_PARAMS,
    clips: { idle: 'idle' },
    views: Array.from({ length: 16 }, (_, i) => -22.5 * i),
    stillFrames: 4,
  },
};
