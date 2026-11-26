// Preset per model. Pilih lewat /bake.html?model=<key>. Hasil disimpan ke public/baked/<key>.json.
// Varian armor/helm/senjata berikutnya cukup jadi preset baru yang menimpa `outfits` / `attachments`.
import { DEFAULT_PARAMS, type BakeParams } from './bake';

export const PRESETS: Record<string, BakeParams> = {
  hero: DEFAULT_PARAMS,
};
