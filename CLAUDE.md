# CLAUDE.md

Handoff untuk Claude Code. Rencana lengkap: `docs/PLAN.md`. Cara pakai tool: `README.md`.

## Project
Portfolio pribadi baru milik Atsal (GitHub `kirlyr`, full-stack developer) bertema dunia MMORPG retro medieval
berbasis ASCII, patokan kualitas aino.agency. Repo ini `ascii-bake-lab` = eksperimen pipeline karakter **baked
ASCII**; hasilnya nanti dipindah ke repo portfolio baru (belum dibuat).

## Keputusan yang sudah final (jangan dibuka ulang tanpa alasan kuat)
- Stack: Vite + vanilla TS, ASCII langsung ke DOM/canvas, tanpa framework UI. Desktop dulu.
- Struktur: intro ASCII → Character (Home), Quest Log (Work), Lore (About), Tavern (Play), Send a raven (Contact),
  plus Recruiter mode. Tavern dikerjakan setelah Home dan Quest Log. Forge (4 material, 5 rune partikel) ada
  di Tavern; inventory (paper doll + bag + drag & drop) ya, stats tidak (diubah user 2026-11-27). Main quest: Pokecrut (tanpa aset Pokémon).
- Palet: latar `#120e0a`, panel `#1b1510`, border `#4a3b2a`, teks `#ead9b5`, muted `#b0a083`, aksen `#d4a64a`,
  merah `#d8644c`, hijau `#8fae6a`. Animasi mati saat `prefers-reduced-motion`.
- Karakter: bake per layer (badan/helm/armor/senjata/pet), tiap sel = shade level + part id + depth (bukan char
  final, supaya material bisa di-swap di runtime; sudah diimplementasi, format v2, disimpan sebagai `.bake`), compose runtime pilih
  depth terdekat. Satu sudut kamera samping, arah sebaliknya = mirror. v1: 2–3 varian per slot.
- Proporsi karakter **realistis, bukan chibi** (seperti referensi IG ansenjeo), tinggi ±90 baris, font kecil supaya rapat.
- Three.js hanya di bake tool (dev). Build produksi tidak boleh membawa Three.js.
- Kontak: form service (Formspree/Web3Forms). Hosting: VPS user + Caddy, deploy `dist` via GitHub Actions rsync.
  Domain belum ada.

## Status (2026-11-26)
- Prototype bake tool + player selesai di repo ini (idle + walk, 4 layer, mirror). Lihat README untuk hasil.
- **Karakter final (dipilih user 2026-11-26):** badan Quaternius Universal Base Characters `Superhero_Male`
  (proporsi realistis, 90 baris) + armor outfit Ranger + helm/pedang Quaternius Knight Pack, animasi Universal
  Animation Library. Semua CC0, dari mirror GitHub. KayKit Knight (chibi) dan Soldier (Mixamo) sudah **dihapus,
  jangan dipakai lagi**. Mixamo tidak bisa diakses dari laptop user.
- Format bake v2 (shade level + part id + depth, socket blade, material swap, rune api demo) selesai, lihat README.
- PR #5: pedang digenggam (lengan kanan dikunci ke pose `Sword_Idle`), kulit tidak tembus rompi (outfit inflate +
  bias compose armor), tuning warna, hero.json 170 KB gzip (dari 250 KB).
- PR #6 equipment: varian per slot (3 helm, 4 senjata termasuk Gada, armor bisa dilepas), tiap varian = layer bake
  dengan `slot`, UI pilih/lepas di player. Forge (material + rune) jalan di semua senjata.
- Putar karakter (dipilih user 2026-11-26): 16 arah; 2026-11-27 user minta napas → **4 frame idle per arah**
  (`hero-turn.bake`), arah samping tetap beranimasi penuh dari `hero.json`. Untuk Tavern; Home tetap sudut samping.
- Wardrobe (2026-11-27, user minta): outfit dipecah ke slot baju/celana/sepatu/bahu (Ranger + Peasant + ShoulderPads),
  helm 5 (termasuk 2 mahkota), senjata 8 (tambah kapak, tombak, palu, sabit dari Modular Weapons Pack CC0), aura per
  slot (partikel di tepi silhouette, runtime). Robe/plate armor
  butuh pack Quaternius berbayar (diunduh user dari laptop). Tombak/kapak dua tangan belum punya pose sendiri.
- Pewarna per part (kain, kulit, linen, wol, pelat, helm, hiasan) + format biner `.bake` (gzip, plane cell/depth):
  hero.bake 195 KB, hero-turn.bake 195 KB (dari 280/270 KB JSON gzip). JSON tidak lagi di-commit. (2026-11-27)
- Loadout (2026-11-27, user minta): kustomisasi di Tavern disimpan di localStorage pengunjung dan otomatis dipakai
  Home (`src/shared/loadout.ts`, prototype `/home.html`).
- Tavern inventory (2026-11-27, user minta, referensi screenshot inventory ansenjeo): paper doll + bag ikon +
  drag & drop + panel detail (deskripsi English, tanpa stats). Rune 5. UI Tavern berbahasa Inggris.
- Putar tanpa mirror (2026-11-27, keluhan user: pauldron pindah pundak saat diputar): `hero-turn.bake` = 16 arah
  penuh, 342 KB. Mirror hanya untuk berjalan ke arah sebaliknya.
- Home bisa diputar (2026-11-27, user minta): `hero-turn.bake` dimuat setelah karakter tampil. Logika putar bersama di
  `src/shared/turn.ts`. Efek rune/aura: halo bloom + glyph besar, level Faint/Bright/Radiant per efek (user minta).
