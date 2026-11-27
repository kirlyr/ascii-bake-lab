# ascii-bake-lab

Eksperimen pipeline **baked ASCII** untuk portfolio MMORPG medieval: model 3D (glTF) di-render sekali menjadi frame ASCII
(**shade level + part id + depth** per sel), lalu diputar di browser tanpa Three.js. Glyph dan warna final ditentukan
**material** di runtime, jadi material bisa diganti tanpa re-bake.

![hero idle dan walk](docs/media/hero.png)

## Menjalankan

```bash
npm install
npm run dev
```

- `http://localhost:5173/bake.html` → **bake tool** (dev only, pakai Three.js). Atur parameter, klik **Bake**, lalu
  **Simpan ke public/baked/hero.bake** (endpoint dev di `vite.config.ts`, gzip level 9) atau **Download JSON** (debug).
- `http://localhost:5173/` → **player** (produksi, tanpa Three.js). Idle/walk, arah kiri/kanan (mirror), equipment per slot, aura per slot, putar 16 arah,
  material blade (Iron/Steel/Gold/Bloodiron), rune api, mode warna Material/Part/Depth, penanda socket blade.
  Tahan ← / → untuk berjalan.
- `npm run build` hanya mem-build player + `home.html`. Three.js tidak ikut.

## Cara kerja bake

1. Load badan (`.gltf`/`.glb`/`.fbx`), animasi dari file terpisah (`animations: { idle: 'file.glb#Clip' }`), outfit skinned
   yang di-bind ulang ke skeleton badan (`outfits`), dan aksesori yang ditempel ke tulang (`attachments`, mesh-nya
   bernama `<name>:<material>`). Kamera **orthographic samping** (`yaw -90`, hadap kanan, `pitch 8`).
2. Framing diukur dari silhouette semua pose (bukan bounding box geometri, karena bbox skinned mesh terlalu longgar).
   Tinggi model = `rows`. `cols = 0` berarti lebar grid otomatis.
3. Per layer (badan, armor, helm, senjata) dan per frame: render 3 pass ke render target `cols*6 × rows*12` px
   (warna lit, depth, part id), lalu tiap sel diringkas jadi. Warna lit dicampur dengan pass tanpa tekstur
   (`albedo` 0,5): shade level lebih banyak mengikuti pencahayaan daripada warna tekstur, jadi kain gelap tidak jadi
   glyph jarang. Warna final datang dari material.
   - **shade level**: shape vector 2×3 region dari kecerahan sub-pixel, dicocokkan ke glyph JetBrains Mono Bold terdekat
     di ramp `.:-=+*#%@`. Index glyph itu = shade level (0..8). Jadi tepi silhouette dari shape vector tetap terbawa,
     walau char final baru dipilih di runtime.
   - **part id**: part mayoritas di sel. Part diatur per mesh di preset (`layers.<x>.parts`). Mesh senjata bisa dibagi dua
     di sepanjang sumbu lokalnya (`blade: { mesh, axis, at, below, above }`). Pedang Quaternius sudah terpisah per
     material, jadi `sword:Metal` = blade dan sisanya hilt.
   - **depth**: 0..254 (255 = kosong), dinormalisasi ke rentang depth model, dikuantisasi per `depthStep` (4 ≈ 1,8 cm)
     supaya gzip lebih kecil.
4. Layer senjata juga menyimpan **socket blade** per frame: `base` (titik potong hilt/blade) dan `tip`, dalam koordinat
   grid `[x, y, depth]`. Dipakai emitter partikel rune.
5. Frame di-crop ke bounding box sel terisi. Satu byte per sel `part * 16 + shade` + satu byte depth.
6. Disimpan sebagai container biner `.bake` (`packBake` di `format.ts`): gzip( magic `ASB3` | panjang header |
   header JSON | plane cell | plane depth ). Header = BakeFile/TurnFile tanpa data frame; tiap frame punya offset `o`.
   Semua cell dulu lalu semua depth, karena gzip lebih efektif begitu. Player memuat lewat `DecompressionStream`,
   jadi tidak bergantung pada Content-Encoding server. Delta antar frame sudah diuji dan justru lebih besar
   (karakter bergerak, XOR jadi noise), jadi tidak dipakai.

Format lengkap: `src/shared/format.ts` (BakeFile v2). File v1 (char final) tidak didukung lagi.

## Equipment (varian per slot)

Tiap varian equipment = **satu layer bake** dengan field `slot` (`torso`, `legs`, `feet`, `shoulder`, `helmet`,
`weapon`). Ukuran file = jumlah layer, bukan kombinasi: 21 varian = 21 layer, bukan ribuan kombinasi. Semua varian di-bake
dalam satu run, jadi framing kamera dan rentang depth sama untuk semua varian.

