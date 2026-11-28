"""Aksesori kepala prosedural (buatan sendiri, CC0): halo dan janggut panjang.

Jalankan: python3 make_accessories.py  →  Halo.glb, BeardLong.glb (di folder ini).
Koordinat = ruang model saat rest pose (Y atas, +Z depan, meter); attachment memakai `rest: true` di tulang `Head`.

- Halo: cincin (torus) melayang di atas kepala, condong ke depan 12° supaya dari kamera (sedikit dari atas) terlihat
  sebagai elips, bukan garis.
- Janggut panjang: grid baris-mayor (baris 0 = rahang) berbentuk U yang meruncing ke bawah sampai dada, untuk
  simulasi kain di bake (`cloth` di preset, 2 baris atas dipaku ke rahang). Warna vertex = belang helai rambut.
"""
import json, math, random, struct, sys
from pathlib import Path

random.seed(5)


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
        'asset': {'version': '2.0', 'generator': 'make_accessories.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'material': 0}]}],
        'materials': [{'name': material, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': color, 'metallicFactor': 0, 'roughnessFactor': 0.8}}],
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


def smooth_normals(verts, idx):
    norms = [[0.0, 0.0, 0.0] for _ in verts]
    for i in range(0, len(idx), 3):
        p0, p1, p2 = (verts[idx[i + k]] for k in range(3))
        a = [p1[k] - p0[k] for k in range(3)]
        b = [p2[k] - p0[k] for k in range(3)]
        n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
        for k in range(3):
            for j in range(3):
                norms[idx[i + k]][j] += n[j]
    out = []
    for n in norms:
        l = math.sqrt(sum(x * x for x in n)) or 1
        out.append([x / l for x in n])
    return out


def halo(center=(0.0, 1.91, -0.02), R=0.08, r=0.01, tilt=12, seg=48, tube=10):
    """Torus di sekitar sumbu Y, lalu dicondongkan ke depan (tepi depan turun) `tilt` derajat."""
    ct, st = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    verts, cols, idx = [], [], []
    for i in range(seg):
        u = i / seg * math.tau
        for j in range(tube):
            v = j / tube * math.tau
            x = (R + r * math.cos(v)) * math.cos(u)
            z = (R + r * math.cos(v)) * math.sin(u)
            y = r * math.sin(v)
            # condong: putar di sumbu X, +Z (depan) turun
            y, z = y * ct - z * st, y * st + z * ct
            verts.append([center[0] + x, center[1] + y, center[2] + z])
            cols.append([1.0, 1.0, 1.0, 1.0])
    for i in range(seg):
        for j in range(tube):
            a, b = i * tube + j, ((i + 1) % seg) * tube + j
            c, d = i * tube + (j + 1) % tube, ((i + 1) % seg) * tube + (j + 1) % tube
            idx += [a, b, c, c, b, d]
    return verts, smooth_normals(verts, idx), cols, idx


BEARD_COLS, BEARD_ROWS = 11, 20


def beard(top=(0.0, 1.585, 0.035), bottom=(0.0, 1.17, 0.17), R0=0.085, taper=0.7, open_deg=75):
    """Grid U (terbuka ke belakang) dari rahang ke dada, meruncing. Baris 0 = rahang (dipaku di simulasi)."""
    verts, cols, idx = [], [], []
    strand = [random.uniform(0.6, 1.0) for _ in range(BEARD_COLS)]
    # ujung tidak rata: panjang tiap kolom sedikit beda (tengah paling panjang)
    reach = [1 - 0.18 * abs(k / (BEARD_COLS - 1) * 2 - 1) - random.uniform(0, 0.06) for k in range(BEARD_COLS)]
    for r in range(BEARD_ROWS):
        t = r / (BEARD_ROWS - 1)
        c = [top[k] + (bottom[k] - top[k]) * t for k in range(3)]
        R = R0 * (1 - taper * t ** 1.3)
        for k in range(BEARD_COLS):
            a = math.radians(-open_deg + 2 * open_deg * k / (BEARD_COLS - 1))
            y = top[1] + (bottom[1] - top[1]) * t * reach[k]
            verts.append([c[0] + math.sin(a) * R, y, c[2] + math.cos(a) * R * 0.6])
            # belang helai per kolom + ujung sedikit meredup
            v = strand[k] * (0.75 if k % 2 else 1.0) * (1 - 0.3 * t)
            cols.append([v, v, v, 1.0])
    for r in range(BEARD_ROWS - 1):
        for k in range(BEARD_COLS - 1):
            a, b = r * BEARD_COLS + k, r * BEARD_COLS + k + 1
            c, d = a + BEARD_COLS, b + BEARD_COLS
            idx += [a, c, b, b, c, d]
    return verts, smooth_normals(verts, idx), cols, idx


if __name__ == '__main__':
    here = Path(sys.argv[0]).resolve().parent
    write_glb(here / 'Halo.glb', 'Halo', *halo(), 'Gold', [0.9, 0.8, 0.5, 1])
    write_glb(here / 'BeardLong.glb', 'BeardLong', *beard(), 'Hair', [0.5, 0.5, 0.5, 1])
    print('ok', BEARD_COLS, 'x', BEARD_ROWS)
