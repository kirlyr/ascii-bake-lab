// Inti bake: render model 3D → grid sel (shade level + part id + depth) per layer per frame.
// Three.js hanya dipakai di sini (dev). Output = BakeFile JSON v2.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { b64encode, EMPTY_DEPTH, MAX_PARTS, MAX_SHADES, packCell, type BakeFile, type BladeSocket, type FrameData, type SocketPoint } from '../shared/format';
import { buildGlyphSet, makeMatcher, DIMS, REG_X, REG_Y } from './glyphs';

export interface LayerDef {
  label: string;
  /**
   * Slot equipment (mis. `helmet`, `weapon`). Layer dengan slot sama = varian yang saling menggantikan;
   * player memasang maksimal satu per slot. Tanpa slot = selalu tampil (badan).
   */
  slot?: string;
  /** hanya layer senjata: split hilt/blade + sumber socket blade. */
  blade?: BladeSplit;
  /** meter. Layer ini menang atas layer yang lebih dekat ≤ jarak ini (lihat LayerData.bias). */
  bias?: number;
  /** part → mesh. Part menentukan material di runtime (lihat src/shared/materials.ts). */
  parts: Record<string, string[]>;
}

/**
 * Bagi satu mesh senjata jadi dua part di sepanjang sumbu lokalnya (mis. hilt | blade),
 * sekaligus sumber socket blade: pangkal = titik potong, ujung = ujung sumbu.
 */
export interface BladeSplit {
  mesh: string;
  axis: 'x' | 'y' | 'z';
  /** posisi potong di koordinat lokal mesh. */
  at: number;
  /** part di sisi < at dan >= at. Ujung blade = sisi `above`. */
  below: string;
  above: string;
}

/**
 * Aksesori (helm, pedang, dll.) dari file terpisah yang dipasang ke tulang model saat bake.
 * Mesh-nya terdaftar sebagai `<name>:<nama material>`, jadi part bisa dipetakan per material.
 */
export interface Attachment {
  name: string;
  url: string;
  /** nama tulang, tanpa ':' (mis. `mixamorigHead`). */
  bone: string;
  /** offset di ruang tulang. rotation dalam derajat (XYZ). */
  position: [number, number, number];
  rotation: [number, number, number];
  /** angka = seragam; [x, y, z] = per sumbu ruang tulang (mis. zirah dibuat lebih tebal). */
  scale: number | [number, number, number];
  /** derajat. Putar aksesori di sumbu panjangnya (Y setelah node -90° X) sebelum `rotation`. */
  spin?: number;
}

export interface PoseOverlay {
  /** `url#NamaClip` sumber pose. */
  from: string;
  /** detik di clip sumber yang diambil. */
  at: number;
  /** nama tulang yang ditimpa (dibandingkan tanpa non-alfanumerik). */
  bones: string[];
  /** rotasi tambahan per tulang (derajat XYZ, ruang lokal), dikalikan setelah pose sumber. */
  adjust?: Record<string, [number, number, number]>;
}

const layerMeshes = (l: LayerDef) => Object.values(l.parts).flat();

export interface BakeParams {
  modelUrl: string;
  modelName: string;
  rows: number;
  cellAspect: number;
  /** 0 = otomatis dari lebar silhouette. */
  cols: number;
  /** sub-pixel per sel (horizontal). Vertikal = SUB / cellAspect. */
  sub: number;
  fps: number;
  /** derajat. 0 = kamera di depan model, -90 = samping (model hadap kanan). */
  yaw: number;
  /**
   * Bake beberapa arah sekaligus (derajat, menggantikan `yaw`). Framing dikunci bersama dan grid dipusatkan
   * ke origin model. Arah sebaliknya dibuat player dengan mirror, jadi cukup 0..-180.
   */
  views?: number[];
  /**
   * Jumlah frame tetap per clip, diambil merata sepanjang clip (mis. 4 = napas idle untuk putar karakter).
   * Tanpa ini: clip di-bake penuh di `fps`. fps output file = stillFrames / durasi clip pertama.
   */
  stillFrames?: number;
  /** arah hadap model di hasil bake (tergantung orientasi model + yaw). */
  facing: 'left' | 'right';
  /** derajat, kamera sedikit dari atas. */
  pitch: number;
  clips: Record<string, string>; // nama output → nama clip di glb
  layers: Record<string, LayerDef>;
  /** clip dari file terpisah: nama clip → `url` (clip pertama) atau `url#NamaClip`. */
  animations?: Record<string, string>;
  /**
   * Timpa rotasi tulang tertentu di clip dengan pose diam dari clip lain (mis. lengan kanan dari `Sword_Idle`),
   * supaya tangan menggenggam senjata tanpa ikut ayunan. Kunci = nama clip (setelah `animations`).
   */
  overlays?: Record<string, PoseOverlay>;
  attachments?: Attachment[];
  /**
   * Outfit skinned dengan rig yang sama (mis. Quaternius Modular Outfits di atas Universal Base Characters).
   * Mesh-nya di-bind ulang ke skeleton model utama, jadi ikut animasi yang sama.
   */
  outfits?: string[];
  /**
   * meter. Outfit digelembungkan sepanjang normal sebelum skinning, supaya badan yang lebih besar
   * (Superhero vs tubuh Regular untuk outfit Ranger) tidak menembus.
   */
  outfitInflate?: number;
  /** mesh yang selalu disembunyikan. */
  hidden: string[];
  /** ramp gelap → terang. Index glyph hasil shape matching = shade level. */
  charset: string;
  /**
   * 0..1. Porsi warna tekstur di shade level. 0 = hanya pencahayaan (albedo putih), 1 = tekstur penuh.
   * Tekstur gelap (celana hijau tua, kulit samak) membuat glyph terlalu jarang; warna part datang dari material.
   */
  albedo: number;
  /** kecerahan minimum area tertutup (0..1), supaya bagian gelap tetap rapat. */
  minLight: number;
  gamma: number;
  /** eksponen kontras shape vector. >1 = tepi lebih tajam. */
  sharpness: number;
  /** cakupan minimum sel (0..1) agar dianggap terisi. */
  minCoverage: number;
  /** intensitas lampu: ambient (hemisphere), key (depan-atas), rim (belakang). */
  ambient: number;
  keyLight: number;
  rimLight: number;
  /**
   * Kuantisasi depth (unit 0..254). 4 ≈ 1,8 cm untuk hero: cukup untuk compose, dan gzip hero.json
   * turun ±30% karena noise depth 8-bit hilang.
   */
  depthStep: number;
  /** padding grid di sekitar bounding box, dalam sel. */
  pad: number;
}

