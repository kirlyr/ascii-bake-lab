"""Tudung gelap (cowl) prosedural (buatan sendiri, CC0) untuk slot head.

Jalankan: python3 make_hood.py  →  Hood.glb, Capelet.glb (di folder ini).
Koordinat = ruang model saat rest pose (Y atas, +Z depan, meter). Attachment `rest: true`.
- Hood: tudung kaku di tulang `Head`, cangkang elips di sekitar kepala (diukur dari mesh UBC: pusat y 1,69,
  setengah lebar 9 cm, puncak 1,81) dengan bukaan wajah di depan dan ujung tudung jatuh ke belakang.
- Capelet: jubah bahu pendek, tabung kain tertutup dari leher sampai bahu (`wrap`), disimulasikan saat bake di
  tulang `spine_03`; lengan yang berayun mendorong ujungnya.
"""
import json, math, random, struct, sys
from pathlib import Path

C = (0.0, 1.695, -0.008)  # pusat kepala


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
        'asset': {'version': '2.0', 'generator': 'make_hood.py'},
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


def hood(rows=26, cols=36):
    random.seed(3)
    verts, colors = [], []
    for r in range(rows + 1):
        t = r / rows
        if t <= 0.78:
            e = math.radians(90 - t / 0.78 * 158)  # puncak → bawah dagu (-68°)
            drape = 0.0
        else:
            e = math.radians(-68)
            drape = (t - 0.78) / 0.22  # turun ke pangkal leher, sedikit melebar
        # Bukaan wajah: setengah lebar sudut (derajat) di depan, menutup di atas dahi.
        ed = math.degrees(e)
        w = 52 * min(1.0, max(0.0, (38 - ed) / 14)) if ed < 38 else 0.0
        if ed < -45 and drape == 0:
            w = 52 + (-45 - ed) * 0.3
        if drape:
            w = 59 + 6 * drape
        for c in range(cols + 1):
            a = math.radians(w + c / cols * (360 - 2 * w))  # 0 = depan (+Z), naik ke kiri karakter
            ce, se = math.cos(e), math.sin(e)
            rx, rz = 0.122, (0.132 if math.cos(a) > 0 else 0.13)
            ry = 0.138
            x = math.sin(a) * ce * rx
            z = math.cos(a) * ce * rz
            y = C[1] + se * ry
            # Ujung tudung: punggung atas ditarik ke belakang dan sedikit turun, seperti kain yang terlipat.
            back = max(0.0, -math.cos(a)) ** 2 * max(0.0, math.sin(e + 0.5)) ** 2
            z -= 0.05 * back
            y -= 0.015 * back
            if drape:
                k = 1 + 0.35 * drape
                x *= k
                z = z * k - 0.01 * drape
                y -= 0.07 * drape
            # Lipatan halus + tepi bukaan wajah sedikit menebal ke depan.
            fold = 0.004 * math.sin(a * 7 + e * 3)
            n = math.hypot(x, z) or 1
            x += x / n * fold
            z += z / n * fold
            verts.append([x, y, C[2] + z])
            v = 0.85 + 0.15 * math.sin(a * 7 + e * 3)
            if c in (0, cols):
                v *= 0.7  # tepi bukaan gelap (bayangan wajah)
            colors.append([v, v, v, 1.0])
    idx = []
    for r in range(rows):
        for c in range(cols):
            a = r * (cols + 1) + c
            b, d = a + 1, a + cols + 1
            idx += [a, d, b, b, d, d + 1]
    return verts, normals(verts, idx), colors, idx


CAPE_COLS, CAPE_ROWS = 36, 10


def capelet():
    """Tabung baris-mayor (baris 0 = leher). Ujung bawah sedikit tidak rata."""
    random.seed(9)
    verts, colors = [], []
    for r in range(CAPE_ROWS):
        t = r / (CAPE_ROWS - 1)
        for c in range(CAPE_COLS):
            a = c / CAPE_COLS * math.tau
            y = 1.545 - 0.2 * t * (1 + 0.06 * math.sin(a * 5 + 1) * t)
            rx = 0.105 + 0.22 * t ** 0.7
            rz = 0.1 + 0.15 * t ** 0.7
            fold = 0.008 * math.sin(a * 11) * t
            verts.append([math.sin(a) * (rx + fold), y, -0.035 + math.cos(a) * (rz + fold)])
            v = 0.82 + 0.18 * math.sin(a * 11 + 0.5)
            colors.append([v, v, v, 1.0])
    idx = []
    for r in range(CAPE_ROWS - 1):
        for c in range(CAPE_COLS):
            a, b = r * CAPE_COLS + c, r * CAPE_COLS + (c + 1) % CAPE_COLS
            idx += [a, a + CAPE_COLS, b, b, a + CAPE_COLS, b + CAPE_COLS]
    return verts, normals(verts, idx), colors, idx


if __name__ == '__main__':
    here = Path(sys.argv[0]).resolve().parent
    write_glb(here / 'Hood.glb', 'Hood', *hood(), 'Cloth', [0.3, 0.29, 0.28, 1])
    write_glb(here / 'Capelet.glb', 'Capelet', *capelet(), 'Cloth', [0.3, 0.29, 0.28, 1])
    print('ok', CAPE_COLS, 'x', CAPE_ROWS)
