import * as THREE from 'three';
import type { BakeContext } from './bake';

/**
 * Rantai flail: tali Verlet (titik + jarak tetap) yang digantung dari ujung gagang, bola berduri di ujungnya.
 * Hanya di bake tool: hasil simulasi ditulis ke mesh rantai + bola tiap frame, lalu ikut ter-bake ke ASCII.
 *
 * Mesh dari `make_flail.py`: `<name>:Chain` (mata rantai berjajar lurus di sumbu +Z mesh, dari ujung gagang) dan
 * `<name>:Ball`. Bentuk awal itu jadi templat: tiap mata rantai dipindah ke ruas tali-nya, bola ke ujung tali.
 */
export interface FlailSpec {
  /** nama attachment, mis. `flail` → mesh `flail:Chain` dan `flail:Ball`. */
  name: string;
  links: number;
  /** hambatan udara per detik (default 1,2). */
  drag?: number;
  /** clip → kecepatan maju model (m/s), angin semu seperti di Cloth. */
  wind?: Record<string, number>;
  /** kapsul tabrakan: dua tulang + radius (m). */
  colliders: { from: string; to: string; radius: number }[];
}

const DT = 1 / 120;
const ITER = 8;
const GRAVITY = -9.8;
const SETTLE = 2.5;
/** massa balik bola relatif terhadap mata rantai: bola berat, rantai ikut, bukan sebaliknya. */
const BALL_W = 0.25;

export class Flail {
  private chain: THREE.Mesh;
  private ball: THREE.Mesh;
  private chainRest: Float32Array;
  private ballRest: Float32Array;
  private chainNrm: Float32Array;
  private ballNrm: Float32Array;
  /** pusat tiap mata rantai dan bola di templat (ruang lokal mesh). */
  private linkCenter: THREE.Vector3[] = [];
  private ballCenter = new THREE.Vector3();
  private anchorLocal: THREE.Vector3;
  /** panjang ruas di ruang lokal mesh. */
  private segLocal: number;
  private ballLocal: number;
  private perLink: number;
  private bones: [THREE.Object3D, THREE.Object3D, number][];
  private cache = new Map<string, { samples: Float32Array[]; duration: number }>();

  constructor(
    private ctx: BakeContext,
    private spec: FlailSpec,
  ) {
    const get = (k: string) => {
      const m = ctx.meshes.get(`${spec.name}:${k}`) as THREE.Mesh | undefined;
      if (!m) throw new Error(`Flail: mesh "${spec.name}:${k}" tidak ada`);
      m.frustumCulled = false;
      return m;
    };
    this.chain = get('Chain');
    this.ball = get('Ball');
    this.chainRest = Float32Array.from(this.chain.geometry.attributes.position.array as ArrayLike<number>);
    this.ballRest = Float32Array.from(this.ball.geometry.attributes.position.array as ArrayLike<number>);
    this.chainNrm = Float32Array.from(this.chain.geometry.attributes.normal.array as ArrayLike<number>);
    this.ballNrm = Float32Array.from(this.ball.geometry.attributes.normal.array as ArrayLike<number>);
    this.perLink = this.chainRest.length / 3 / spec.links;
    for (let k = 0; k < spec.links; k++) {
      const c = new THREE.Vector3();
      for (let i = 0; i < this.perLink; i++) c.add(new THREE.Vector3().fromArray(this.chainRest, (k * this.perLink + i) * 3));
      this.linkCenter.push(c.divideScalar(this.perLink));
    }
    for (let i = 0; i < this.ballRest.length / 3; i++) this.ballCenter.add(new THREE.Vector3().fromArray(this.ballRest, i * 3));
    this.ballCenter.divideScalar(this.ballRest.length / 3);
    this.segLocal = this.linkCenter[1].z - this.linkCenter[0].z;
    this.anchorLocal = this.linkCenter[0].clone().setZ(this.linkCenter[0].z - this.segLocal / 2);
    this.ballLocal = this.ballCenter.z - (this.linkCenter[spec.links - 1].z + this.segLocal / 2);
    const bone = (name: string) => {
      const b = ctx.root.getObjectByName(name);
      if (!b) throw new Error(`Flail: tulang "${name}" tidak ada`);
      return b;
    };
    this.bones = spec.colliders.map((k) => [bone(k.from), bone(k.to), k.radius]);
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
    const drag = this.spec.drag ?? 1.2;
    const WARMUP = Math.max(2, Math.ceil(SETTLE / D));
    const n = this.spec.links + 1; // titik tali: 0 = ujung gagang, n-1 = pangkal bola
    pose(0);
    const mw = this.chain.matrixWorld;
    const scale = new THREE.Vector3().setFromMatrixScale(mw).x;
    const L = this.segLocal * scale;
    const anchor = () => this.anchorLocal.clone().applyMatrix4(mw);
    // Awal: tali lurus menggantung dari ujung gagang.
    const a0 = anchor();
    const x = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) x.set([a0.x, a0.y - i * L, a0.z], i * 3);
    const prev = Float32Array.from(x);
    const caps = this.bones.map(() => [new THREE.Vector3(), new THREE.Vector3()]);
    const p = new THREE.Vector3(), q = new THREE.Vector3(), ab = new THREE.Vector3();
    const samples: Float32Array[] = [];
    const w = (i: number) => (i === 0 ? 0 : i === n - 1 ? BALL_W : 1);

