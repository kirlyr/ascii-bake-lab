"""Tabung panah (quiver) prosedural (buatan sendiri, CC0) untuk slot back, dipakai bersama busur Quaternius.

Jalankan: python3 make_quiver.py  →  Quiver.glb (di folder ini).
Koordinat = ruang model pada pose idle frame 0 (Y atas, +Z depan, meter): attachment `rest: true, restClip: 'idle'`
di tulang `spine_03`. Tabung kulit miring di punggung (mulut di belakang bahu kanan), berisi 7 anak panah yang
bulu ekornya mencuat dari mulut tabung.
"""
import json, math, random, struct, sys
from pathlib import Path

BOTTOM = (0.11, 1.0, -0.215)  # ujung bawah tabung (pinggang kiri belakang)
TOP = (-0.11, 1.44, -0.235)  # mulut tabung (belakang bahu kanan)


def lerp(a, b, t):
    return a + (b - a) * t


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


def frame(a, b):
    """Basis ortonormal untuk sumbu a→b: (arah, u, v)."""
    d = [b[k] - a[k] for k in range(3)]
    n = math.sqrt(sum(x * x for x in d))
    d = [x / n for x in d]
    up = [0.0, 0.0, 1.0]
    u = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]
    un = math.sqrt(sum(x * x for x in u))
    u = [x / un for x in u]
    v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
    return d, u, v, n


def cylinder(a, b, radius, rows=8, cols=16, cap=True):
    d, u, v, n = frame(a, b)

    def pt(t, s):
        if cap and t < 0.1:  # dasar tertutup membulat
            r = radius(0) * math.sin(t / 0.1 * math.pi / 2)
            t2 = 0.0
        else:
            r = radius(t)
            t2 = (t - 0.1) / 0.9 if cap else t
        ang = s * math.tau
        c = [a[k] + d[k] * n * t2 for k in range(3)]
        return [c[k] + (u[k] * math.cos(ang) + v[k] * math.sin(ang)) * r for k in range(3)]

    return surface(rows, cols, pt)


def quiver():
    random.seed(4)
    parts = []
    # Tabung kulit, sedikit melebar ke mulut, dengan dua sabuk.
    parts.append((*cylinder(BOTTOM, TOP, lambda t: 0.04 + 0.01 * t + (0.004 if abs(t - 0.25) < 0.04 or abs(t - 0.8) < 0.04 else 0), rows=20), 'Leather'))
    d, u, v, n = frame(BOTTOM, TOP)
    for i in range(7):
        ang = i / 7 * math.tau + random.uniform(-0.3, 0.3)
        off = random.uniform(0.012, 0.03)
        tilt = random.uniform(-0.012, 0.012)
        base = [TOP[k] + (u[k] * math.cos(ang) + v[k] * math.sin(ang)) * off - d[k] * 0.25 for k in range(3)]
        out = random.uniform(0.1, 0.15)
        nock = [TOP[k] + (u[k] * math.cos(ang) + v[k] * math.sin(ang)) * (off + tilt) + d[k] * out for k in range(3)]
        parts.append((*cylinder(base, nock, lambda t: 0.0045, rows=2, cols=6, cap=False), 'Wood'))
        # Bulu ekor: tiga sirip tipis di 9 cm teratas.
        fd, fu, fv, fn = frame(base, nock)
        for k in range(3):
            fa = ang + k * math.tau / 3
            side = [fu[j] * math.cos(fa) + fv[j] * math.sin(fa) for j in range(3)]

            def fin(t, s, side=side, nock=nock, fd=fd):
                along = -0.09 * (1 - t) - 0.008
                w = 0.022 * s * (0.4 + 0.6 * math.sin(t * math.pi * 0.9))
                return [nock[j] + fd[j] * along + side[j] * w for j in range(3)]

            parts.append((*surface(3, 2, fin), 'Feather'))
    return parts


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
        'asset': {'version': '2.0', 'generator': 'make_quiver.py'},
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
    colors = {'Leather': [0.4, 0.27, 0.16, 1], 'Wood': [0.55, 0.42, 0.28, 1], 'Feather': [0.2, 0.2, 0.2, 1]}
    write_glb(here / 'Quiver.glb', quiver(), colors, 'Quiver')
    print('ok')