const Q = '/assets/models/quaternius';
const UBC = '/assets/models/quaternius-ubc';
const UAL = `${UBC}/UAL_subset.glb`;
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((f) => [1, 2, 3].map((i) => `${f}_0${i}_r`));
// Semua helm/senjata Knight Pack punya origin + skala sama, jadi satu posisi attach per slot.
const helm = (name: string, url: string): Attachment => ({ name, url, bone: 'Head', position: [0, 0.095, 0.0], rotation: [0, 0, 0], scale: 0.165 });
// Dengan pose kepalan Sword_Idle: blade turun ke depan, sisi lebar menghadap kamera (Z 90°).
const weapon = (name: string, url: string, spin = 0): Attachment => ({ name, url, bone: 'hand_r', position: [0, 0.08, 0.03], rotation: [25, 0, 90], scale: 0.22, spin });
// Modular Weapons Pack + Ultimate RPG Pack (CC0): konvensi node sama dengan Knight Pack, ukuran sedikit lebih besar.
const W = '/assets/models/quaternius-weapons';
const O = '/assets/models/quaternius-outfits';
const SWORD_ARM: PoseOverlay = { from: `${UAL}#Sword_Idle`, at: 0, bones: ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', ...FINGERS] };

// Karakter utama: badan Quaternius Universal Base Characters (Superhero_Male, proporsi realistis),
// armor = outfit Ranger (rig sama), helm + pedang dari Quaternius Animated Knight Pack. Semua CC0.
// Rig UE mannequin (`Head`, `hand_r`). Animasi dari Universal Animation Library (dipangkas ke 2 clip).
export const DEFAULT_PARAMS: BakeParams = {
  modelUrl: `${UBC}/Superhero_Male_FullBody.gltf`,
  modelName: 'Quaternius Universal Base Characters / Superhero_Male + Ranger outfit',
  cols: 0,
  rows: 90,
  cellAspect: 0.5,
  sub: 6,
  fps: 12,
  yaw: -90,
  facing: 'right',
  pitch: 8,
  animations: { idle: `${UAL}#Idle_Loop`, walk: `${UAL}#Walk_Loop` },
  // Animasi idle/walk gratis tidak menggenggam senjata: lengan kanan + jari dikunci ke pose `Sword_Idle`
  // (kepalan), jadi pedang tetap di tangan dan tidak terayun ke belakang saat walk.
  overlays: { idle: SWORD_ARM, walk: SWORD_ARM },
  clips: { idle: 'idle', walk: 'walk' },
  outfits: [`${O}/Male_Ranger.gltf`, `${O}/Male_Peasant.gltf`],
  outfitInflate: 0.02,
  attachments: [
    ...['Helmet1', 'Helmet2', 'Helmet3'].map((h) => helm(h.toLowerCase(), `${Q}/${h}.glb`)),
    weapon('sword', `${Q}/Sword.glb`),
    weapon('shortsword', `${Q}/ShortSword.glb`),
    // Sisi lebar Katana ada di sumbu lokal lain dari pedang Quaternius lainnya.
    weapon('katana', `${Q}/Katana.glb`, 90),
    weapon('club', `${Q}/Club.glb`),
    { ...weapon('axe', `${W}/Axe.glb`, 90), scale: 0.18 },
    { ...weapon('hammer', `${W}/Hammer_Double.glb`), scale: 0.18 },
    { ...weapon('scythe', `${W}/Scythe.glb`, 90), scale: 0.18 },
    // Tombak dipegang tegak (seperti penjaga), ujung ke atas: grid tidak melebar 2 m ke depan.
    { ...weapon('spear', `${W}/Spear.glb`), rotation: [0, 0, 180], scale: 0.18 },
    { ...helm('crown', `${W}/Crown.glb`), position: [0, 0.17, 0.02], scale: 0.2 },
    { ...helm('crown2', `${W}/Crown2.glb`), position: [0, 0.17, 0.02], scale: 0.2 },
    // Jubah buatan sendiri (assets/models/cloak/make_cloak.py), sudah Y-atas dalam meter. Kaku, ikut dada.
    { name: 'cloak', url: '/assets/models/cloak/Cloak.glb', bone: 'spine_03', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    // Sayap bulu buatan sendiri (assets/models/wings/make_wings.py), sudah Y-atas dalam meter. Satu slot dengan jubah.
    { name: 'wings', url: '/assets/models/wings/Wings.glb', bone: 'spine_03', position: [0, 0.02, 0], rotation: [0, 0, 0], scale: 1 },
    // Bantalan bahu Knight Pack: satu mesh melintang kedua bahu, ditempel ke tulang dada atas, miring 45°.
    // Zirah dada Ultimate RPG Pack (item statis, tidak di-rig): ditempel ke tulang dada atas.
    ...['Black', 'Golden', 'Leather', 'Metal', 'Metal2'].map((m): Attachment => ({
      name: `cuirass_${m.toLowerCase()}`,
      url: `${W}/Armor_${m}.glb`,
      bone: 'spine_03',
      position: [0, -0.055, -0.015],
      rotation: [0, 0, 0],
      scale: [0.58, 0.6, 0.72],
    })),
    { name: 'pads', url: `${Q}/ShoulderPads.glb`, bone: 'spine_03', position: [0, 0.13, 0], rotation: [45, 0, 0], scale: 0.28 },
  ],
  layers: {
    body: { label: 'Badan', parts: { skin: ['SuperHero_Male', 'Eyes', 'Eyebrows'] } },
    // Outfit dipecah per bagian (mesh Ranger/Peasant memang terpisah), jadi bisa mix and match.
    // Badan Superhero lebih besar dari tubuh untuk outfit ini: kulit menembus beberapa cm, jadi bias 4 cm.
    ranger_torso: {
      label: 'Rompi Ranger',
      slot: 'torso',
      bias: 0.04,
      parts: { cloth: ['Male_Ranger_Body'], leather: ['Male_Ranger_Body_Belt_1', 'Male_Ranger_Body_Belt_2', 'Male_Ranger_Arms_Bracer'] },
    },
    peasant_torso: { label: 'Tunik Petani', slot: 'torso', bias: 0.04, parts: { linen: ['Male_Peasant_Body', 'Male_Peasant_Arms_1'] } },
    cuirass_leather: { bias: 0.04, label: 'Leather Cuirass', slot: 'torso', parts: { leather: ['cuirass_leather:Brown'] } },
    cuirass_metal: { bias: 0.04, label: 'Iron Cuirass', slot: 'torso', parts: { armor: ['cuirass_metal:DarkSteel'] } },
    cuirass_metal2: { bias: 0.04, label: 'Steel Cuirass', slot: 'torso', parts: { armor: ['cuirass_metal2:LightSteel'] } },
    cuirass_black: { bias: 0.04, label: 'Blackguard Cuirass', slot: 'torso', parts: { armor: ['cuirass_black:Black'], gem: ['cuirass_black:DarkRed'] } },
    cuirass_golden: { bias: 0.04, label: 'Golden Cuirass', slot: 'torso', parts: { trim: ['cuirass_golden:Golden'] } },
    ranger_legs: { label: 'Celana Ranger', slot: 'legs', bias: 0.04, parts: { cloth: ['Male_Ranger_Legs'] } },
    peasant_legs: { label: 'Celana Petani', slot: 'legs', bias: 0.04, parts: { wool: ['Male_Peasant_Legs'] } },
    ranger_feet: { label: 'Sepatu Ranger', slot: 'feet', bias: 0.04, parts: { leather: ['Male_Ranger_Feet_Boots'] } },
    peasant_feet: { label: 'Sepatu Petani', slot: 'feet', bias: 0.04, parts: { wool: ['Male_Peasant_Feet'] } },
    ranger_pauldron: { label: 'Pauldron Ranger', slot: 'shoulder', bias: 0.04, parts: { armor: ['Male_Ranger_Acc_Pauldron'] } },
    knight_pads: { label: 'Bahu Ksatria', slot: 'shoulder', parts: { armor: ['pads:Grey'] } },
    cloak: { label: 'Cloak', slot: 'back', parts: { cloak: ['cloak:Cloth'] } },
    wings: { label: 'Feathered Wings', slot: 'back', parts: { feather: ['wings:Feather', 'wings:Bone'] } },
    // Varian per slot = layer terpisah. Ukuran file = jumlah layer, bukan kombinasi.
    helmet1: { bias: 0.02, label: 'Helm Besi', slot: 'helmet', parts: { helmet: ['helmet1:Grey', 'helmet1:DarkGrey'] } },
    helmet2: { bias: 0.02, label: 'Helm Ksatria', slot: 'helmet', parts: { helmet: ['helmet2:Grey'] } },
    helmet3: { bias: 0.02, label: 'Helm Bangsawan', slot: 'helmet', parts: { helmet: ['helmet3:Grey', 'helmet3:Black'], trim: ['helmet3:Golden'] } },
    crown: { label: 'Mahkota', slot: 'helmet', parts: { trim: ['crown:Gold'] } },
    crown2: { label: 'Mahkota Rubi', slot: 'helmet', parts: { trim: ['crown2:Gold'], gem: ['crown2:Red'] } },
    // Pedang Quaternius: blade sudah mesh terpisah, sumbu lokal +Z. `at` = pangkal blade (sumber socket).
    sword: {
      label: 'Pedang',
      slot: 'weapon',
      parts: { blade: ['sword:Metal'], hilt: ['sword:Red', 'sword:Gold', 'sword:Brown'] },
      blade: { mesh: 'sword:Metal', axis: 'z', at: 0.0069, below: 'hilt', above: 'blade' },
    },
    shortsword: {
      label: 'Pedang Pendek',
      slot: 'weapon',
      parts: { blade: ['shortsword:Grey'], hilt: ['shortsword:Red', 'shortsword:Gold', 'shortsword:Brown'] },
      blade: { mesh: 'shortsword:Grey', axis: 'z', at: 0.0062, below: 'hilt', above: 'blade' },
    },
    katana: {
      label: 'Katana',
      slot: 'weapon',
      parts: { blade: ['katana:Metal'], hilt: ['katana:Black', 'katana:Golden'] },
      blade: { mesh: 'katana:Metal', axis: 'z', at: 0.0046, below: 'hilt', above: 'blade' },
    },
    // Gada: kepala kayu tetap kayu, paku + cincin di kepala (mesh Black, z >= 0.012) ikut material forge,
    // lilitan gagang (Black, z < 0.012) = hilt. Socket rune di sepanjang kepala.
    club: {
      label: 'Gada',
      slot: 'weapon',
      parts: { wood: ['club:Wood'], hilt: ['club:Black'] },
      blade: { mesh: 'club:Black', axis: 'z', at: 0.012, below: 'hilt', above: 'blade' },
    },
    // Modular Weapons Pack: Steel + LightSteel = mata senjata (ikut forge), kayu = gagang.
    axe: {
      label: 'Kapak',
      slot: 'weapon',
      parts: { blade: ['axe:Steel', 'axe:LightSteel'], wood: ['axe:DarkWood', 'axe:LightWood'] },
      blade: { mesh: 'axe:Steel', axis: 'z', at: 0.011, below: 'blade', above: 'blade' },
    },
    spear: {
      label: 'Tombak',
      slot: 'weapon',
      parts: { blade: ['spear:Steel', 'spear:LightSteel'], wood: ['spear:DarkWood', 'spear:LightWood'] },
      blade: { mesh: 'spear:Steel', axis: 'z', at: 0.057, below: 'blade', above: 'blade' },
    },
    // Palu: mesh Steel juga berisi cincin gagang (z < 0.015) = hilt; kepala = blade.
    hammer: {
      label: 'Palu Perang',
      slot: 'weapon',
      parts: { blade: ['hammer:Steel', 'hammer:LightSteel'], wood: ['hammer:DarkWood', 'hammer:LightWood'] },
      blade: { mesh: 'hammer:Steel', axis: 'z', at: 0.015, below: 'hilt', above: 'blade' },
    },
    // Sabit: mata melintang di ujung gagang, sumbu lokal X.
    scythe: {
      label: 'Sabit Maut',
      slot: 'weapon',
      parts: { blade: ['scythe:Steel', 'scythe:LightSteel'], wood: ['scythe:DarkWood', 'scythe:LightWood'] },
      blade: { mesh: 'scythe:Steel', axis: 'x', at: -0.006, below: 'blade', above: 'blade' },
    },
  },
  // Mesh outfit yang tidak dipakai (lengan Ranger bertumpuk dengan lengan badan, hood diganti helm).
  hidden: ['Male_Ranger_Arms_1', 'Male_Ranger_Arms_2', 'Male_Ranger_Head_Hood', 'Male_Peasant_Arms_2'],
  // Ramp density gelap → terang. Shape vector tetap memilih di antara glyph ini,
  // jadi tepi tetap mengikuti silhouette. Charset penuh terlalu ramai (lihat README).
  charset: '.:-=+*#%@',
  albedo: 0.5,
  minLight: 0.22,
  gamma: 1.8,
  sharpness: 2.0,
  minCoverage: 0.12,
  ambient: 0.5,
  keyLight: 3.5,
  rimLight: 1.2,
  depthStep: 4,
  pad: 1,
};

const depthVert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying float vViewZ;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewZ = -mvPosition.z;
}`;
const depthFrag = /* glsl */ `
uniform float uNear;
uniform float uFar;
varying float vViewZ;
void main() {
  gl_FragColor = vec4(clamp((vViewZ - uNear) / (uFar - uNear), 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

function makeDepthMaterial(near: number, far: number) {
  return new THREE.ShaderMaterial({
    vertexShader: depthVert,
    fragmentShader: depthFrag,
    uniforms: { uNear: { value: near }, uFar: { value: far } },
  });
}

// Pass part id: tiap mesh dapat material ini dengan id-nya sendiri. Output = (id + 1) / 255,
// 0 = kosong. Mesh senjata yang di-split memilih id berdasarkan posisi lokal di sumbu.
const idVert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform vec3 uAxis;
varying float vT;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  vT = dot(position, uAxis);
  #include <skinning_vertex>
  #include <project_vertex>
}`;
const idFrag = /* glsl */ `
uniform float uBelow;
uniform float uAbove;
uniform float uAt;
varying float vT;
void main() {
  float id = vT < uAt ? uBelow : uAbove;
  gl_FragColor = vec4((id + 1.0) / 255.0, 0.0, 0.0, 1.0);
}`;

function makeIdMaterial(below: number, above = below, axis = new THREE.Vector3(0, 1, 0), at = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: idVert,
    fragmentShader: idFrag,
    uniforms: { uAxis: { value: axis }, uAt: { value: at }, uBelow: { value: below }, uAbove: { value: above } },
  });
}

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export interface BakeContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  animations: THREE.AnimationClip[];
  meshes: Map<string, THREE.Object3D>;
}

const loadAny = async (url: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> => {
  if (/\.fbx$/i.test(url)) {
    const g = await new FBXLoader().loadAsync(url);
    return { scene: g, animations: g.animations };
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  return { scene: gltf.scene, animations: gltf.animations };
};

/** Nama tulang dibandingkan tanpa karakter non-alfanumerik (GLTF/FBX loader membuang ':' secara berbeda). */
const norm = (n: string) => n.replace(/[^a-z0-9]/gi, '').toLowerCase();

export async function loadModel(p: BakeParams, renderer: THREE.WebGLRenderer): Promise<BakeContext> {
  const model = await loadAny(p.modelUrl);
  const scene = new THREE.Scene();
  const root = model.scene;
  scene.add(root);
  const meshes = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.set(o.name, o);
  });

  const boneByName = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) boneByName.set(norm(o.name), o as THREE.Bone);
  });
  for (const url of p.outfits ?? []) {
    const outfit = (await loadAny(url)).scene;
    outfit.updateMatrixWorld(true);
    const skinned: THREE.SkinnedMesh[] = [];
    outfit.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
    });
    for (const m of skinned) {
      const bones = m.skeleton.bones.map((b) => {
        const mine = boneByName.get(norm(b.name));
        if (!mine) throw new Error(`Tulang "${b.name}" dari outfit tidak ada di model`);
        return mine;
      });
      const bindMatrix = m.bindMatrix.clone();
      root.attach(m);
      m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), bindMatrix);
      if (p.outfitInflate) {
        const g = (m.geometry = m.geometry.clone());
        const pos = g.attributes.position, nor = g.attributes.normal;
        // Inflate dalam meter dunia: bagi skala mesh supaya tidak tergantung unit file (cm vs m).
        m.updateMatrixWorld(true);
        const k = p.outfitInflate / m.matrixWorld.getMaxScaleOnAxis();
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * k, pos.getY(i) + nor.getY(i) * k, pos.getZ(i) + nor.getZ(i) * k);
      }
      meshes.set(m.name, m);
    }
  }

  const animations = [...model.animations];
  for (const [name, ref] of Object.entries(p.animations ?? {})) {
    // `url#NamaClip` memilih clip tertentu; tanpa `#` = clip pertama di file.
    const [url, want] = ref.split('#');
    const all = (await loadAny(url)).animations;
    const clip = (want ? all.find((c) => c.name === want) : all[0])?.clone();
    if (!clip) throw new Error(`Animasi ${ref} tidak ada`);
    clip.name = name;
    animations.push(clip);
  }
  for (const [name, o] of Object.entries(p.overlays ?? {})) {
    const clip = animations.find((c) => c.name === name);
    if (!clip) throw new Error(`Overlay: clip "${name}" tidak ada`);
    const [url, want] = o.from.split('#');
    const src = (await loadAny(url)).animations.find((c) => c.name === want);
    if (!src) throw new Error(`Overlay: clip ${o.from} tidak ada`);
    const bones = new Set(o.bones.map(norm));
    const adjust = new Map(Object.entries(o.adjust ?? {}).map(([b, r]) => [norm(b), r]));
    const isTarget = (t: THREE.KeyframeTrack) => t.name.endsWith('.quaternion') && bones.has(norm(t.name.slice(0, -11)));
    clip.tracks = clip.tracks.filter((t) => !isTarget(t));
    for (const t of src.tracks.filter(isTarget)) {
      const q = new THREE.Quaternion().fromArray(new THREE.QuaternionLinearInterpolant(t.times, t.values, 4, new Float32Array(4)).evaluate(o.at));
      const r = adjust.get(norm(t.name.slice(0, -11)));
      if (r) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r.map(THREE.MathUtils.degToRad) as [number, number, number]))));
      clip.tracks.push(new THREE.QuaternionKeyframeTrack(t.name, [0], q.toArray()));
    }
  }

  for (const a of p.attachments ?? []) {
    let bone: THREE.Object3D | undefined;
    root.traverse((o) => {
      if (!bone && norm(o.name) === norm(a.bone)) bone = o;
    });
    if (!bone) throw new Error(`Tulang "${a.bone}" tidak ada di model`);
    const acc = (await loadAny(a.url)).scene;
    const holder = new THREE.Group();
    holder.name = a.name;
    holder.add(acc);
    acc.rotation.y = THREE.MathUtils.degToRad(a.spin ?? 0);
    holder.position.fromArray(a.position);
    holder.rotation.set(...(a.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
    if (typeof a.scale === 'number') holder.scale.setScalar(a.scale);
    else holder.scale.set(...a.scale);
    bone.add(holder);
    acc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.name = `${a.name}:${(m.material as THREE.Material).name}`;
      meshes.set(m.name, m);
    });
  }

  return {
    renderer,
    scene,
    camera: new THREE.OrthographicCamera(),
    root,
    mixer: new THREE.AnimationMixer(root),
    animations,
    meshes,
  };
}

