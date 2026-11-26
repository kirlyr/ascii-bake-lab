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
- Karakter: bake per layer (badan/helm/armor/senjata/pet), tiap sel = char + depth + warna, compose runtime pilih
  depth terdekat. Sel disimpan sebagai shade level + part id (bukan char final) agar material bisa di-swap di
  runtime. Satu sudut kamera samping, arah sebaliknya = mirror. v1: 2–3 varian per slot.
- Proporsi karakter **realistis, bukan chibi** (seperti referensi IG ansenjeo), tinggi ±90 baris, font kecil supaya rapat.
- Three.js hanya di bake tool (dev). Build produksi tidak boleh membawa Three.js.
- Kontak: form service (Formspree/Web3Forms). Hosting: VPS user + Caddy, deploy `dist` via GitHub Actions rsync.
  Domain belum ada.

## Status (2026-11-26)
- Prototype bake tool + player selesai di repo ini (KayKit Knight CC0, idle + walk, 4 layer, mirror). Lihat README
  untuk hasil dan ukuran file.
- Uji proporsi realistis: preset `soldier` (Mixamo, glb tidak di-commit), 90 baris. KayKit Knight (chibi) hanya
  dipakai untuk membuktikan pipeline.
- Belum ada repo portfolio. Konten pribadi masih placeholder.

## Langkah berikutnya (tunggu user bilang siap)
1. Pilih aset final non-chibi bertema medieval + cek lisensinya (lihat "Masih terbuka" di `docs/PLAN.md`).
2. Optimasi format output jika perlu.
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
