# Sumber aset

- `Flail.glb`: **buatan sendiri**, dibuat prosedural oleh `make_flail.py` (2026-11-27). Lisensi: CC0.
- Mesh `Chain` (9 mata rantai lurus) dan `Ball` hanya templat: saat bake, rantai disimulasikan sebagai tali Verlet
  yang digantung dari ujung gagang (`src/bake/flail.ts`), lalu tiap mata rantai dan bola dipindah ke posisi simulasi.