function setVisible(ctx: BakeContext, names: Set<string> | null) {
  for (const [name, m] of ctx.meshes) m.visible = names ? names.has(name) : true;
}

function poseAt(ctx: BakeContext, clipName: string, t: number) {
  const clip = ctx.animations.find((a) => a.name === clipName);
  if (!clip) throw new Error(`Clip "${clipName}" tidak ada di model`);
  ctx.mixer.stopAllAction();
  const action = ctx.mixer.clipAction(clip);
  action.reset().play();
  ctx.mixer.setTime(t);
  ctx.root.updateMatrixWorld(true);
  return clip;
}

function frameCount(clip: THREE.AnimationClip, p: BakeParams) {
  return p.stillFrames ?? Math.max(1, Math.round(clip.duration * p.fps));
}

/** Detik di clip untuk frame ke-i. */
const frameTime = (clip: THREE.AnimationClip, p: BakeParams, i: number) => (p.stillFrames ? (i * clip.duration) / p.stillFrames : i / p.fps);

const viewDir = (yawDeg: number, pitchDeg: number) => {
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
};

function aimCamera(cam: THREE.OrthographicCamera, dir: THREE.Vector3) {
  cam.position.copy(dir).multiplyScalar(20);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
}

/** Framing bersama semua arah (ruang kamera; kamera selalu melihat origin dari jarak 20). */
export interface Framing {
  left: number;
  right: number;
  bottom: number;
  top: number;
  near: number;
  far: number;
  cols: number;
}

