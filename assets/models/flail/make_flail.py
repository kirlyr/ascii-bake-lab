"""Flail berantai prosedural (buatan sendiri, CC0) untuk slot weapon.

Jalankan: python3 make_flail.py  →  Flail.glb (di folder ini).
Konvensi sama dengan senjata Quaternius supaya bisa dipasang dengan helper `weapon()` di preset: node diputar -90° X
dan diskala 100, sumbu panjang = +Z mesh, origin = tengah genggaman.

Mesh (nama material = nama part di preset):
- Wood: gagang kayu. Leather: lilitan genggaman. Steel: cincin ujung gagang + mata rantai + bola berduri.
- Rantai dan bola mesh terpisah (`Chain`, `Ball`): posisinya ditulis ulang tiap frame oleh simulasi rantai di bake
  (`src/bake/flail.ts`), jadi bentuk awal di sini hanya posisi tergantung lurus.
"""
import json, math, struct, sys
from pathlib import Path

U = 1 / 18  # meter → unit mesh (skala node 100 × skala attachment 0,18)
HAFT = (-0.12, 0.36)  # dari pangkal ke ujung gagang (m), origin = genggaman
LINKS, LINK_LEN = 9, 0.038
BALL_R = 0.055


def ring(cz, r, w, seg=16):
    """Pita tabung pendek di sumbu Z (cincin logam)."""
    V, N, I = [], [], []
    for z in (cz - w / 2, cz + w / 2):
        for j in range(seg):
            a = j / seg * math.tau
            V.append([math.cos(a) * r, math.sin(a) * r, z])
            N.append([math.cos(a), math.sin(a), 0])
    for j in range(seg):
        p, q = j, (j + 1) % seg
        I += [p, q, p + seg, q, q + seg, p + seg]
    return V, N, I


def cylinder(z0, z1, r0, r1, seg=10):
    V, N, I = [], [], []
    for z, r in ((z0, r0), (z1, r1)):
        for j in range(seg):
            a = j / seg * math.tau
            V.append([math.cos(a) * r, math.sin(a) * r, z])
            N.append([math.cos(a), math.sin(a), 0])
    for j in range(seg):
        p, q = j, (j + 1) % seg
        I += [p, q, p + seg, q, q + seg, p + seg]
    return V, N, I


def torus_link(R, r, seg=10, tube=6):
    """Satu mata rantai: torus pipih di bidang XZ (sumbu panjang Z), dipusatkan di 0."""
    V, N, I = [], [], []
    for i in range(seg):
        u = i / seg * math.tau
        for j in range(tube):
            v = j / tube * math.tau
            c = [math.cos(u) * R * 0.6, 0, math.sin(u) * R]
            n = [math.cos(u) * math.cos(v), math.sin(v), math.sin(u) * math.cos(v)]
            V.append([c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r])
            N.append(n)
    for i in range(seg):
        for j in range(tube):
            a, b = i * tube + j, ((i + 1) % seg) * tube + j
            c, d = i * tube + (j + 1) % tube, ((i + 1) % seg) * tube + (j + 1) % tube
            I += [a, b, c, c, b, d]
    return V, N, I


def ball(R, spikes=14, seg=14):
    """Bola + duri kerucut (titik Fibonacci di permukaan)."""
    V, N, I = [], [], []
    for i in range(seg + 1):
        th = i / seg * math.pi
        for j in range(seg):
            ph = j / seg * math.tau
            n = [math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)]
            V.append([x * R for x in n])
            N.append(n)
    for i in range(seg):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            I += [a, a + seg, b, b, a + seg, b + seg]
    for k in range(spikes):
        y = 1 - 2 * (k + 0.5) / spikes
        rr = math.sqrt(1 - y * y)
        ph = k * math.pi * (3 - math.sqrt(5))
        d = [rr * math.cos(ph), y, rr * math.sin(ph)]
        t = [1, 0, 0] if abs(d[0]) < 0.9 else [0, 1, 0]
        u = [d[1] * t[2] - d[2] * t[1], d[2] * t[0] - d[0] * t[2], d[0] * t[1] - d[1] * t[0]]
        l = math.sqrt(sum(x * x for x in u))
        u = [x / l for x in u]
        w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
        base = len(V)
        tip = [x * R * 1.7 for x in d]
        V.append(tip)
        N.append(d)
        for j in range(5):
            a = j / 5 * math.tau
            p = [d[m] * R * 0.92 + (u[m] * math.cos(a) + w[m] * math.sin(a)) * R * 0.28 for m in range(3)]
            V.append(p)
            N.append([u[m] * math.cos(a) + w[m] * math.sin(a) for m in range(3)])
        for j in range(5):
            I += [base, base + 1 + j, base + 1 + (j + 1) % 5]
    return V, N, I