    for (let s = 0; s < steps * (WARMUP + 1); s++) {
      const cycle = Math.floor(s / steps);
      pose((s % steps) * dt);
      const a = anchor();
      this.bones.forEach(([f, t], k) => (f.getWorldPosition(caps[k][0]), t.getWorldPosition(caps[k][1])));
      for (let i = 1; i < n; i++)
        for (let d = 0; d < 3; d++) {
          const o = i * 3 + d;
          const vel = (x[o] - prev[o]) / dt;
          const air = d === 2 ? -wind : 0;
          const acc = (d === 1 ? GRAVITY : 0) + drag * (air - vel);
          prev[o] = x[o];
          x[o] += vel * dt + acc * dt * dt;
        }
      x.set([a.x, a.y, a.z], 0);
      prev.set([a.x, a.y, a.z], 0);
      for (let it = 0; it < ITER; it++) {
        for (let i = 0; i + 1 < n; i++) {
          const oi = i * 3, oj = oi + 3;
          const dx = x[oj] - x[oi], dy = x[oj + 1] - x[oi + 1], dz = x[oj + 2] - x[oi + 2];
          const dist = Math.hypot(dx, dy, dz) || 1e-6;
          const wi = w(i), wj = w(i + 1);
          const k = (dist - L) / dist / (wi + wj);
          x[oi] += dx * k * wi, x[oi + 1] += dy * k * wi, x[oi + 2] += dz * k * wi;
          x[oj] -= dx * k * wj, x[oj + 1] -= dy * k * wj, x[oj + 2] -= dz * k * wj;
        }
        for (let c = 0; c < caps.length; c++) {
          ab.subVectors(caps[c][1], caps[c][0]);
          const ll = ab.lengthSq() || 1e-6;
          const R = this.bones[c][2];
          for (let i = 1; i < n; i++) {
            p.fromArray(x, i * 3);
            const t = Math.min(1, Math.max(0, q.subVectors(p, caps[c][0]).dot(ab) / ll));
            q.copy(caps[c][0]).addScaledVector(ab, t);
            const d = p.distanceTo(q);
            if (d < R) p.sub(q).multiplyScalar(R / (d || 1e-6)).add(q).toArray(x, i * 3);
          }
        }
      }
      if (cycle === WARMUP) samples.push(Float32Array.from(x));
    }
    // Sambungan loop mulus seperti Cloth: offset akhir−awal meluruh linear sepanjang rekaman.
    const first = samples[0];
    samples.forEach((sm, k) => {
      const f = 1 - k / samples.length;
      for (let i = 3; i < sm.length; i++) sm[i] += (x[i] - first[i]) * f;
    });
    return { samples, duration: D };
  }

  /** Dipanggil setelah pose (clip, t) diterapkan dan matrixWorld segar. */
  apply(clipName: string, t: number) {
    let sim = this.cache.get(clipName);
    if (!sim) {
      sim = this.simulate(clipName);
      this.cache.set(clipName, sim);
      this.ctx.mixer.setTime(t);
      this.ctx.root.updateMatrixWorld(true);
    }
    const { samples, duration } = sim;
    const k = Math.round(((((t % duration) + duration) % duration) / duration) * samples.length) % samples.length;
    const world = samples[k];
    const inv = this.chain.matrixWorld.clone().invert();
    const n = this.spec.links + 1;
    const pts = Array.from({ length: n }, (_, i) => new THREE.Vector3().fromArray(world, i * 3).applyMatrix4(inv));
    // Ujung gagang mengikuti tangan persis (rekaman bisa tertinggal satu langkah dari pose yang diminta).
    pts[0].copy(this.anchorLocal);
    const Z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), mid = new THREE.Vector3(), v = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const pos = this.chain.geometry.attributes.position as THREE.BufferAttribute;
    const nrm = this.chain.geometry.attributes.normal as THREE.BufferAttribute;
    for (let li = 0; li < this.spec.links; li++) {
      dir.subVectors(pts[li + 1], pts[li]).normalize();
      mid.addVectors(pts[li], pts[li + 1]).multiplyScalar(0.5);
      rot.setFromUnitVectors(Z, dir);
      for (let i = 0; i < this.perLink; i++) {
        const vi = li * this.perLink + i;
        v.fromArray(this.chainRest, vi * 3).sub(this.linkCenter[li]).applyQuaternion(rot).add(mid);
        pos.setXYZ(vi, v.x, v.y, v.z);
        v.fromArray(this.chainNrm, vi * 3).applyQuaternion(rot);
        nrm.setXYZ(vi, v.x, v.y, v.z);
      }
    }
    pos.needsUpdate = nrm.needsUpdate = true;
    this.chain.geometry.computeBoundingSphere();
    // Bola: di perpanjangan ruas terakhir.
    dir.subVectors(pts[n - 1], pts[n - 2]).normalize();
    rot.setFromUnitVectors(Z, dir);
    const center = pts[n - 1].clone().addScaledVector(dir, this.ballLocal);
    const bpos = this.ball.geometry.attributes.position as THREE.BufferAttribute;
    const bnrm = this.ball.geometry.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < bpos.count; i++) {
      v.fromArray(this.ballRest, i * 3).sub(this.ballCenter).applyQuaternion(rot).add(center);
      bpos.setXYZ(i, v.x, v.y, v.z);
      v.fromArray(this.ballNrm, i * 3).applyQuaternion(rot);
      bnrm.setXYZ(i, v.x, v.y, v.z);
    }
    bpos.needsUpdate = bnrm.needsUpdate = true;
    this.ball.geometry.computeBoundingSphere();
  }
}