- Player memasang maksimal satu layer per slot (`activeLayers` / `defaultEquipment` di `compose.ts`), atau slot
  dikosongkan ("Lepas"). Ganti equipment = ganti daftar layer yang di-compose, tanpa decode ulang.
- Tiap layer senjata punya `blade` sendiri (split hilt/blade + sumber socket), jadi material blade dan rune api jalan
  di semua senjata.
- Aksesori Knight Pack punya origin + skala sama, jadi satu posisi attach per slot (`helm()` / `weapon()` di preset).
  Katana diputar 90° di sumbu panjangnya (`spin`) karena sisi lebarnya ada di sumbu lokal lain.

| Slot | Varian | Part |
|---|---|---|
| Baju | Rompi Ranger, Tunik Petani | cloth, leather, linen |
| Celana | Celana Ranger, Celana Petani | cloth, wool |
| Sepatu | Sepatu Ranger, Sepatu Petani | leather, wool |
| Bahu | Pauldron Ranger, Bahu Ksatria (`ShoulderPads`) | armor |
| Helm | Helm Besi, Helm Ksatria, Helm Bangsawan (`Helmet1–3`), Mahkota, Mahkota Rubi (`Crown`, `Crown2`) | helmet, trim, gem |
| Senjata | Pedang, Pedang Pendek, Katana, Gada (Knight Pack); Kapak, Tombak, Palu Perang, Sabit Maut (Modular Weapons Pack) | blade, hilt, wood |

Outfit Ranger dan Peasant memang terdiri dari mesh terpisah per bagian, jadi bisa dipecah ke slot dan di-mix tanpa aset
baru. Semua layer outfit memakai `bias` 4 cm (badan Superhero lebih besar dari tubuh outfit).

![wardrobe](docs/media/wardrobe.png)

Kiri ke kanan: set Ranger + Helm Bangsawan + Pedang (aura Suci di helm); set Petani + Mahkota Rubi + Sabit (Bloodiron,
aura Bayangan di senjata); campuran + Bahu Ksatria + Kapak (aura Es di baju); Mahkota + Tombak (Gold, aura Bara);
Helm Ksatria + Palu Perang (aura Racun di bahu).

Forge berlaku di semua senjata. Senjata tanpa bilah memakai aturan: **bagian logam = part `blade`** (ikut material
forge + sumber socket rune), kayu tetap `wood`. Gada: paku + cincin kepala; Palu: kepala palu (cincin gagang = hilt);
Kapak/Tombak/Sabit: mata senjata. Tombak dipegang tegak supaya grid tidak melebar 2 m ke depan; Kapak dan Sabit
diputar (`spin`) supaya sisi lebar mata senjata menghadap kamera. Pose genggam tetap satu tangan (pose `Sword_Idle`).

## Pewarna

Kain, kulit samak, linen, wol, pelat bahu, helm, dan hiasan bisa diwarnai dari player (`DYEABLE` di `materials.ts`).
Pewarna hanya mengganti stop warna material (glyph tetap dari ramp bake), jadi tanpa bake ulang. Kain/kulit memakai
9 warna `DYES` (Lumut, Darah, Nila, Ungu bangsawan, Oker, Samak, Coklat wol, Perkamen, Arang), logam memakai 5
`FINISHES` (Besi, Baja, Perunggu, Emas, Hitam). Berlaku per part, jadi semua item dengan part yang sama ikut berubah
(mis. kain rompi dan celana Ranger).

![pewarna](docs/media/dyes.png)

## Aura

Aura = partikel glyph seperti rune, tapi lahir di **tepi silhouette item** (sel milik layer itu yang bertetangga dengan
sel kosong atau layer lain), bukan di socket blade. Compose kini mencatat layer pemilik tiap sel (`Grid.owner`), dan
`edgeCells()` mengambil tepinya tiap frame. Tanpa bake ulang dan tanpa menambah ukuran file. Per slot bisa dipilih
satu aura: Bara, Suci, Es, Bayangan, Racun (`AURAS` di `runes.ts`). Mati total saat `prefers-reduced-motion`.

## Tavern inventory

Player (`/`) = Tavern wardrobe bergaya inventory game (UI berbahasa Inggris, tanpa stats):
- **Paper doll**: karakter di tengah (tetap bisa diputar), slot Head/Shoulders/Chest kiri, Weapon/Legs/Feet kanan.
  Klik slot = bag difilter ke slot itu.