def merge(*parts):
    V, N, I = [], [], []
    for v, n, i in parts:
        off = len(V)
        V += v
        N += n
        I += [off + x for x in i]
    return V, N, I


def scaled(part, k=U, dz=0.0):
    v, n, i = part
    return [[p[0] * k, p[1] * k, (p[2] + dz) * k] for p in v], n, i


def write_glb(path, meshes, colors):
    bin_ = bytearray()
    accessors, views, gmeshes, nodes, mats = [], [], [], [], []
    for name, mat, (V, N, I) in meshes:
        if mat not in mats:
            mats.append(mat)
        for data, fmt, target, comp, typ in ((V, 'f', 34962, 5126, 'VEC3'), (N, 'f', 34962, 5126, 'VEC3'), (I, 'I', 34963, 5125, 'SCALAR')):
            flat = [x for row in data for x in row] if typ == 'VEC3' else data
            start = len(bin_)
            bin_ += struct.pack(f'<{len(flat)}{fmt}', *flat)
            while len(bin_) % 4:
                bin_ += b'\0'
            views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(flat) * 4, 'target': target})
            acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(data), 'type': typ}
            if data is V:
                acc['min'] = [min(p[k] for p in V) for k in range(3)]
                acc['max'] = [max(p[k] for p in V) for k in range(3)]
            accessors.append(acc)
        a0 = len(accessors) - 3
        gmeshes.append({'name': name, 'primitives': [{'attributes': {'POSITION': a0, 'NORMAL': a0 + 1}, 'indices': a0 + 2, 'material': mats.index(mat)}]})
        nodes.append({'name': name, 'mesh': len(gmeshes) - 1})
    root = {'name': 'Flail', 'children': list(range(1, len(nodes) + 1)), 'rotation': [-0.7071068, 0, 0, 0.7071068], 'scale': [100, 100, 100]}
    gltf = {
        'asset': {'version': '2.0', 'generator': 'make_flail.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [root] + nodes,
        'meshes': gmeshes,
        'materials': [{'name': m, 'pbrMetallicRoughness': {'baseColorFactor': colors[m], 'metallicFactor': 0, 'roughnessFactor': 0.8}} for m in mats],
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
    z0, z1 = HAFT
    haft = merge(cylinder(z0, z1, 0.017, 0.015), ring(z0, 0.019, 0.02))
    grip = cylinder(-0.07, 0.07, 0.0185, 0.0185)
    cap = merge(ring(z1 - 0.01, 0.019, 0.03), ring(z1 + 0.012, 0.008, 0.02))
    # Rantai tergantung lurus dari ujung gagang (arah +Z = menjauhi tangan) di posisi awal.
    # Mata rantai berselang-seling diputar 90° di sumbu panjang.
    lv, ln, li = torus_link(LINK_LEN * 0.62, 0.005)
    links = []
    for k in range(LINKS):
        swap = (lambda q: [q[1], q[0], q[2]]) if k % 2 else (lambda q: q)
        dz = z1 + 0.02 + (k + 0.5) * LINK_LEN
        links.append(([[*swap(q)[:2], q[2] + dz] for q in lv], [swap(n) for n in ln], li))
    chain = merge(*links)
    head = scaled(ball(BALL_R), dz=z1 + 0.02 + LINKS * LINK_LEN + BALL_R)
    write_glb(here / 'Flail.glb', [
        ('Haft', 'Wood', scaled(haft)),
        ('Grip', 'Leather', scaled(grip)),
        ('Cap', 'Steel', scaled(cap)),
        ('Chain', 'Chain', scaled(chain)),
        ('Ball', 'Ball', head),
    ], {'Wood': [0.45, 0.32, 0.2, 1], 'Leather': [0.3, 0.2, 0.14, 1], 'Steel': [0.55, 0.55, 0.57, 1], 'Chain': [0.55, 0.55, 0.57, 1], 'Ball': [0.5, 0.5, 0.52, 1]})
    print('ok')
