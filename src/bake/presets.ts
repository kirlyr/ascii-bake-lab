// Preset per model. Pilih lewat /bake.html?model=<key>. Hasil disimpan ke public/baked/<key>.json.
import { DEFAULT_PARAMS, type BakeParams } from './bake';

export const PRESETS: Record<string, BakeParams> = {
  // Chibi, CC0. Lihat assets/models/kaykit/SOURCE.md
  knight: { ...DEFAULT_PARAMS },
  // Proporsi realistis (Mixamo "Vanguard" dari contoh Three.js). Hanya untuk uji proporsi,
  // tidak di-commit karena lisensi Mixamo melarang redistribusi file mentah. Lihat README.
  soldier: {
    ...DEFAULT_PARAMS,
    modelUrl: '/assets/models/threejs-examples/Soldier.glb',
    modelName: 'three.js examples / Soldier (Mixamo Vanguard)',
    rows: 90,
    // Model ini menghadap -Z, jadi kamera di +X dan hasilnya menghadap kiri.
    yaw: 90,
    facing: 'left',
    clips: { idle: 'Idle', walk: 'Walk' },
    layers: {
      body: { label: 'Badan', parts: { armor: ['vanguard_Mesh'] } },
      helmet: { label: 'Visor', parts: { visor: ['vanguard_visor'] } },
    },
    blade: undefined,
    hidden: [],
  },
};