- **Bag**: semua varian equipment sebagai ikon. Klik = detail, double-click/Enter = pakai/lepas, drag ke slot yang
  cocok atau ke karakter = pakai, drag slot ke bag = lepas (HTML5 drag & drop, desktop dulu).
- **Detail item**: nama, jenis, deskripsi lore (`src/shared/items.ts`), lalu opsi yang relevan dengan part item itu:
  material blade, rune (5: Fire, Lightning, Blood, Venom, Frost), pewarna, aura.
- **Ikon** dibuat runtime dari layer bake itu sendiri (frame idle pertama, di-crop, `src/shared/icons.ts`), jadi tanpa
  file tambahan dan ikut pewarna/material. Senjata diputar supaya blade menunjuk ke kanan atas.
- Kontrol debug (clip, arah, mode warna, socket) ada di panel **Dev**.

![tavern inventory](docs/media/tavern-inventory.png)

## Efek rune & aura

`RuneEmitter` (`src/shared/runes.ts`) menggambar 4 lapis: sel di bawah glyph dikosongkan, halo (sprite gradien radial,
blend `lighter`, efek bloom), glyph kecil yang di-snap ke sel, dan sesekali glyph besar 2× yang melayang bebas.
Intensitas per efek bisa dipilih di panel detail: **Faint / Bright / Radiant** (`LEVELS`), mengalikan jumlah partikel,
sebaran, umur, peluang glyph besar, dan ukuran halo. Disimpan di loadout (`levels`, key = slot aura atau `rune`).

![level efek](docs/media/effect-levels.png)

## Loadout (Tavern → Home)

Semua pilihan di player (equipment, pewarna, material blade, aura, rune) disimpan sebagai loadout di `localStorage`
pengunjung (`src/shared/loadout.ts`, key `ascii-hero-loadout`) dan langsung dipulihkan saat halaman dibuka lagi.
`/home.html` (prototype Home) memuat `hero.bake` dulu (karakter langsung tampil), lalu `hero-turn.bake` di belakang
layar; setelah itu karakter bisa diputar (drag atau ⟲ ⟳). Memakai loadout yang sama. Jadi player = Tavern = tempat kustomisasi karakter Home. Nilai yang tidak dikenal lagi (layer dihapus, palet
diganti) jatuh ke default bake. Tiap pengunjung punya loadout sendiri; tanpa loadout tersimpan = susunan default.

![home dengan loadout](docs/media/home-loadout.png)

## Memutar karakter (16 arah, idle napas)

Preset `hero-turn` (`/bake.html?model=hero-turn`) mem-bake **4 frame idle** (merata sepanjang clip, `stillFrames: 4`) dari **16 arah penuh** (`views`: 0°, −22,5° … −337,5°),
semua layer equipment, ke `public/baked/hero-turn.bake` (`TurnFile`). Tanpa mirror: karakter tidak simetris
(pauldron satu sisi, senjata di tangan kanan), jadi mirror membuat item pindah sisi saat diputar. Semua arah berbagi
framing, rentang depth, dan auto-level; grid dipusatkan ke origin model supaya karakter tidak bergeser saat diputar.

Player: drag karakter atau tombol ⟲ ⟳ (per 22,5°). Arah bake (−90°) memakai `hero.bake` yang beranimasi
(idle/walk); berjalan ke arah sebaliknya = `hero.bake` di-mirror (seperti game 2D). Arah lain, termasuk +90° saat idle, memutar 4 frame idle itu (±1,6 fps, satu siklus napas 2,5 detik). Kedua file disejajarkan lewat `origin` (titik antara kaki, di grid) yang kini
disimpan tiap BakeFile. Di portfolio, `hero-turn.bake` cukup dimuat di Tavern.

![16 arah, ditampilkan 8](docs/media/turn.png)

## Runtime

- `src/shared/compose.ts`: tiap sel pilih layer dengan depth terkecil, dikurangi `bias` layer (armor menang atas kulit
  yang hanya ≤ 4 cm di depannya). Mirror = balik kolom; socket ikut di-mirror.
- `src/shared/materials.ts`: material = glyph per shade level + stop warna gelap→terang. Look default per part
  (kulit, pelat, kain, kulit samak, kayu) plus 4 material blade dari reel ansenjeo (`#%` Iron, `@%` Steel, `0o` Gold,
  `B8` Bloodiron). Level rendah tetap `.:-=` supaya tepi tidak hilang.
