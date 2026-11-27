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
  jubah prosedural (buatan sendiri, simulasi kain Verlet saat bake di `src/bake/cloth.ts`, user minta) di slot baru Back (`back`), satu slot dengan sayap bulu (user: biarkan, tapi tema dark medieval → default jubah, sayap hitam).
  Legs/feet: versi gratis Quaternius habis, jadi pelat kaki + sepatu besi dibuat prosedural (`make_greaves.py`, attachment `rest: true`), dipilih user.
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
