"""Mantel bulu prosedural (buatan sendiri, CC0) untuk slot shoulders.

Jalankan: python3 make_mantle.py  →  FurMantle.glb (di folder ini).
Koordinat = ruang model pada pose idle frame 0 (Y atas, +Z depan, meter): attachment `rest: true, restClip: 'idle'`
di tulang `spine_03`, kaku (bulu tebal tidak berayun). Kerah bulu: tabung pendek dari pangkal leher yang melebar ke
pundak lalu jatuh melewati bahu, dengan gumpalan bulu acak (radius dan tepi bawah tidak rata, warna vertex belang).
"""
import json, math, random, struct, sys
from pathlib import Path

COLS, ROWS = 44, 9
TOP, CZ = 1.56, -0.035  # pangkal leher di pose idle frame 0


def write_glb(path, name, verts, norms, cols, idx, material, color):
    bin_ = bytearray()
    views, accessors = [], []
    for data, fmt, target, comp, typ in ((verts, 'f', 34962, 5126, 'VEC3'), (norms, 'f', 34962, 5126, 'VEC3'), (cols, 'f', 34962, 5126, 'VEC4'), (idx, 'I', 34963, 5125, 'SCALAR')):
        flat = [x for row in data for x in row] if typ != 'SCALAR' else data
        start = len(bin_)
        bin_ += struct.pack(f'<{len(flat)}{fmt}', *flat)
        while len(bin_) % 4:
            bin_ += b'\0'
        views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(flat) * 4, 'target': target})
        acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(data), 'type': typ}
        if data is verts:
            acc['min'] = [min(p[k] for p in verts) for k in range(3)]
            acc['max'] = [max(p[k] for p in verts) for k in range(3)]
        accessors.append(acc)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'make_mantle.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'material': 0}]}],
        'materials': [{'name': material, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': color, 'metallicFactor': 0, 'roughnessFactor': 0.95}}],
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


def normals(verts, idx):
    norms = [[0.0, 0.0, 0.0] for _ in verts]
    for i in range(0, len(idx), 3):
        p0, p1, p2 = (verts[idx[i + k]] for k in range(3))
        a = [p1[k] - p0[k] for k in range(3)]
        b = [p2[k] - p0[k] for k in range(3)]
        n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
        for k in range(3):
            for j in range(3):
                norms[idx[i + k]][j] += n[j]
    return [[x / (math.sqrt(sum(y * y for y in n)) or 1) for x in n] for n in norms]


def mantle():
    random.seed(13)
    tuft = [random.uniform(0.0, 1.0) for _ in range(COLS)]
    drop = [random.uniform(0.0, 0.05) for _ in range(COLS)]
    verts, colors = [], []
    for r in range(ROWS):
        t = r / (ROWS - 1)
        for c in range(COLS):
            a = c / COLS * math.tau
            back = max(0.0, -math.cos(a))  # di punggung lebih panjang
            # Gumpalan bulu: radius naik-turun per kolom, makin kasar ke tepi bawah.
            fluff = (0.012 + 0.03 * t) * (tuft[c] - 0.5) + 0.007 * math.sin(a * 13 + r * 1.7)
            y = TOP - (0.17 + drop[c] + 0.05 * back) * t
            y -= 0.035 * max(0.0, math.cos(a)) * (1 - t)  # kerah depan lebih rendah, tidak menutup dagu
            # Profil: naik cepat dari leher ke pundak, lalu jatuh hampir tegak melewati bahu.
            k = min(1.0, t / 0.45) ** 0.6
            rx = 0.12 + 0.16 * k + 0.02 * max(0.0, t - 0.45) / 0.55 + fluff
            rz = 0.12 + (0.1 + 0.04 * back) * k + 0.02 * max(0.0, t - 0.45) / 0.55 + fluff
            verts.append([math.sin(a) * rx, y, CZ + math.cos(a) * rz])
            v = 0.7 + 0.3 * tuft[c] * (0.6 + 0.4 * math.sin(r * 2.3 + c))
            colors.append([v, v, v, 1.0])
    idx = []
    for r in range(ROWS - 1):
        for c in range(COLS):
            a, b = r * COLS + c, r * COLS + (c + 1) % COLS
            idx += [a, a + COLS, b, b, a + COLS, b + COLS]
    return verts, normals(verts, idx), colors, idx


if __name__ == '__main__':
    here = Path(sys.argv[0]).resolve().parent
    write_glb(here / 'FurMantle.glb', 'FurMantle', *mantle(), 'Fur', [0.45, 0.38, 0.3, 1])
    print('ok', COLS, 'x', ROWS)