- Equipment tambahan (2026-11-27, user minta): helm diperbesar (tidak menembus kepala), 5 zirah dada CC0 di slot Chest,
  jubah prosedural (buatan sendiri, simulasi kain Verlet saat bake di `src/bake/cloth.ts`, user minta) di slot baru Back (`back`), satu slot dengan sayap malaikat jatuh terlipat (`restClip: idle`, user minta diperbaiki; tema dark medieval → default jubah, sayap hitam). Pass depth/ID bake dua sisi (jubah sempat tembus dari belakang).
  Legs/feet: versi gratis Quaternius habis, jadi pelat kaki + sepatu besi dibuat prosedural (`make_greaves.py`, attachment `rest: true`), dipilih user.
- Rambut (2026-11-27, user pilih): rambut UBC gratis (Simple Parted bawaan, Buzzed, Long) + janggut, slot Hair/Beard, pewarna rambut (bawaan hitam). Helm besi `hides: [hair]`; mahkota tidak.
- Equipment batch 1 (2026-11-27, user minta): mahkota diperkecil/dipendekkan, slot baru Off-hand (`offhand`, 5 perisai
  Quaternius CC0 di lengan kiri, kosong di susunan bawaan lewat `unequipped`), 6 senjata Quaternius CC0 tambahan.
  Batch 2–4 (buatan sendiri, user pilih bukan pack berbayar): sayap malaikat terbuka (part `plume`, putih) + sayap
  rusak (`make_wings.py`), halo (part `trim`) + janggut panjang (kain disimulasikan, `make_accessories.py`), zirah
  ramping (`make_cuirass.py`), robe + robe compang-camping (rok kain tabung `wrap`, dorongan radial `axis: pelvis`,
  `make_robe.py`), pelat kaki/sepatu ramping (`make_greaves.py`). Format sel penuh: 16 part (jangan tambah part).
  Panggung Tavern memotong sisi kanvas, bukan mengecilkan karakter (grid putar 162 kolom). Batch 5: flail buatan sendiri (`make_flail.py`), rantai = tali Verlet saat bake (`src/bake/flail.ts`); berayun saat idle/jalan, tapi tidak bisa terseret saat diputar (putar = arah ter-bake).
- Perbaikan 2026-11-28 (user minta): halo diperkecil, Kapak Ganda digenggam (`grip: [z, x]`), efek flail hanya dari
  rantai + bola (field layer `fx`), ikon perisai diambil dari arah sebaliknya (sisi luar), sepatu dibuat ulang mengikuti
  profil kaki (Iron Sabatons gothic vs Duelist Boots kulit sampai lutut). `loadLoadout(file, fallback)` sama dengan portfolio.
- Tambahan 2026-11-28 (user setuju rekomendasi): tudung gelap + jubah bahu kain (`make_hood.py`), mantel bulu
  (`make_mantle.py`), chainmail (salinan tunik Peasant lewat `copies`, pola cincin di shader bake), busur Quaternius +
  tabung panah (`make_quiver.py`). Opsi lain yang ditawarkan tapi belum dibuat: helm bertanduk, mahkota duri, topeng
  tengkorak/plague doctor, pauldron berduri/tulang, gambeson, zirah tulang, pedang besar di punggung, sayap kelelawar, panji.
- Perbaikan 2026-11-28 sore (user minta): partikel rune/aura punya depth saat lahir dan tidak digambar di belakang sel
  yang lebih dekat (efek senjata tidak tembus badan saat diputar ke belakang), Rambut Buzzed `bias: 0.01` (depth 1 cm per
  unit, rambut tipis kalah seri dari kulit kepala), tulang Broken Wings pakai part `plume` (putih tulang, bukan kayu).
- Perbaikan 2026-11-28 malam (user minta): rompi Ranger dipas ke badan Superhero saat load (`BakeParams.fit`: verteks
  yang tenggelam di kulit didorong keluar sepanjang normal via raycast pose rest, dirambatkan ke tetangga). Jubah menang
  atas slot torso lewat field layer baru `over` (bias per slot, compose dua arah); physics jubah tidak diubah (user
  minta, sudah bagus). Masih ada: rompi tembus sayap Fallen Wings dari belakang (sudah ada sebelumnya).
- Belum ada repo portfolio. Konten pribadi masih placeholder.

## Langkah berikutnya (tunggu user bilang siap)
1. ~~Varian helm/senjata (2–3 per slot).~~ Selesai (PR equipment).
2. ~~Optimasi format output (biner).~~ Selesai; delta antar frame diuji, lebih besar, tidak dipakai.
3. Buat repo portfolio, pindahkan bake tool, mulai dari intro + Character (Home).

## Aturan kerja user
- Komunikasi dalam **Bahasa Indonesia**, istilah teknis tetap Inggris.
- **Jangan** memberi prompt/spec atau langsung coding selama diskusi masih berjalan. Tunggu user bilang siap.
- Prioritaskan kesederhanaan, hindari overengineering dan abstraksi yang tidak perlu.
- Tantang asumsi lemah, jelaskan trade-off, beri satu rekomendasi dengan alasan singkat.
- Jangan mengarang requirement bisnis; tandai asumsi sebagai asumsi.
- Repo private, tetap jangan simpan data pribadi (nomor telepon, alamat, dsb.) di repo.

## Perintah
- `npm run dev` → player/Tavern di `/`, Home di `/home.html`, bake tool di `/bake.html`
- `npm run build` → type check + build player + home saja
