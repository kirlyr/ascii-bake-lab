"""Pelat kaki + sepatu besi prosedural (aset buatan sendiri, CC0) untuk slot legs dan feet.

Jalankan: python3 make_greaves.py  →  6 file .glb (di folder ini).
Koordinat = ruang model saat rest pose (Y atas, +Z depan, meter, kaki kiri di +X). Attachment memakai `rest: true`,
jadi bake tool memindahkan mesh ini ke ruang lokal tulangnya sendiri. Tiap potongan kaku, ikut satu tulang:
- Thigh_<s>: pelat paha (setengah tabung depan, 3 lame) → thigh_<s>
- Greave_<s>: tempurung lutut + pelindung tulang kering (tabung penuh) → calf_<s>
- Sabaton_<s>: sepatu besi berlapis → foot_<s>
"""
import json, math, struct, sys
from pathlib import Path

LEG_X = 0.114  # posisi tulang thigh/calf/foot di sumbu X (dari __bones di bake tool)
LEG_Z = -0.036


def lerp(a, b, t):
    return a + (b - a) * t


def sawtooth(t, n, depth):
    """Tonjolan tepi bawah tiap lame: pelat bertumpuk seperti sisik."""
    return depth * ((t * n) % 1.0) if n else 0.0


def surface(rows, cols, point):
    """Grid (rows+1)×(cols+1) dari point(t, u) → [x,y,z], plus normal halus."""
    verts = [point(r / rows, c / cols) for r in range(rows + 1) for c in range(cols + 1)]
    idx = []
    for r in range(rows):
        for c in range(cols):
            a = r * (cols + 1) + c
            b, d = a + 1, a + cols + 1
            idx += [a, d, b, b, d, d + 1]
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
    return verts, norms, idx


def tube(cx, cz, y0, y1, radius, arc, lames=0, forward=0.0, depth=1.05, rows=16, cols=28):
    """Tabung vertikal dari y0 ke y1. radius(t) → r, arc = sudut total (derajat) yang menghadap depan (+Z)."""

    def point(t, u):
        a = math.radians((u - 0.5) * arc)
        r = radius(t) + sawtooth(t, lames, 0.008)
        z = cz(t) if callable(cz) else cz
        return [cx + math.sin(a) * r, lerp(y0, y1, t), z + forward + math.cos(a) * r * (depth if math.cos(a) < 0 else 1.05)]

    return surface(rows, cols, point)


def thigh(s):
    x = LEG_X * s
    # Di atas celana Ranger yang longgar (r ±0,105).
    return [(*tube(x, LEG_Z, 0.9, 0.56, lambda t: lerp(0.122, 0.112, t), 220, lames=3), 'Plate')]


def greave(s):
    x = LEG_X * s
    # Betis menggembung di sepertiga atas, menyempit ke pergelangan.
    calf = lambda t: 0.072 + 0.012 * math.sin(min(t / 0.35, 1) * math.pi / 2) - 0.03 * max(0, (t - 0.35) / 0.65) ** 1.2
    knee = tube(x, LEG_Z, 0.6, 0.47, lambda t: 0.1 - 0.035 * (2 * t - 1) ** 2, 160, forward=0.012, rows=8)
    # Tulang kering miring ke belakang: pusat ikut garis calf (z -0,036) → foot (z -0,088).
    shin = tube(x, lambda t: lerp(LEG_Z - 0.012, -0.088, t), 0.5, 0.14, calf, 360, depth=1.3)
    return [(*knee, 'Plate'), (*shin, 'Plate')]


def sabaton(s):
    x = LEG_X * s
    z0, z1 = -0.15, 0.2  # tumit → ujung jari

    def point(t, u):
        z = lerp(z0, z1, t)
        h = 0.15 * (1 - t) ** 0.6 + 0.05 * t if t < 0.55 else lerp(0.105, 0.06, (t - 0.55) / 0.45)
        w = 0.062 + 0.014 * math.sin(t * math.pi)
        # Ujung jari dan tumit ditutup membulat supaya kaki tidak terlihat dari depan/belakang.
        close = min(1.0, (1 - t) / 0.15) ** 0.5 * min(1.0, t / 0.12) ** 0.5
        w *= 0.15 + 0.85 * close
        h *= 0.15 + 0.85 * close
        a = (u - 0.5) * math.pi * 1.15  # sedikit melewati samping sampai ke sol
        lame = sawtooth(t, 5, 0.006) if t > 0.35 else 0.0
        return [x + math.sin(a) * (w + lame), max(0.0, math.cos(a)) * (h + lame) + 0.004, z]

    return [(*surface(20, 24, point), 'Plate')]


def write_glb(path, parts, colors, name):
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
        'asset': {'version': '2.0', 'generator': 'make_greaves.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': prims}],
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
    # Abu-abu besi: warna akhir dari pewarna part `armor` (Plate) di runtime.
    colors = {'Plate': [0.62, 0.62, 0.64, 1]}
    for s, side in ((1, 'L'), (-1, 'R')):
        for name, fn in (('Thigh', thigh), ('Greave', greave), ('Sabaton', sabaton)):
            write_glb(here / f'{name}_{side}.glb', fn(s), colors, f'{name}_{side}')
    print('ok')
