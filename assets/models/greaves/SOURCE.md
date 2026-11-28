# Sumber aset

- Pelat kaki (paha, lutut, tulang kering) dan sepatu besi: **buatan sendiri**, dibuat prosedural oleh `make_greaves.py`
  (2026-11-27). Lisensi: CC0, bebas dipakai.
- Versi gratis Modular Character Outfits Quaternius tidak berisi pelat kaki; versi Source berbayar tidak dipakai.
- Tiap potongan kaku dan ditempel ke satu tulang (thigh/calf/foot), dibuat di ruang model rest pose (`rest: true`).
- Warna dasar abu-abu besi; warna akhir dari pewarna part `armor` (Plate) di runtime.
- Set ramping (`ThighLean`, `GreaveLean`): pelat paha mulus hanya sisi depan, pelindung tulang kering terbuka di belakang.
- Sepatu (2026-11-28) mengikuti profil kaki badan UBC yang diukur dari mesh, dipecah per tulang supaya jari dan
  pergelangan yang menekuk tetap tertutup: bagian tumit → `foot`, bagian jari (`*Toe`) → `ball`, kerah/batang → `calf`.
  - Iron Sabatons (`Sabaton`, `SabatonToe`, `Ankle`): gothic, moncong lancip, 6 lame di punggung kaki, kerah pergelangan.
  - Duelist Boots (`SabatonLean`, `SabatonLeanToe`, `BootLean`): bot kulit sampai bawah lutut (part `leather`), tutup
    jari dan sabuk pergelangan besi.
