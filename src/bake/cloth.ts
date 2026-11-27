import * as THREE from 'three';
import type { BakeContext } from './bake';

/**
 * Simulasi kain ringan (Verlet + constraint jarak) untuk mesh grid seperti jubah. Hanya di bake tool:
 * hasilnya ikut ter-bake ke frame ASCII, runtime tidak menghitung apa pun.
 *
 * Mesh harus grid baris-mayor (baris 0 = atas). Baris atas `pinRows` dipaku ke posisi kaku (ikut tulang),
 * sisanya jatuh oleh gravitasi, ditahan pegas struktur/geser/lentur, ditarik lembut ke bentuk aslinya
 * (`shape`), didorong angin semu saat berjalan, dan tidak boleh masuk kapsul badan/kaki.
 */
export interface ClothSpec {
  /** nama mesh di ctx.meshes, mis. `cloak:Cloth`. */
  mesh: string;
  /** jumlah vertex per baris grid. */
  cols: number;
  /** true = tabung tertutup: kolom terakhir bersebelahan dengan kolom pertama (rok robe). */
  wrap?: boolean;
  pinRows: number;
  /** tarikan ke bentuk kaku per detik di baris paling bawah (atas lebih kaku). 0 = kain bebas. */
  shape: number;
  /** hambatan udara per detik (default 1,6). Kecil = kain berat, berayun lebih lama. */
  drag?: number;
  /** clip → kecepatan maju model (m/s). Clip in-place: angin semu dari depan supaya kain tertinggal ke belakang. */
  wind?: Record<string, number>;
  /** kapsul tabrakan: dua tulang + radius (m). */
  colliders: { from: string; to: string; radius: number }[];
  /**
   * Tulang poros (mis. `pelvis`). Vertex yang masuk kapsul didorong mendatar menjauhi garis vertikal tulang ini,
   * bukan ke titik terdekat kapsul: rok tetap di depan kaki yang melangkah, tidak terlempar ke belakang kaki.
   */
  axis?: string;
}

const DT = 1 / 120;
const ITER = 12;
const GRAVITY = -9.8;
const SETTLE = 2.5; // detik minimal (dan ≥ 2 siklus) sebelum direkam, supaya kain sudah mengendap

export class Cloth {
  private mesh: THREE.Mesh;
  private rest: Float32Array; // posisi lokal asli
  private n: number;
  private rows: number;
  private links: [number, number, number][] = [];
  private cache = new Map<string, { samples: Float32Array[]; duration: number }>();
  private bones: [THREE.Object3D, THREE.Object3D, number][];
  private axis?: THREE.Object3D;

