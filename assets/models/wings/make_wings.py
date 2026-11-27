"""Sayap bulu prosedural (aset buatan sendiri, CC0) untuk slot shoulder.

Jalankan: python3 make_wings.py  →  Wings.glb (di folder ini).
Koordinat glTF: Y atas, +Z depan karakter, satuan meter. Origin = punggung atas (ditempel ke spine_03).
Tiap sayap = lengan sayap (box) + kipas bulu (box pipih) yang makin panjang ke luar. Sayap kiri = mirror X.
"""
import json, math, struct, sys
from pathlib import Path


def box(center, axes, half):
    """Box berorientasi: axes = 3 vektor satuan (panjang, lebar, tebal). Return (pos, normal) per face (24 vert)."""
    verts, norms, idx = [], [], []
    for a in range(3):
        for s in (-1, 1):
            n = [s * axes[a][k] for k in range(3)]
            u, v = [(a + 1) % 3, (a + 2) % 3]
            base = len(verts)
            for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = [center[k] + s * half[a] * axes[a][k] + du * half[u] * axes[u][k] + dv * half[v] * axes[v][k] for k in range(3)]
                verts.append(p)
                norms.append(n)
            quad = [base, base + 1, base + 2, base, base + 2, base + 3]
            if s < 0:
                quad = [base, base + 2, base + 1, base, base + 3, base + 2]
            idx += quad
    return verts, norms, idx


def norm(v):
    l = math.sqrt(sum(x * x for x in v))
    return [x / l for x in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def segment(p0, p1, width, thick, up_hint=(0, 0, 1)):
    d = [p1[k] - p0[k] for k in range(3)]
    length = math.sqrt(sum(x * x for x in d))
    ax = norm(d)
    w = norm(cross(up_hint, ax))
    t = norm(cross(ax, w))
    c = [(p0[k] + p1[k]) / 2 for k in range(3)]
    return box(c, [ax, w, t], [length / 2, width / 2, thick / 2])


def wing(side):
    """side = +1 kanan, -1 kiri. Return list (verts, norms, idx, material)."""
    parts = []
    shoulder = [0.06 * side, 0.02, -0.14]
    elbow = [0.32 * side, 0.22, -0.24]
    tip = [0.58 * side, 0.34, -0.34]
    parts.append((*segment(shoulder, elbow, 0.07, 0.05), 'Bone'))
    parts.append((*segment(elbow, tip, 0.05, 0.04), 'Bone'))
    n = 16
    for i in range(n):
        t = i / (n - 1)
        # akar bulu di sepanjang lengan sayap
        if t < 0.5:
            r = [shoulder[k] + (elbow[k] - shoulder[k]) * (t / 0.5) for k in range(3)]
        else:
            r = [elbow[k] + (tip[k] - elbow[k]) * ((t - 0.5) / 0.5) for k in range(3)]
        ang = math.radians(-6 + 58 * t)  # dari hampir tegak ke bawah sampai menyamping ke luar
        length = 0.42 + 0.48 * t
        d = [math.sin(ang) * side, -math.cos(ang), -0.12 - 0.1 * t]
        d = norm(d)
        end = [r[k] + d[k] * length for k in range(3)]
        parts.append((*segment(r, end, 0.12 + 0.05 * t, 0.018), 'Feather'))
        # lapisan bulu pendek (covert) di atasnya
        if i % 2 == 0:  # tiap bulu kedua
            end2 = [r[k] + d[k] * length * 0.5 for k in range(3)]
            r2 = [r[0], r[1] + 0.02, r[2] + 0.02]
            parts.append((*segment(r2, end2, 0.13, 0.02), 'Feather'))
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
        'materials': [{'name': m, 'pbrMetallicRoughness': {'baseColorFactor': colors[m], 'metallicFactor': 0, 'roughnessFactor': 0.9}} for m in mats],
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
    write_glb(here / 'Wings.glb', parts, {'Feather': [0.5, 0.49, 0.46, 1], 'Bone': [0.42, 0.4, 0.36, 1]})
    print('ok', len(parts), 'pieces')
