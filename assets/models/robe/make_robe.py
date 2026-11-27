"""Rok jubah panjang (robe) prosedural (buatan sendiri, CC0) untuk slot chest, dipakai bersama tunik Peasant.

Jalankan: python3 make_robe.py  →  Robe.glb, RobeTattered.glb (di folder ini).
Koordinat = ruang model saat rest pose (Y atas, +Z depan, meter). Attachment `rest: true` di tulang `pelvis`.

Grid baris-mayor (baris 0 = pinggang) berbentuk tabung tertutup: kolom terakhir bersebelahan dengan kolom pertama
(`wrap` di ClothSpec). Disimulasikan sebagai kain saat bake: 2 baris atas dipaku di pinggang, kaki menendang ujungnya.
- Robe: rok sampai mata kaki, ujung rata, sedikit mengembang.
- RobeTattered: ujung compang-camping (panjang tiap kolom beda, sobekan segitiga) dan beberapa lubang.
"""
import json, math, random, struct, sys
from pathlib import Path

COLS, ROWS = 40, 30
TOP_Y, BOTTOM_Y = 1.0, 0.09
CZ = -0.03  # pusat pinggul di sumbu Z


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
        'asset': {'version': '2.0', 'generator': 'make_robe.py'},
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


def robe(tattered=False):
    random.seed(21 if tattered else 17)
    reach = [1.0] * COLS
    if tattered:
        # panjang tiap kolom acak, dengan sobekan segitiga di beberapa tempat
        for c in range(COLS):
            reach[c] = random.uniform(0.8, 0.97)
        for _ in range(6):
            c0, w, d = random.randrange(COLS), random.randint(2, 4), random.uniform(0.1, 0.2)
            for k in range(-w, w + 1):
                reach[(c0 + k) % COLS] = min(reach[(c0 + k) % COLS], 1 - d * (1 - abs(k) / (w + 1)))
    verts, cols = [], []
    for r in range(ROWS):
        t = r / (ROWS - 1)
        for c in range(COLS):
            a = c / COLS * math.tau  # 0 = depan, naik ke kiri karakter (+X)
            y = TOP_Y + (BOTTOM_Y - TOP_Y) * t * reach[c]
            tr = (TOP_Y - y) / (TOP_Y - BOTTOM_Y)
            ax = 0.2 + 0.1 * tr ** 1.2  # mengembang ke bawah
            az = 0.175 + 0.08 * tr ** 1.2
            fold = 0.012 * math.sin(a * 9) * tr  # lipatan vertikal halus, tumbuh ke bawah
            verts.append([math.sin(a) * (ax + fold), y, CZ + math.cos(a) * (az + fold)])
            v = 0.82 + 0.18 * math.sin(a * 9 + 0.6)  # belang lipatan
            if tattered:
                v *= random.uniform(0.75, 1.0) * (1 - 0.2 * tr)  # kotor dan pudar ke bawah
            cols.append([v, v, v, 1.0])
    idx = []
    holes = set()
    if tattered:
        for _ in range(7):
            holes.add((random.randint(ROWS // 3, ROWS - 3), random.randrange(COLS)))
    for r in range(ROWS - 1):
        for c in range(COLS):
            if (r, c) in holes or (r - 1, c) in holes:
                continue
            a, b = r * COLS + c, r * COLS + (c + 1) % COLS
            idx += [a, a + COLS, b, b, a + COLS, b + COLS]
    return verts, normals(verts, idx), cols, idx


if __name__ == '__main__':
    here = Path(sys.argv[0]).resolve().parent
    write_glb(here / 'Robe.glb', 'Robe', *robe(), 'Cloth', [0.55, 0.52, 0.48, 1])
    write_glb(here / 'RobeTattered.glb', 'RobeTattered', *robe(True), 'Cloth', [0.4, 0.38, 0.36, 1])
    print('ok', COLS, 'x', ROWS)