/**
 * Ukur framing dari silhouette semua frame semua clip di semua arah, lalu kunci untuk seluruh bake.
 * Satu arah: grid dipusatkan ke silhouette (paling rapat). Banyak arah: dipusatkan ke origin model,
 * supaya karakter tidak bergeser saat diputar dan mirror tetap di poros yang sama.
 */
function measureFraming(ctx: BakeContext, p: BakeParams, visible: Set<string>, yaws: number[]): Framing {
  const cam = ctx.camera;
  // Framing diukur dari hasil render (silhouette), bukan bounding box geometri:
  // bounding box skinned mesh terlalu longgar. Pass 1: frustum lebar.
  setVisible(ctx, visible);
  poseAt(ctx, Object.values(p.clips)[0], 0);
  const sphere = new THREE.Box3().setFromObject(ctx.root).getBoundingSphere(new THREE.Sphere());
  const R = sphere.radius * 2;
  const M = 512;
  const rt = new THREE.WebGLRenderTarget(M, M);
  const mat = makeDepthMaterial(0.01, 40);
  const buf = new Uint8Array(M * M * 4);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, near = Infinity, far = -Infinity;
  const r = ctx.renderer;
  r.setClearColor(0x000000, 0);
  ctx.scene.overrideMaterial = mat;
  for (const yaw of yaws) {
    aimCamera(cam, viewDir(yaw, p.pitch));
    const c0 = sphere.center.clone().applyMatrix4(cam.matrixWorldInverse);
    Object.assign(cam, { left: c0.x - R, right: c0.x + R, bottom: c0.y - R, top: c0.y + R, near: 0.01, far: 40 });
    cam.updateProjectionMatrix();
    let x0 = M, x1 = -1, y0 = M, y1 = -1, d0 = 255, d1 = 0;
    for (const clipName of Object.values(p.clips)) {
      const clip = poseAt(ctx, clipName, 0);
      const n = frameCount(clip, p);
      for (let i = 0; i < n; i++) {
        poseAt(ctx, clipName, frameTime(clip, p, i));
        r.setRenderTarget(rt);
        r.clear();
        r.render(ctx.scene, cam);
        r.readRenderTargetPixels(rt, 0, 0, M, M, buf);
        for (let y = 0; y < M; y++)
          for (let x = 0; x < M; x++) {
            const k = (y * M + x) * 4;
            if (!buf[k + 3]) continue;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x);
            y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            d0 = Math.min(d0, buf[k]); d1 = Math.max(d1, buf[k]);
          }
      }
    }
    if (x1 < 0) throw new Error(`Model tidak terlihat oleh kamera (yaw ${yaw})`);
    const px = (2 * R) / M;
    minX = Math.min(minX, cam.left + x0 * px);
    maxX = Math.max(maxX, cam.left + (x1 + 1) * px);
    minY = Math.min(minY, cam.bottom + y0 * px);
    maxY = Math.max(maxY, cam.bottom + (y1 + 1) * px);
    near = Math.min(near, cam.near + (d0 / 255) * (cam.far - cam.near) - 0.05);
    far = Math.max(far, cam.near + ((d1 + 1) / 255) * (cam.far - cam.near) + 0.05);
  }
  ctx.scene.overrideMaterial = null;
  r.setRenderTarget(null);
  rt.dispose();
  mat.dispose();

  if (yaws.length > 1) {
    const half = Math.max(-minX, maxX);
    minX = -half;
    maxX = half;
  }
  // Tinggi model = rows (minus padding). cols = 0 berarti lebar grid otomatis
  // mengikuti lebar silhouette; kalau diisi, grid dipaksa ke ukuran itu.
  const cellH = (maxY - minY) / (p.rows - 2 * p.pad);
  const cellW = cellH * p.cellAspect;
  let cols = p.cols > 0 ? p.cols : Math.ceil((maxX - minX) / cellW) + 2 * p.pad;
  if (yaws.length > 1 && cols % 2) cols++; // origin tepat di tengah grid, mirror tidak menggeser poros
  let w = maxX - minX + 2 * p.pad * cellW;
  let h = maxY - minY + 2 * p.pad * cellH;
  const gridAspect = (cols * p.cellAspect) / p.rows;
  if (w / h > gridAspect) h = w / gridAspect;
  else w = h * gridAspect;
  const cx = (minX + maxX) / 2;
  // Kaki menempel ke bawah grid supaya idle/walk sejajar.
  const bottom = minY - p.pad * cellH;
  return { left: cx - w / 2, right: cx + w / 2, bottom, top: bottom + h, near: Math.max(0.01, near - 0.5), far: far + 0.5, cols };
}

