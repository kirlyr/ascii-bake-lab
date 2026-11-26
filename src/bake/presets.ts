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
  // Uji pasang aksesori Quaternius ke rig Mixamo (sementara, sebelum karakter final ada).
  mtest: {
    ...DEFAULT_PARAMS,
    modelUrl: '/assets/models/threejs-examples/Soldier.glb',
    modelName: 'test',
    rows: 90,
    yaw: 90,
    facing: 'left',
    clips: { idle: 'Idle', walk: 'Walk' },
    layers: {
      body: { label: 'Badan', parts: { armor: ['vanguard_Mesh'] } },
      helmet: { label: 'Helm', parts: { helmet: ['helmet:Grey', 'helmet:DarkGrey'] } },
      weapon: { label: 'Senjata', parts: { blade: ['sword:Metal'], hilt: ['sword:Red', 'sword:Gold', 'sword:Brown'] } },
    },
    hidden: ['vanguard_visor'],
    attachments: [
      { name: 'helmet', url: '/assets/models/quaternius/Helmet1.glb', bone: 'mixamorigHead', position: [0, 10, 2], rotation: [0, 0, 0], scale: 14 },
      { name: 'sword', url: '/assets/models/quaternius/Sword.glb', bone: 'mixamorigRightHand', position: [0, 8, 3], rotation: [0, 0, 0], scale: 23 },
    ],
    blade: { mesh: 'sword:Metal', axis: 'z', at: 0.0069, below: 'hilt', above: 'blade' },
  },
};