- `src/shared/ascii-canvas.ts`: material dikompilasi jadi tabel 256 entri (byte sel → glyph + warna), jadi ganti material
  = bangun ulang tabel, tanpa decode ulang frame. Glyph asimetris ditukar saat mirror (`/`↔`\`, dst).
- `src/shared/runes.ts`: rune api = emitter partikel glyph (`^^*:.`) di sepanjang socket blade, warna sesuai umur + glow.
  Partikel diupdate tiap rAF (sprite tetap 12 fps) dan **mati total saat `prefers-reduced-motion`**.

## Karakter

Satu karakter proporsi realistis (bukan chibi), tinggi 90 baris. Semua aset **CC0** dari Quaternius:

| Layer | Aset | Folder |
|---|---|---|
| Badan | Universal Base Characters, `Superhero_Male` | `assets/models/quaternius-ubc/` |
| Animasi | Universal Animation Library, `Idle_Loop` + `Walk_Loop` + `Sword_Idle` (dipangkas, 540 KB) | `assets/models/quaternius-ubc/` |
| Baju, celana, sepatu, bahu | Modular Character Outfits – Fantasy, outfit `Male_Ranger` + `Male_Peasant` | `assets/models/quaternius-outfits/` |
| Helm, pedang, bahu | Animated Knight Pack (`Helmet1–3`, `Sword`, `ShortSword`, `Katana`, `Club`, `ShoulderPads`) | `assets/models/quaternius/` |
| Kapak, tombak, palu, sabit, mahkota | Modular Weapons Pack + Ultimate RPG Pack | `assets/models/quaternius-weapons/` |
| Zirah dada (5) | Ultimate RPG Pack (`Armor_*`, item statis di `spine_03`) | `assets/models/quaternius-weapons/` |
| Jubah | buatan sendiri, prosedural (`make_cloak.py`) | `assets/models/cloak/` |
| Sayap bulu | buatan sendiri, prosedural (`make_wings.py`) | `assets/models/wings/` |

Sumber unduhan dan catatan lisensi ada di `SOURCE.md` tiap folder (diambil dari mirror GitHub karena situs Quaternius
tidak bisa diakses dari cloud). Versi gratis Modular Outfits hanya berisi Ranger dan Peasant; outfit armor penuh ada di
versi berbayar.

Perbaikan karakter (PR #5):
- **Genggaman pedang**: animasi idle/walk gratis tidak menggenggam senjata. Lengan kanan + jari dikunci ke pose frame 0
  `Sword_Idle` (`overlays` di preset), jadi tangan mengepal di hilt dan pedang tidak ikut ayunan lengan saat walk.
  Blade turun ke depan (rotasi attach `[25, 0, 90]`), sisi lebar menghadap kamera.
- **Kulit tembus rompi**: badan Superhero lebih besar dari tubuh untuk outfit Ranger. Outfit digelembungkan 2 cm di
  sepanjang normal saat bake (`outfitInflate`), plus `bias` 4 cm di layer armor saat compose. Kulit yang masih
  terlihat = lengan (outfit tanpa lengan), leher, wajah.
- **Warna**: palet material per part di-tuning ke palet medieval (kain lumut, kulit samak, parchment, kulit hangat),
  stop paling gelap dinaikkan supaya glyph tepi tetap terbaca.

![sebelum dan sesudah](docs/media/hero-before-after.png)

## Hasil saat ini (hero, 30 layer × 2 clip @12fps)

| | |
|---|---|
| Grid | 95 × 90 (`hero-turn`: 148 × 90, simetris di origin) |
| `hero.bake` | 30 layer × 2 clip = **298 KB** (22 layer: 195 KB; JSON base64 + gzip dulu: 280 KB) |
| `hero-turn.bake` | 16 arah × 30 layer × 4 frame = **528 KB** (22 layer: 342 KB) |
| Player JS | 13,7 KB (6,1 KB gzip), tanpa Three.js |

Untuk portfolio: Home cukup memuat set default (bisa jadi preset bake terpisah, ±100 KB gzip); file lengkap dan
`hero-turn.bake` hanya di Tavern. Kalau masih terasa berat: file per layer yang dimuat saat dipilih.

Ruang optimasi lain yang belum dikerjakan: fps 8–10, file per layer (lazy).

## Struktur

```
bake.html, src/bake/        bake tool (Three.js, dev only)
index.html, src/player/     player (produksi)
home.html, src/home/        prototype Home: karakter dengan loadout dari Tavern
src/shared/                 format .bake, compose, loadout, renderer canvas (tanpa Three.js)
public/baked/*.bake         hasil bake (container biner gzip)
assets/models/quaternius*/  model CC0 + SOURCE.md
docs/PLAN.md                rencana portfolio lengkap
```
