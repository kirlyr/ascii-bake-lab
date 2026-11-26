# CLAUDE.md

Handoff untuk Claude Code. Rencana lengkap: `docs/PLAN.md`. Cara pakai tool: `README.md`.

## Project
Portfolio pribadi baru milik Atsal (GitHub `kirlyr`, full-stack developer) bertema dunia MMORPG retro medieval
berbasis ASCII, patokan kualitas aino.agency. Repo ini `ascii-bake-lab` = eksperimen pipeline karakter **baked
ASCII**; hasilnya nanti dipindah ke repo portfolio baru (belum dibuat).

## Keputusan yang sudah final (jangan dibuka ulang tanpa alasan kuat)
- Stack: Vite + vanilla TS, ASCII langsung ke DOM/canvas, tanpa framework UI. Desktop dulu.
- Struktur: intro ASCII → Character (Home), Quest Log (Work), Lore (About), Tavern (Play), Send a raven (Contact),
  plus Recruiter mode. Tavern dikerjakan setelah Home dan Quest Log. Forge (3–4 material, 2–3 rune partikel) ada
  di Tavern; tanpa inventory grid/stats. Main quest: Pokecrut (tanpa aset Pokémon).
- Palet: latar `#120e0a`, panel `#1b1510`, border `#4a3b2a`, teks `#ead9b5`, muted `#b0a083`, aksen `#d4a64a`,
  merah `#d8644c`, hijau `#8fae6a`. Animasi mati saat `prefers-reduced-motion`.
- Karakter: bake per layer (badan/helm/armor/senjata/pet), tiap sel = shade level + part id + depth (bukan char
  final, supaya material bisa di-swap di runtime; sudah diimplementasi, format v2), compose runtime pilih
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
- Belum ada repo portfolio. Konten pribadi masih placeholder.

## Langkah berikutnya (tunggu user bilang siap)
1. Rapikan karakter: animasi yang menggenggam pedang, warna material, varian helm/senjata.
2. Optimasi format output jika perlu (biner + delta).
3. Buat repo portfolio, pindahkan bake tool, mulai dari intro + Character (Home).

## Aturan kerja user
- Komunikasi dalam **Bahasa Indonesia**, istilah teknis tetap Inggris.
- **Jangan** memberi prompt/spec atau langsung coding selama diskusi masih berjalan. Tunggu user bilang siap.
- Prioritaskan kesederhanaan, hindari overengineering dan abstraksi yang tidak perlu.
- Tantang asumsi lemah, jelaskan trade-off, beri satu rekomendasi dengan alasan singkat.
- Jangan mengarang requirement bisnis; tandai asumsi sebagai asumsi.
- Repo private, tetap jangan simpan data pribadi (nomor telepon, alamat, dsb.) di repo.

## Perintah
- `npm run dev` → player di `/`, bake tool di `/bake.html`
- `npm run build` → type check + build player saja