  constructor(
    private ctx: BakeContext,
    private spec: ClothSpec,
  ) {
    const m = ctx.meshes.get(spec.mesh) as THREE.Mesh | undefined;
    if (!m) throw new Error(`Cloth: mesh "${spec.mesh}" tidak ada`);
    this.mesh = m;
    m.frustumCulled = false;
    const pos = m.geometry.attributes.position;
    this.rest = Float32Array.from(pos.array as ArrayLike<number>);
    this.n = pos.count;
    this.rows = this.n / spec.cols;
    if (!Number.isInteger(this.rows)) throw new Error(`Cloth: ${this.n} vertex bukan kelipatan ${spec.cols} kolom`);
    const C = spec.cols;
    const at = (r: number, c: number) => r * C + c;
    const v = (i: number) => new THREE.Vector3().fromArray(this.rest, i * 3);
    const link = (a: number, b: number) => this.links.push([a, b, v(a).distanceTo(v(b))]);
    // Tetangga kolom: dengan `wrap`, kolom terakhir tersambung ke kolom pertama.
    const col = (c: number) => (spec.wrap ? c % C : c < C ? c : -1);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < C; c++) {
        const c1 = col(c + 1), c2 = col(c + 2);
        if (c1 >= 0) link(at(r, c), at(r, c1));
        if (r + 1 < this.rows) link(at(r, c), at(r + 1, c));
        if (r + 1 < this.rows && c1 >= 0) link(at(r, c), at(r + 1, c1)), link(at(r, c1), at(r + 1, c));
        if (c2 >= 0) link(at(r, c), at(r, c2));
        if (r + 2 < this.rows) link(at(r, c), at(r + 2, c));
      }
    const bone = (name: string) => {
      const b = ctx.root.getObjectByName(name);
      if (!b) throw new Error(`Cloth: tulang "${name}" tidak ada`);
      return b;
    };
    this.bones = spec.colliders.map((k) => [bone(k.from), bone(k.to), k.radius]);
    if (spec.axis) this.axis = bone(spec.axis);
  }

  /** Posisi kaku (dunia) semua vertex pada pose sekarang. */
  private targets(out: Float32Array) {
    const v = new THREE.Vector3();
    const mw = this.mesh.matrixWorld;
    for (let i = 0; i < this.n; i++) v.fromArray(this.rest, i * 3).applyMatrix4(mw).toArray(out, i * 3);
  }

  private simulate(clipName: string) {
    const clip = this.ctx.animations.find((a) => a.name === clipName)!;
    const { mixer, root } = this.ctx;
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    const pose = (t: number) => {
      mixer.setTime(t);
      root.updateMatrixWorld(true);
    };
    const D = clip.duration;
    const steps = Math.max(1, Math.round(D / DT));
    const dt = D / steps;
    const wind = this.spec.wind?.[clipName] ?? 0;
    const drag = this.spec.drag ?? 1.6;
    const WARMUP = Math.max(2, Math.ceil(SETTLE / D));
    const N = this.n * 3;
    const target = new Float32Array(N);
    pose(0);
    this.targets(target);
    const x = Float32Array.from(target);
    const prev = Float32Array.from(target);
    const pinned = this.spec.pinRows * this.spec.cols;
    const C = this.spec.cols;
    // Tarikan bentuk: kuat dekat kerah, melemah ke bawah.
    const shapeK = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const t = Math.floor(i / C) / (this.rows - 1);
      shapeK[i] = Math.min(1, this.spec.shape * (1 + 4 * (1 - t) ** 2) * dt);
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), ab = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
    const caps = this.bones.map(() => [new THREE.Vector3(), new THREE.Vector3()]);
    const axisPos = new THREE.Vector3(), dir = new THREE.Vector3(), rel = new THREE.Vector3();
    const samples: Float32Array[] = [];

    for (let s = 0; s < steps * (WARMUP + 1); s++) {
      const cycle = Math.floor(s / steps);
      pose((s % steps) * dt);
      this.targets(target);
      this.bones.forEach(([f, t], k) => (f.getWorldPosition(caps[k][0]), t.getWorldPosition(caps[k][1])));
      this.axis?.getWorldPosition(axisPos);
      // Integrasi Verlet + gravitasi + hambatan udara relatif terhadap angin semu (-Z model = belakang).
      for (let i = pinned; i < this.n; i++) {
        const o = i * 3;
        for (let d = 0; d < 3; d++) {
          const vel = (x[o + d] - prev[o + d]) / dt;
          const air = d === 2 ? -wind : 0;
          const acc = (d === 1 ? GRAVITY : 0) + drag * (air - vel);
          prev[o + d] = x[o + d];
          x[o + d] += vel * dt + acc * dt * dt;
          x[o + d] += (target[o + d] - x[o + d]) * shapeK[i];
        }
      }
      for (let i = 0; i < pinned * 3; i++) x[i] = prev[i] = target[i];
      for (let it = 0; it < ITER; it++) {
        for (const [i, j, len] of this.links) {
          const oi = i * 3, oj = j * 3;
          const dx = x[oj] - x[oi], dy = x[oj + 1] - x[oi + 1], dz = x[oj + 2] - x[oi + 2];
          const dist = Math.hypot(dx, dy, dz) || 1e-6;
          const diff = (dist - len) / dist;
          const wi = i < pinned ? 0 : 1, wj = j < pinned ? 0 : 1;
          if (!wi && !wj) continue;
          const k = diff / (wi + wj);
          x[oi] += dx * k * wi, x[oi + 1] += dy * k * wi, x[oi + 2] += dz * k * wi;
          x[oj] -= dx * k * wj, x[oj + 1] -= dy * k * wj, x[oj + 2] -= dz * k * wj;
        }
        // Tabrakan kapsul: dorong vertex keluar ke permukaan.
        for (let c = 0; c < caps.length; c++) {
          a.copy(caps[c][0]);
          b.copy(caps[c][1]);
          ab.subVectors(b, a);
          const ll = ab.lengthSq() || 1e-6;
          const R = this.bones[c][2];
          for (let i = pinned; i < this.n; i++) {
            p.fromArray(x, i * 3);
            const t = Math.min(1, Math.max(0, q.subVectors(p, a).dot(ab) / ll));
            q.copy(a).addScaledVector(ab, t);
            const d = p.distanceTo(q);
            if (d >= R) continue;
            if (this.axis) {
              // Dorong mendatar menjauhi poros sampai menyentuh permukaan kapsul: |p + s·dir − q| = R.
              dir.set(p.x - axisPos.x, 0, p.z - axisPos.z).normalize();
              rel.subVectors(p, q);
              const bb = rel.dot(dir), cc = rel.lengthSq() - R * R;
              p.addScaledVector(dir, -bb + Math.sqrt(Math.max(0, bb * bb - cc))).toArray(x, i * 3);
            } else p.sub(q).multiplyScalar(R / (d || 1e-6)).add(q).toArray(x, i * 3);
          }
        }
      }
      if (cycle === WARMUP) samples.push(Float32Array.from(x));
    }
    // Sambungan loop mulus: geser rekaman supaya akhir siklus = awal siklus, offset meluruh linear.
    const end = Float32Array.from(x);
    const first = samples[0];
    samples.forEach((sm, k) => {
      const w = 1 - k / samples.length;
      for (let i = 0; i < N; i++) sm[i] += (end[i] - first[i]) * w;
    });
    return { samples, duration: D };
  }

  /** Dipanggil setelah pose (clip, t) diterapkan dan matrixWorld segar. */
  apply(clipName: string, t: number) {
    let sim = this.cache.get(clipName);
    if (!sim) {
      // Simulasi mengubah pose mixer; kembalikan pose yang diminta setelahnya.
      sim = this.simulate(clipName);
      this.cache.set(clipName, sim);
      this.ctx.mixer.setTime(t);
      this.ctx.root.updateMatrixWorld(true);
    }
    const { samples, duration } = sim;
    const k = Math.round(((((t % duration) + duration) % duration) / duration) * samples.length) % samples.length;
    const world = samples[k];
    const inv = this.mesh.matrixWorld.clone().invert();
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      v.fromArray(world, i * 3).applyMatrix4(inv);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}
