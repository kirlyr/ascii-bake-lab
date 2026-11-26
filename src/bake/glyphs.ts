// Shape vector per glyph (pendekatan "ASCII rendering with shape vectors").
// Tiap sel dibagi REG_X × REG_Y region. Glyph dipilih yang pola kepadatannya
// paling mirip dengan pola kecerahan sel, bukan sekadar rata-rata brightness.
// Hasilnya silhouette lebih tajam dibanding ramp biasa.

export const REG_X = 2;
export const REG_Y = 3;
export const DIMS = REG_X * REG_Y;

export interface GlyphSet {
  chars: string[];
  /** vektor ternormalisasi per dimensi (0..1), panjang DIMS per glyph. */
  vecs: Float32Array;
}

export async function buildGlyphSet(charset: string, fontFamily: string, cellAspect: number, weight = 700): Promise<GlyphSet> {
  const fontSize = 48;
  await document.fonts.load(`${weight} ${fontSize}px "${fontFamily}"`);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `${weight} ${fontSize}px "${fontFamily}"`;
  const w = Math.round(ctx.measureText('M').width);
  const h = Math.round(w / cellAspect);
  c.width = w;
  c.height = h;

  const chars = [...new Set([...charset])];
  const vecs = new Float32Array(chars.length * DIMS);
  chars.forEach((ch, gi) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${weight} ${fontSize}px "${fontFamily}"`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, 0, h / 2);
    const data = ctx.getImageData(0, 0, w, h).data;
    const sums = new Float32Array(DIMS);
    const counts = new Float32Array(DIMS);
    for (let y = 0; y < h; y++) {
      const ry = Math.min(REG_Y - 1, Math.floor((y * REG_Y) / h));
      for (let x = 0; x < w; x++) {
        const rx = Math.min(REG_X - 1, Math.floor((x * REG_X) / w));
        const r = ry * REG_X + rx;
        sums[r] += data[(y * w + x) * 4 + 3] / 255;
        counts[r]++;
      }
    }
    for (let r = 0; r < DIMS; r++) vecs[gi * DIMS + r] = sums[r] / counts[r];
  });

  // Normalisasi per dimensi supaya glyph terpadat mewakili "1.0".
  for (let r = 0; r < DIMS; r++) {
    let max = 0;
    for (let g = 0; g < chars.length; g++) max = Math.max(max, vecs[g * DIMS + r]);
    if (max > 0) for (let g = 0; g < chars.length; g++) vecs[g * DIMS + r] /= max;
  }
  return { chars, vecs };
}

/** Cari glyph terdekat (Euclidean) dengan cache kuantisasi. Hasil = index glyph (shade level). */
export function makeMatcher(set: GlyphSet) {
  const cache = new Map<number, number>();
  const n = set.chars.length;
  return (v: Float32Array): number => {
    let key = 0;
    for (let r = 0; r < DIMS; r++) key = key * 16 + Math.min(15, Math.round(v[r] * 15));
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestD = Infinity;
    for (let g = 0; g < n; g++) {
      let d = 0;
      for (let r = 0; r < DIMS; r++) {
        const t = v[r] - set.vecs[g * DIMS + r];
        d += t * t;
      }
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    cache.set(key, best);
    return best;
  };
}
