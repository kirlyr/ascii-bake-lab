"""Zirah dada ramping (lean cuirass) prosedural (buatan sendiri, CC0) untuk slot chest.

Jalankan: python3 make_cuirass.py  →  CuirassLean.glb (dada, tulang spine_03), FauldLean.glb (lame perut, spine_01).
Koordinat = ruang model saat rest pose (Y atas, +Z depan, meter); attachment `rest: true`.
Penampang mengikuti badan Superhero_Male (diukur dari mesh, ditambah 3 cm), bukan kotak besar seperti zirah
Ultimate RPG Pack: lubang lengan dalam, leher rendah, rusuk tengah (medial ridge) tipis, 3 lame perut bertumpuk.
"""
import json, math, struct, sys
from pathlib import Path

# y → (setengah lebar X, depan Z, belakang Z) badan, diukur dari mesh rest pose.
PROFILE = [(0.98, 0.165, 0.094, -0.125), (1.08, 0.152, 0.104, -0.108), (1.18, 0.142, 0.106, -0.098),
           (1.28, 0.16, 0.124, -0.14), (1.38, 0.172, 0.12, -0.16), (1.5, 0.15, 0.07, -0.15)]
OFF = 0.032


def section(y):
    for (y0, *a), (y1, *b) in zip(PROFILE, PROFILE[1:]):
        if y <= y1:
            t = max(0.0, (y - y0) / (y1 - y0))
            return [a[k] + (b[k] - a[k]) * t for k in range(3)]
    return PROFILE[-1][1:]


def shell(y0, top, rows, cols=48, lames=0, ridge=0.0, flare=0.0):
    """Cangkang mengelilingi badan dari y0 ke tepi atas top(a) (a = sudut, 0 = depan)."""
    verts, idx = [], []
    for r in range(rows + 1):
        t = r / rows
        for c in range(cols):
            a = c / cols * math.tau
            yt = top(a)
            y = y0 + (yt - y0) * t
            hx, zf, zb = section(y)
            cz, hz = (zf + zb) / 2, (zf - zb) / 2
            band = lames and (t * lames) % 1.0
            grow = OFF + (0.008 * band if lames else 0.0) + flare * (1 - t)
            # superellipse n=2.4: sedikit kotak seperti badan, bukan tabung bulat
            sa, ca = math.sin(a), math.cos(a)
            sx = math.copysign(abs(sa) ** (2 / 2.4), sa)
            sz = math.copysign(abs(ca) ** (2 / 2.4), ca)
            x = sx * (hx + grow)
            z = cz + sz * (hz + grow) + ridge * math.exp(-((a if a < math.pi else a - math.tau) / 0.22) ** 2)
            verts.append([x, y, z])
    for r in range(rows):
        for c in range(cols):
            a, b = r * cols + c, r * cols + (c + 1) % cols
            idx += [a, b, a + cols, b, b + cols, a + cols]
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


def write_glb(path, name, verts, norms, idx, color):
    bin_ = bytearray()
    views, accessors = [], []
    for data, fmt, target, comp, typ in ((verts, 'f', 34962, 5126, 'VEC3'), (norms, 'f', 34962, 5126, 'VEC3'), (idx, 'I', 34963, 5125, 'SCALAR')):
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
        'asset': {'version': '2.0', 'generator': 'make_cuirass.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
        'materials': [{'name': 'Plate', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': color, 'metallicFactor': 0, 'roughnessFactor': 0.9}}],
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


def breast_top(a):
    # lubang lengan di samping (sin² besar), leher lebih rendah di depan daripada di belakang
    front = max(0.0, math.cos(a)) ** 6
    back = max(0.0, -math.cos(a)) ** 6
    return 1.52 - 0.12 * math.sin(a) ** 2 - 0.03 * front - 0.01 * back


if __name__ == '__main__':
    here = Path(sys.argv[0]).resolve().parent
    grey = [0.45, 0.45, 0.47, 1]  # besi gelap; warna akhir dari pewarna part `armor`
    write_glb(here / 'CuirassLean.glb', 'CuirassLean', *shell(1.08, breast_top, 22, ridge=0.01), grey)
    # 3 lame perut, tepi bawah sedikit melebar menutup pinggul. Tumpang tindih dengan dada (1,08–1,22) supaya
    # tidak ada celah saat punggung membungkuk di pose idle/walk.
    write_glb(here / 'FauldLean.glb', 'FauldLean', *shell(0.96, lambda a: 1.22, 10, lames=3, flare=0.014), grey)
    print('ok')
