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
  // Quaternius Universal Base Characters (CC0) + Universal Animation Library (CC0). Rig UE mannequin.
  hero: {
    ...DEFAULT_PARAMS,
    modelUrl: '/assets/models/quaternius-ubc/Superhero_Male_FullBody.gltf',
    modelName: 'Quaternius Universal Base Characters / Superhero_Male',
    rows: 90,
    animations: {
      idle: '/assets/models/quaternius-ubc/UAL1_Standard.glb#Idle_Loop',
      walk: '/assets/models/quaternius-ubc/UAL1_Standard.glb#Walk_Loop',
    },
    clips: { idle: 'idle', walk: 'walk' },
    layers: {
      body: { label: 'Badan', parts: { skin: ['SuperHero_Male', 'Eyes', 'Eyebrows'] } },
      helmet: { label: 'Helm', parts: { helmet: ['helmet:Grey', 'helmet:DarkGrey'] } },
      weapon: { label: 'Senjata', parts: { blade: ['sword:Metal'], hilt: ['sword:Red', 'sword:Gold', 'sword:Brown'] } },
    },
    hidden: [],
    attachments: [
      { name: 'helmet', url: '/assets/models/quaternius/Helmet1.glb', bone: 'Head', position: [0, 0.1, 0.02], rotation: [0, 0, 0], scale: 0.14 },
      { name: 'sword', url: '/assets/models/quaternius/Sword.glb', bone: 'hand_r', position: [0, 0.08, 0.03], rotation: [0, 0, 0], scale: 0.3 },
    ],
    blade: { mesh: 'sword:Metal', axis: 'z', at: 0.0069, below: 'hilt', above: 'blade' },
  },
  ranger: {
    ...DEFAULT_PARAMS,
    modelUrl: '/assets/models/quaternius-outfits/Male_Ranger.gltf',
    modelName: 'Quaternius Modular Character Outfits Fantasy / Male_Ranger',
    rows: 90,
    animations: {
      idle: '/assets/models/quaternius-ubc/UAL1_Standard.glb#Idle_Loop',
      walk: '/assets/models/quaternius-ubc/UAL1_Standard.glb#Walk_Loop',
    },
    clips: { idle: 'idle', walk: 'walk' },
    layers: {
      body: {
        label: 'Badan',
        parts: {
          skin: ['Male_Ranger_Arms_1', 'Male_Ranger_Arms_2'],
          cloth: ['Male_Ranger_Body', 'Male_Ranger_Legs', 'Male_Ranger_Head_Hood'],
          leather: ['Male_Ranger_Body_Belt_1', 'Male_Ranger_Body_Belt_2', 'Male_Ranger_Feet_Boots', 'Male_Ranger_Arms_Bracer', 'Male_Ranger_Acc_Pauldron'],
        },
      },
      weapon: { label: 'Senjata', parts: { blade: ['sword:Metal'], hilt: ['sword:Red', 'sword:Gold', 'sword:Brown'] } },
    },
    hidden: [],
    attachments: [
      { name: 'sword', url: '/assets/models/quaternius/Sword.glb', bone: 'hand_r', position: [0, 0.08, 0.03], rotation: [0, 0, 0], scale: 0.3 },
    ],
    blade: { mesh: 'sword:Metal', axis: 'z', at: 0.0069, below: 'hilt', above: 'blade' },
  },
  peasant: {
    ...DEFAULT_PARAMS,
    modelUrl: '/assets/models/quaternius-outfits/Male_Peasant.gltf',
    modelName: 'Quaternius Modular Character Outfits Fantasy / Male_Peasant',
    rows: 90,
    animations: {
      idle: '/assets/models/quaternius-ubc/UAL1_Standard.glb#Idle_Loop',
      walk: '/assets/models/quaternius-ubc/UAL1_Standard.glb#Walk_Loop',
    },
    clips: { idle: 'idle', walk: 'walk' },
    layers: {
      body: {
        label: 'Badan',
        parts: {
          skin: ['Male_Peasant_Arms_1', 'Male_Peasant_Arms_2'],
          cloth: ['Male_Peasant_Body', 'Male_Peasant_Legs', 'Male_Peasant_Body_1', 'Male_Peasant_Body_2', 'Male_Peasant_Legs_1', 'Male_Peasant_Legs_2'],
          leather: ['Male_Peasant_Feet', 'Male_Peasant_Feet_1', 'Male_Peasant_Feet_2'],
        },
      },
      weapon: { label: 'Senjata', parts: { blade: ['sword:Metal'], hilt: ['sword:Red', 'sword:Gold', 'sword:Brown'] } },
    },
    hidden: [],
    attachments: [
      { name: 'sword', url: '/assets/models/quaternius/Sword.glb', bone: 'hand_r', position: [0, 0.08, 0.03], rotation: [0, 0, 0], scale: 0.3 },
    ],
    blade: { mesh: 'sword:Metal', axis: 'z', at: 0.0069, below: 'hilt', above: 'blade' },
  },
};
