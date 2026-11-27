"""Sayap malaikat jatuh prosedural (aset buatan sendiri, CC0) untuk slot back, satu slot dengan jubah.

Jalankan: python3 make_wings.py  →  Wings.glb (di folder ini).
Koordinat = ruang model saat rest pose (Y atas, +Z depan, meter); attachment memakai `rest: true` di spine_03.
Dibuat di pose idle frame 0 (`restClip: 'idle'`). Sayap terlipat (posisi istirahat), bukan terbentang: pergelangan sayap menyembul di atas bahu, bulu primer panjang
jatuh sampai betis. Tiap bulu = helai meruncing dengan tulang bulu (rachis) sedikit timbul, panjang diacak dan
sebagian bergerigi supaya terlihat compang-camping. Lapisan: bulu penutup (luar), sekunder, primer (dalam).
"""
import json, math, random, struct, sys
from pathlib import Path

random.seed(7)  # deterministik: hasil sama setiap dijalankan


def lerp3(a, b, t):
    return [a[k] + (b[k] - a[k]) * t for k in range(3)]


def norm(v):
    l = math.sqrt(sum(x * x for x in v)) or 1
    return [x / l for x in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def feather(root, tip, width, out, ragged=False, seg=8):
    """Helai bulu dari root ke tip. out = arah ke luar permukaan (menjauhi badan). Return (verts, norms, idx)."""
    d = [tip[k] - root[k] for k in range(3)]
    side = norm(cross(d, out))
    verts, idx = [], []
    for i in range(seg + 1):
        t = i / seg
        c = lerp3(root, tip, t)
        w = width * math.sin(math.pi * min(1.0, 0.15 + t) / 1.15) * (1 - t ** 3)  # melebar lalu meruncing
        if ragged and 0.55 < t < 0.95 and i % 2:
            w *= 0.45  # gerigi: bulu robek
        lift = 0.006 * (1 - t)
        for s in (-1, 0, 1):
            p = [c[k] + side[k] * w * s + out[k] * (lift if s == 0 else 0) for k in range(3)]
            verts.append(p)
    for i in range(seg):
        a = i * 3
        for j in range(2):
            p, q = a + j, a + j + 1
            idx += [p, p + 3, q, q, p + 3, q + 3]
    norms = [[0.0, 0.0, 0.0] for _ in verts]
    for i in range(0, len(idx), 3):
        p0, p1, p2 = (verts[idx[i + k]] for k in range(3))
        n = cross([p1[k] - p0[k] for k in range(3)], [p2[k] - p0[k] for k in range(3)])
        for k in range(3):
            for j in range(3):
                norms[idx[i + k]][j] += n[j]
    return verts, [norm(n) for n in norms], idx


def bone(a, b, r):
    """Tulang sayap: tabung segi-6 tipis dari a ke b."""
    d = norm([b[k] - a[k] for k in range(3)])
    u = norm(cross(d, [0, 0, 1] if abs(d[2]) < 0.9 else [1, 0, 0]))
    v = cross(d, u)
    verts, norms, idx = [], [], []
    for end in (a, b):
        for j in range(6):
            ang = j / 6 * math.tau
            n = [u[k] * math.cos(ang) + v[k] * math.sin(ang) for k in range(3)]
            verts.append([end[k] + n[k] * r for k in range(3)])
            norms.append(n)
    for j in range(6):
        p, q = j, (j + 1) % 6
        idx += [p, q, p + 6, q, q + 6, p + 6]
    return verts, norms, idx


def wing(s):
    """s = +1 kiri karakter (+X), -1 kanan."""
    X = lambda p: [p[0] * s, p[1], p[2]]
    S = X([0.08, 1.42, -0.16])  # bahu sayap di punggung atas
    E = X([0.19, 1.3, -0.23])  # siku terlipat ke bawah
    W = X([0.26, 1.68, -0.25])  # pergelangan menyembul di atas bahu
    H = X([0.24, 1.52, -0.27])  # ujung tulang tangan
    out = [0, 0, -1]  # permukaan luar menghadap belakang
    parts = [(*bone(S, E, 0.022), 'Bone'), (*bone(E, W, 0.018), 'Bone'), (*bone(W, H, 0.015), 'Bone')]
    # Primer: dari tangan (W→H) jatuh ke betis, sedikit melebar ke luar di bawah.
    for i in range(14):
        t = i / 13
        r = lerp3(W, H, t)
        r[2] += 0.003 * i
        length = random.uniform(1.1, 1.22) - 0.15 * t
        tip = [r[0] + s * (-0.02 + 0.04 * t), r[1] - length, r[2] - 0.03 + 0.02 * t]
        parts.append((*feather(r, tip, 0.06, out, ragged=random.random() < 0.4), 'Feather'))
    # Sekunder: dari lengan bawah (E→W), lebih pendek, menutupi pangkal primer.
    for i in range(14):
        t = i / 13
        r = lerp3(E, W, t)
        r[2] -= 0.02
        length = random.uniform(0.62, 0.75) * (0.8 + 0.35 * t)
        tip = [r[0] - s * 0.05 * (1 - t), r[1] - length, r[2] - 0.03]
        parts.append((*feather(r, tip, 0.065, out, ragged=random.random() < 0.35), 'Feather'))
    # Bulu penutup: dua baris pendek di atas, paling luar.
    for row, (ln, dz) in enumerate(((0.26, -0.04), (0.15, -0.055))):
        for i in range(11):
            t = i / 10
            r = lerp3(S, W, t) if row else lerp3(E, W, t)
            r = [r[0], r[1] + 0.02, r[2] + dz]
            tip = [r[0], r[1] - ln * random.uniform(0.85, 1.1), r[2] - 0.015]
            parts.append((*feather(r, tip, 0.05, out), 'Feather'))
    # Bulu bahu (skapular) dari S ke E.
    for i in range(6):
        r = lerp3(S, E, i / 5)
        r[2] -= 0.03
        tip = [r[0], r[1] - 0.32, r[2] - 0.02]
        parts.append((*feather(r, tip, 0.05, out), 'Feather'))
    return parts


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
    parts = wing(1) + wing(-1)
    write_glb(here / 'Wings.glb', parts, {'Feather': [0.5, 0.49, 0.46, 1], 'Bone': [0.4, 0.38, 0.35, 1]})
    print('ok', len(parts), 'pieces')
