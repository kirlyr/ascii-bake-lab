# Sumber aset

`Wings.glb`, `WingsAngel.glb`, `WingsBroken.glb` dibuat sendiri dengan `make_wings.py` (geometri prosedural: lengan sayap + kipas bulu dari box pipih),
jadi bebas lisensi (CC0). Tidak ada model sayap CC0 di mirror Quaternius yang dipakai repo ini.

Ubah bentuk lewat konstanta di `wing()` lalu jalankan `python3 make_wings.py`. Ujung sayap harus tetap di bawah
puncak kepala: framing bake mengukur silhouette semua layer, jadi sayap yang lebih tinggi mengecilkan karakter.

Warna dasar sengaja abu-abu sedang (bukan putih): auto-level bake dihitung dari semua layer, jadi sayap putih
membuat badan terlihat gelap. Warna akhir datang dari pewarna part `feather` (sayap gelap/rusak) atau `plume` (sayap malaikat, bawaan putih) di runtime.

Sayap malaikat dibatasi rentang ±0,85 m: lebih lebar dari itu, sayap terpotong di panggung Tavern dari depan.