/** Pasang kamera (framing terkunci) + lampu untuk satu arah. Lampu ikut kamera, jadi shading konsisten antar arah. */
function setupView(ctx: BakeContext, p: BakeParams, fr: Framing, yaw: number) {
  const dir = viewDir(yaw, p.pitch);
  const cam = ctx.camera;
  aimCamera(cam, dir);
  Object.assign(cam, { left: fr.left, right: fr.right, bottom: fr.bottom, top: fr.top, near: fr.near, far: fr.far });
  cam.updateProjectionMatrix();

  // Lampu: key dari depan-atas (sisi kamera), fill lembut, rim dari belakang.
  ctx.scene.children.filter((o) => (o as THREE.Light).isLight).forEach((l) => ctx.scene.remove(l));
  ctx.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1d12, p.ambient));
  const key = new THREE.DirectionalLight(0xffffff, p.keyLight);
  const keyDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(35));
  key.position.copy(keyDir).multiplyScalar(10).add(new THREE.Vector3(0, 8, 0));
  ctx.scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9a0, p.rimLight);
  rim.position.copy(dir).multiplyScalar(-10).add(new THREE.Vector3(0, 4, 0));
  ctx.scene.add(rim);
}

interface RawCells {
  /** shape vector per sel, panjang cols*rows*DIMS */
  shape: Float32Array;
  coverage: Float32Array;
  /** part id mayoritas di sel. */
  part: Uint8Array;
  depth: Uint8Array;
}

