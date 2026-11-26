# Rencana Portfolio: MMORPG Medieval ASCII

Ringkasan keputusan per 2026-11-26. Sumber: diskusi di project Claude (cloud). Ini konteks, belum spec implementasi.

## Tujuan
Portfolio pribadi baru dengan ASCII art sebagai visual utama, bertema dunia MMORPG retro medieval. Patokan kualitas
aino.agency. Gaya terminal/command line **tidak** dipakai. Repo portfolio baru belum dibuat (misalnya
`kirlyr.github.io` atau nama lain). Repo lama `kirlyr/atsal-portfolio` tidak dipakai ulang, hanya kontennya diambil
seperlunya. Repo ini (`ascii-bake-lab`) adalah eksperimen; bake tool nanti dipindah ke repo portfolio.

Mockup visual (claude.ai artifact): https://claude.ai/artifact/QuDeZgYmb947G6HgdSLR7x

## Struktur dan alur
- **Intro:** logo ATSAL dari karakter ASCII kecil dan rapat. Saat PRESS START diklik, hurufnya runtuh, memantul,
  terus bergerak, dan bisa didorong kursor. ±1,6 detik kemudian fade lalu langsung masuk world, tanpa tombol tambahan.
  Wipe dither ░▒▓█ sudah dicoba dan ditolak; mungkin enhancement nanti.
- **Character (Home):** character sheet Atsal: nama, class Full-stack Developer, level, atribut (STR/DEX/INT
  dipetakan ke area skill), tech stack sebagai slot equipment. Portrait = karakter ASCII pose idle.
- **Quest Log (Work):** list + detail. Tiap quest: Objective, Challenges, Reward, Loot (link repo/demo).
  Main quest: **Pokecrut**. Project lama jadi side quest atau dihapus.
- **Lore (About):** backstory 4 chapter timeline.
- **Tavern (Play):** customizer karakter untuk pengunjung. Pilih class (Warrior, Ranger, Rogue, Mage) yang mengisi
  loadout default, lalu ganti helm, armor, senjata, pet. Melee/Ranged ditentukan senjata. Karakter bisa berjalan.
  Ada slot eksperimen lain berstatus locked. Dikerjakan **setelah** Home dan Quest Log.
  **Forge** (ala reel ansenjeo "Weapon Materials and Runes") ada di Tavern: 3–4 material blade (pasangan glyph +
  warna, mis. `#%` Iron, `@%` Steel, `0o` Gold, `B8` Bloodiron) dan 2–3 rune (api, petir, darah) sebagai partikel
  glyph di canvas + glow. Partikel mati saat `prefers-reduced-motion`. Tanpa inventory grid lengkap dan stats.
- **Send a raven (Contact):** form kontak + Join party (GitHub, LinkedIn, email, CV).
- **Recruiter mode:** tombol "Skip cutscene" ke satu halaman ringkas (CV, skill, tabel project, kontak). Tetap gelap
  dan monospace, tanpa ornamen game dan tanpa animasi.
- Label navigasi selalu menyertakan nama umum, misalnya "Quest Log (Work)".

## Gaya visual
- Font monospace: JetBrains Mono di mockup dan prototype, final belum dipilih.
- Panel berbingkai dengan tab dan header `┤ JUDUL ├` (inspirasi UI crafting MMORPG dari IG ansenjeo).
- Palet: latar `#120e0a`, panel `#1b1510`, border `#4a3b2a`, teks parchment `#ead9b5`, muted `#b0a083`,
  emas tua `#d4a64a` (aksen), merah darah `#d8644c`, hijau lumut `#8fae6a`. Kontras teks minimal 4.5:1.
- Transisi antar tab: fade + slide ±250ms. Semua animasi mati saat `prefers-reduced-motion`.

