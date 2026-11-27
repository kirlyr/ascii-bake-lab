"""Jubah prosedural (aset buatan sendiri, CC0) untuk slot back.

Jalankan: python3 make_cloak.py  →  Cloak.glb (di folder ini).
Koordinat glTF: Y atas, +Z depan karakter, satuan meter. Origin = punggung atas (ditempel ke spine_03).
Jubah = lembar melengkung dari bahu sampai betis, melebar dan menjauh ke belakang di bawah, dengan lipatan
kain (gelombang sinus) dan kerah yang membungkus bahu. Material dua sisi.
"""
import json, math, struct, sys
from pathlib import Path

ROWS, COLS = 18, 24
TOP_Y, BOTTOM_Y = 0.22, -1.0
FOLDS = 5


def cloak():
    verts, idx = [], []
    for r in range(ROWS + 1):
        t = r / ROWS  # 0 = kerah, 1 = ujung bawah
        y = TOP_Y + (BOTTOM_Y - TOP_Y) * t
        half_w = 0.27 + 0.2 * t  # melebar ke bawah
        back = 0.2 + 0.18 * t ** 1.4  # menjauh dari badan (jatuh di belakang kaki saat berjalan)
        wrap = math.radians(150 - 45 * t)  # kerah membungkus bahu, bawah lebih terbuka
        for c in range(COLS + 1):
            u = c / COLS * 2 - 1  # -1..1 kiri ke kanan
            a = u * wrap / 2
            x = math.sin(a) * half_w
            z = -math.cos(a) * back
            fold = math.sin(u * math.pi * FOLDS) * 0.025 * t  # lipatan makin dalam ke bawah
            z -= fold
            verts.append([x, y, z])
    for r in range(ROWS):
        for c in range(COLS):
            a = r * (COLS + 1) + c
            b, d = a + 1, a + COLS + 1
            idx += [a, d, b, b, d, d + 1]
    # normal per vertex dari rata-rata normal segitiga
    norms = [[0.0, 0.0, 0.0] for _ in verts]
    for i in range(0, len(idx), 3):
        p0, p1, p2 = (verts[idx[i + k]] for k in range(3))
        e1 = [p1[k] - p0[k] for k in range(3)]
        e2 = [p2[k] - p0[k] for k in range(3)]
        n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        for k in range(3):
            for j in range(3):
                norms[idx[i + k]][j] += n[j]
    norms = [[v / (math.sqrt(sum(x * x for x in n)) or 1) for v in n] for n in norms]
    return [(verts, norms, idx, 'Cloth')]


def write_glb(path, parts, colors):
    mats = sorted({p[3] for p in parts})
    bin_ = bytearray()
    accessors, views, prims = [], [], []
    for mi, mat in enumerate(mats):
        V, N, I = [], [], []
        for v, n, idx, m in parts:
            if m != mat:
                continue
            off = len(V)
            V += v
            N += n
            I += [off + x for x in idx]
        for data, fmt, target, comp, typ in ((V, 'f', 34962, 5126, 'VEC3'), (N, 'f', 34962, 5126, 'VEC3'), (I, 'I', 34963, 5125, 'SCALAR')):
            flat = [x for row in data for x in row] if typ == 'VEC3' else data
            start = len(bin_)
            bin_ += struct.pack(f'<{len(flat)}{fmt}', *flat)
            while len(bin_) % 4:
                bin_ += b'\0'
            views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(flat) * 4, 'target': target})
            acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(data), 'type': typ}
            if typ == 'VEC3' and data is V:
                acc['min'] = [min(p[k] for p in V) for k in range(3)]
                acc['max'] = [max(p[k] for p in V) for k in range(3)]
            accessors.append(acc)
        a0 = len(accessors) - 3
        prims.append({'attributes': {'POSITION': a0, 'NORMAL': a0 + 1}, 'indices': a0 + 2, 'material': mi})
    gltf = {
        'asset': {'version': '2.0', 'generator': 'make_wings.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': 'Wings', 'mesh': 0}],
        'meshes': [{'name': 'Wings', 'primitives': prims}],
        'materials': [{'name': m, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': colors[m], 'metallicFactor': 0, 'roughnessFactor': 0.9}} for m in mats],
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': len(bin_)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    Path(path).write_bytes(out)


if __name__ == '__main__':
    here = Path(sys.argv[0]).resolve().parent
    # Abu-abu sedang: warna akhir dari pewarna part `cloak` di runtime (lihat SOURCE.md).
    write_glb(here / 'Cloak.glb', cloak(), {'Cloth': [0.45, 0.44, 0.42, 1]})
    print('ok')