function luma(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function sampleCells(
  p: BakeParams,
  col: Uint8Array,
  dep: Uint8Array,
  ids: Uint8Array,
  W: number,
  H: number,
  levels: { lo: number; hi: number },
): RawCells {
  const sw = p.sub;
  const sh = Math.round(p.sub / p.cellAspect);
  const n = p.cols * p.rows;
  const shape = new Float32Array(n * DIMS);
  const coverage = new Float32Array(n);
  const part = new Uint8Array(n);
  const votes = new Uint16Array(MAX_PARTS + 1);
  const depth = new Uint8Array(n).fill(EMPTY_DEPTH);
  const regCount = new Float32Array(DIMS);
  const range = Math.max(1e-3, levels.hi - levels.lo);
  for (let cy = 0; cy < p.rows; cy++) {
    for (let cx = 0; cx < p.cols; cx++) {
      const ci = cy * p.cols + cx;
      let cov = 0;
      let dmin = 255;
      regCount.fill(0);
      votes.fill(0);
      for (let sy = 0; sy < sh; sy++) {
        const py = cy * sh + sy;
        const row = H - 1 - py; // readPixels bottom-up
        const ry = Math.min(REG_Y - 1, Math.floor((sy * REG_Y) / sh));
        for (let sx = 0; sx < sw; sx++) {
          const px = cx * sw + sx;
          const rx = Math.min(REG_X - 1, Math.floor((sx * REG_X) / sw));
          const ri = ry * REG_X + rx;
          regCount[ri]++;
          const i = (row * W + px) * 4;
          if (col[i + 3] < 128) continue;
          cov++;
          votes[Math.min(MAX_PARTS, ids[i])]++;
          const lum = Math.min(1, Math.max(0, (luma(col[i], col[i + 1], col[i + 2]) - levels.lo) / range));
          shape[ci * DIMS + ri] += p.minLight + (1 - p.minLight) * Math.pow(lum, p.gamma);
          if (dep[i + 3] > 0) dmin = Math.min(dmin, dep[i]);
        }
      }
      for (let ri = 0; ri < DIMS; ri++) shape[ci * DIMS + ri] /= regCount[ri];
      coverage[ci] = cov / (sw * sh);
      if (cov > 0) {
        let best = 1;
        for (let k = 2; k <= MAX_PARTS; k++) if (votes[k] > votes[best]) best = k;
        part[ci] = best - 1;
        depth[ci] = Math.min(254, Math.round(dmin / p.depthStep) * p.depthStep);
      }
    }
  }
  return { shape, coverage, part, depth };
}

export type Progress = (msg: string) => void;

/** Satu BakeFile per arah (`views`, atau `[yaw]`). Semua arah berbagi framing, depth range, dan level. */
export async function bake(ctx: BakeContext, p: BakeParams, onProgress: Progress = () => {}): Promise<BakeFile[]> {
  const allLayerMeshes = new Set(Object.values(p.layers).flatMap(layerMeshes));
  for (const h of p.hidden) allLayerMeshes.delete(h);
  const yaws = p.views?.length ? p.views : [p.yaw];
  const framing = measureFraming(ctx, p, allLayerMeshes, yaws);
  const { near, far } = framing;
  p = { ...p, cols: framing.cols };
  setupView(ctx, p, framing, yaws[0]);
  const cam = ctx.camera;

  const glyphs = await buildGlyphSet(p.charset, 'JetBrains Mono', p.cellAspect);
  if (glyphs.chars.length > MAX_SHADES) throw new Error(`charset maksimal ${MAX_SHADES} glyph`);
  const match = makeMatcher(glyphs);

  // Part id global: urutan kemunculan di layer, plus part hasil split blade.
  const parts: string[] = [];
  const partOf = new Map<string, number>();
  const addPart = (name: string) => {
    if (!parts.includes(name)) parts.push(name);
    return parts.indexOf(name);
  };
  for (const l of Object.values(p.layers)) for (const [part, ms] of Object.entries(l.parts)) for (const m of ms) partOf.set(m, addPart(part));
  const splits = new Map<string, BladeSplit>();
  for (const l of Object.values(p.layers)) if (l.blade && ctx.meshes.has(l.blade.mesh)) splits.set(l.blade.mesh, l.blade);
  for (const s of splits.values()) addPart(s.below), addPart(s.above);
  if (parts.length > MAX_PARTS) throw new Error(`part maksimal ${MAX_PARTS}`);

  // Material pass id per mesh. Mesh di luar layer tetap dapat id (tidak terlihat juga).
  const idMats = new Map<THREE.Object3D, THREE.ShaderMaterial>();
  for (const [name, m] of ctx.meshes) {
    const id = partOf.get(name) ?? 0;
    const split = splits.get(name);
    idMats.set(m, split ? makeIdMaterial(parts.indexOf(split.below), parts.indexOf(split.above), AXES[split.axis], split.at) : makeIdMaterial(id));
  }

  // Socket blade di ruang lokal mesh: pangkal = titik potong, ujung = ujung sumbu sisi `above`.
  type BladeLocal = { base: THREE.Vector3; tip: THREE.Vector3; mesh: THREE.Object3D };
  const bladeLocalOf = (split: BladeSplit): BladeLocal => {
    const mesh = ctx.meshes.get(split.mesh)! as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3());
    const base = c.clone().setComponent('xyz'.indexOf(split.axis), split.at);
    const tip = c.clone().setComponent('xyz'.indexOf(split.axis), bb.max[split.axis]);
    return { base, tip, mesh };
  };
  const project = (v: THREE.Vector3): SocketPoint => {
    const view = v.clone().applyMatrix4(cam.matrixWorldInverse);
    const ndc = v.clone().project(cam);
    const d = Math.min(254, Math.max(0, Math.round(((-view.z - near) / (far - near)) * 255)));
    const r1 = (x: number) => Math.round(x * 10) / 10;
    return [r1(((ndc.x + 1) / 2) * p.cols), r1(((1 - ndc.y) / 2) * p.rows), d];
  };
  const bladeSocket = (bladeLocal: BladeLocal): BladeSocket => {
    const mw = bladeLocal.mesh.matrixWorld;
    return { base: project(bladeLocal.base.clone().applyMatrix4(mw)), tip: project(bladeLocal.tip.clone().applyMatrix4(mw)) };
  };

  const sw = p.sub;
  const sh = Math.round(p.sub / p.cellAspect);
  const W = p.cols * sw;
  const H = p.rows * sh;
  const colorRT = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const depthRT = new THREE.WebGLRenderTarget(W, H);
  const idRT = new THREE.WebGLRenderTarget(W, H);
  // Normalisasi depth ke rentang model (bukan near/far kamera) supaya 8-bit cukup presisi.
  const depthMat = makeDepthMaterial(near, far);

  const r = ctx.renderer;
  const prevClear = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  r.setClearColor(0x000000, 0);
  const colBuf = new Uint8Array(W * H * 4);
  const plainBuf = new Uint8Array(W * H * 4);
  // Varian material tanpa tekstur warna (albedo putih) untuk pass pencahayaan murni.
  const plainMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const toPlain = (m: THREE.Material) => {
    const c = m.clone() as THREE.MeshStandardMaterial;
    c.map = null;
    c.color?.set(0xffffff);
    return c;
  };
  if (p.albedo < 1)
    for (const m of ctx.meshes.values()) {
      const mesh = m as THREE.Mesh;
      plainMats.set(mesh, Array.isArray(mesh.material) ? mesh.material.map(toPlain) : toPlain(mesh.material));
    }
  const depBuf = new Uint8Array(W * H * 4);
  const idBuf = new Uint8Array(W * H * 4);

  const pass = (rt: THREE.WebGLRenderTarget, buf: Uint8Array) => {
    r.setRenderTarget(rt);
    r.clear();
    r.render(ctx.scene, cam);
    r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  };
  const render = () => {
    ctx.scene.overrideMaterial = null;
    pass(colorRT, colBuf);
    if (plainMats.size) {
      const orig = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      for (const [mesh, mat] of plainMats) {
        orig.set(mesh, mesh.material);
        mesh.material = mat;
      }
      pass(colorRT, plainBuf);
      for (const [mesh, mat] of orig) mesh.material = mat;
      for (let i = 0; i < colBuf.length; i++) if ((i & 3) !== 3) colBuf[i] = plainBuf[i] + (colBuf[i] - plainBuf[i]) * p.albedo;
    }
    ctx.scene.overrideMaterial = depthMat;
    pass(depthRT, depBuf);
    ctx.scene.overrideMaterial = null;
    const orig = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    for (const [m, mat] of idMats) {
      const mesh = m as THREE.Mesh;
      orig.set(mesh, mesh.material);
      mesh.material = mat;
    }
    pass(idRT, idBuf);
    for (const [mesh, mat] of orig) mesh.material = mat;
    r.setRenderTarget(null);
  };

  // Auto-levels dari pose pertama dengan susunan default (layer tanpa slot + varian pertama tiap slot), supaya
  // kontras konsisten antar frame dan tidak bergeser setiap ada item baru (mis. sayap putih atau zirah hitam).
  const seenSlot = new Set<string>();
  const defaultMeshes = new Set(
    Object.values(p.layers)
      .filter((l) => !l.slot || (!seenSlot.has(l.slot) && seenSlot.add(l.slot)))
      .flatMap(layerMeshes)
      .filter((m) => allLayerMeshes.has(m)),
  );
  setVisible(ctx, defaultMeshes);
  poseAt(ctx, Object.values(p.clips)[0], 0);
  render();
  const lums: number[] = [];
  for (let i = 0; i < W * H; i++) if (colBuf[i * 4 + 3] >= 128) lums.push(luma(colBuf[i * 4], colBuf[i * 4 + 1], colBuf[i * 4 + 2]));
  lums.sort((a, b) => a - b);
  const levels = { lo: lums[Math.floor(lums.length * 0.02)] ?? 0, hi: lums[Math.floor(lums.length * 0.98)] ?? 1 };

  const files: BakeFile[] = [];
  for (const yaw of yaws) {
    setupView(ctx, p, framing, yaw);
    const [ox, oy] = project(new THREE.Vector3(0, 0, 0));
    const out: BakeFile = {
      version: 2,
      yaw,
      origin: [ox, oy],
      model: p.modelName,
      cols: p.cols,
      rows: p.rows,
      cellAspect: p.cellAspect,
      fps: p.stillFrames ? Math.round((p.stillFrames / poseAt(ctx, Object.values(p.clips)[0], 0).duration) * 100) / 100 : p.fps,
      facing: p.facing,
      ramp: glyphs.chars.join(''),
      parts,
      layers: {},
      bakedAt: new Date().toISOString(),
      params: { ...p, modelUrl: undefined, layers: undefined },
    };

    for (const [layerKey, layer] of Object.entries(p.layers)) {
      const meshes = new Set(layerMeshes(layer));
      out.layers[layerKey] = { label: layer.label, clips: {} };
      if (layer.slot) out.layers[layerKey].slot = layer.slot;
      if (layer.bias) out.layers[layerKey].bias = Math.round((layer.bias / (far - near)) * 255);
      setVisible(ctx, meshes);
      const blade = layer.blade && splits.has(layer.blade.mesh) ? bladeLocalOf(layer.blade) : null;
      for (const [clipKey, clipName] of Object.entries(p.clips)) {
        const clip = poseAt(ctx, clipName, 0);
        const n = frameCount(clip, p);
        const frames: FrameData[] = (out.layers[layerKey].clips[clipKey] = []);
        for (let f = 0; f < n; f++) {
          poseAt(ctx, clipName, frameTime(clip, p, f));
          render();
          const cells = sampleCells(p, colBuf, depBuf, idBuf, W, H, levels);
          const shade = new Uint8Array(p.cols * p.rows);
          const v = new Float32Array(DIMS);
          for (let ci = 0; ci < shade.length; ci++) {
            if (cells.coverage[ci] < p.minCoverage) {
              cells.depth[ci] = EMPTY_DEPTH;
              continue;
            }
            let m = 0;
            for (let d = 0; d < DIMS; d++) m = Math.max(m, cells.shape[ci * DIMS + d]);
            for (let d = 0; d < DIMS; d++) v[d] = m > 0 ? Math.pow(cells.shape[ci * DIMS + d] / m, p.sharpness) * m : 0;
            shade[ci] = match(v);
          }
          const frame = cropFrame(p, shade, cells);
          if (blade) frame.blade = bladeSocket(blade);
          frames.push(frame);
          if (f === 0) onProgress(`${yaw}° ${layer.label} / ${clipKey}: ${n} frame`);
          await new Promise((res) => setTimeout(res, 0));
        }
      }
    }
    files.push(out);
  }
  setupView(ctx, p, framing, yaws.includes(p.yaw) ? p.yaw : yaws[0]); // preview 3D di bake tool
  r.setClearColor(prevClear, prevAlpha);
  colorRT.dispose();
  depthRT.dispose();
  idRT.dispose();
  depthMat.dispose();
  for (const m of idMats.values()) m.dispose();
  for (const m of plainMats.values()) [m].flat().forEach((x) => x.dispose());
  return files;
}

function cropFrame(p: BakeParams, shade: Uint8Array, cells: RawCells): FrameData {
  let x0 = p.cols, y0 = p.rows, x1 = -1, y1 = -1;
  for (let y = 0; y < p.rows; y++)
    for (let x = 0; x < p.cols; x++)
      if (cells.depth[y * p.cols + x] !== EMPTY_DEPTH) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0, cell: '', depth: '' };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const depth = new Uint8Array(w * h);
  const cell = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ci = (y0 + y) * p.cols + (x0 + x);
      depth[y * w + x] = cells.depth[ci];
      cell[y * w + x] = cells.depth[ci] === EMPTY_DEPTH ? 0 : packCell(cells.part[ci], shade[ci]);
    }
  return { x: x0, y: y0, w, h, cell: b64encode(cell), depth: b64encode(depth) };
}