## Keputusan teknis
- **Stack:** Vite + vanilla TS, pendekatan aino.agency (ASCII langsung ke DOM/canvas, bundle kecil). Tanpa React.
- **Device:** desktop dulu, mobile menyusul.
- **Karakter: baked ASCII.** Model 3D gratis di-render offline jadi frame ASCII (char + depth + warna per sel),
  diputar sebagai teks. Three.js hanya di bake tool (dev); runtime produksi tanpa Three.js.
  - **Customization = bake per layer** (badan/helm/armor/senjata/pet). Runtime compose per sel: pilih layer dengan
    depth terdekat ke kamera.
  - **Satu sudut kamera samping**; arah sebaliknya cukup mirror.
  - v1: 2–3 varian per slot.
  - Ukuran karakter: awalnya ±40×60, lalu diganti ke proporsi realistis ±90 baris (lihat Update di bawah).
  - **Format sel (keputusan 2026-11-26):** simpan **shade level + part id** per sel, bukan char final. Runtime
    memetakan shade ke charset + palet material, jadi ganti material tidak perlu re-bake. Senjata juga menyimpan
    titik socket blade (pangkal, ujung) per frame untuk emitter partikel rune.
  - Sumber aset: KayKit Adventurers (CC0, sudah dipakai), Quaternius, Mixamo. Lisensi tiap aset wajib dicek.
- **Kontak:** form service (Formspree atau Web3Forms), email sebagai fallback.
- **Hosting:** VPS milik user dengan Caddy, deploy `dist` via GitHub Actions + rsync, hardening dasar.
  Domain belum ada (akan sewa). Keputusan ini menggantikan rencana awal GitHub Pages.

## Konten
- Semua data pribadi masih placeholder: level, guild/tempat kerja, summary, skill, lore, link, CV.
- **Pokecrut** (https://pokecrut.web.id, beta): game tower-defense/auto-battler di browser. Fitur: solo, duel vs CPU,
  multiplayer room dengan kode, turnamen, leaderboard, ranked, akun dengan password di-hash, backend self-hosted.
  Di portfolio diberi label "fan project, non-commercial" dan yang ditonjolkan sisi engineering. Portfolio tidak
  memakai atau meniru aset Pokémon.

## Status prototype bake (2026-11-26)
Lihat README. Ringkas: KayKit Knight, 4 layer (badan, helm, pedang, perisai), clip idle + walk, 13 frame @12fps.
Kualitas sudah ada volume (ramp `.:-=+*#%@` + shape vector), compose by depth dan mirror jalan.
Catatan: dengan tinggi 60 baris, grid jadi 99×60 karena pedang mengarah ke depan dan perisai di belakang;
badan saja ±48 kolom. Output 624 KB mentah / 121 KB gzip.

Update 2026-11-26: user menolak proporsi chibi. Karakter harus **proporsi realistis seperti referensi ansenjeo**.
Referensi (IG ansenjeo, panel CRAFT): karakter rapat seperti dot-matrix, terlihat ±70 baris dalam panel dan
diperkirakan ±90–100 baris untuk badan penuh, lebar badan ±25–30 kolom. Uji proporsi dengan Soldier (Mixamo)
90 baris sudah ada di repo (`?model=soldier`), 176 KB gzip untuk 2 layer.

## Masih terbuka
1. Aset final non-chibi bertema medieval (kandidat: Quaternius Modular Character Outfits – Fantasy + Universal
   Animation Library, atau Mixamo). Lisensi wajib dicek.
2. Tinggi final: ±90 baris dengan font kecil (±6–7px) supaya rapat seperti referensi.
3. Optimasi format (biner + delta) sebelum masuk portfolio. Shade level + part id sudah diimplementasi (v2).
4. Font final.
5. Isi konten asli untuk semua placeholder.
6. Domain.

Update 2026-11-26 (format v2): bake sekarang menyimpan shade level (index glyph shape vector di ramp `.:-=+*#%@`) +
part id + depth per sel, tanpa warna tekstur (gaya ansenjeo, disetujui user). Pedang KayKit dibagi `hilt`/`blade`
di sumbu lokal, dengan socket blade (pangkal, ujung) per frame. Player punya 4 material blade dan demo rune api
(partikel glyph + glow, mati saat reduced-motion). knight.json 86 KB gzip (dari 121 KB). Tuning partikel final ikut
desain Tavern.
