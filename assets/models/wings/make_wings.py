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


def bend(p):
    """Sayap melengkung sedikit mengikuti punggung (volume dari samping), dirapatkan 15% ke tulang belakang.
    Lengkung dibatasi 5 cm: lebih dari itu tepi luar sayap maju menembus lengan yang tergantung di sisi badan."""
    ax = abs(p[0])
    return [p[0] * 0.85, p[1], p[2] + 0.05 * max(0.0, (ax - 0.07) / 0.22) ** 1.6]


def feather(root, tip, width, out, ragged=False, seg=12, twist=0.0, curve=True):
    """Helai bulu dari root ke tip. out = arah ke luar permukaan (menjauhi badan).
    Return (verts, norms, idx, material, colors). Warna vertex = gradasi terang-gelap (bukan warna akhir: warna
    dari pewarna part `feather` di runtime, gradasi ini masuk ke shade level lewat `albedo` bake):
    pangkal gelap, tengah terang, ujung meredup, tulang bulu lebih terang, belang serat tipis, tiap helai beda nada.
    Tepi helai melengkung ke arah badan (cekung) supaya cahaya jatuh berbeda di kiri-kanan tulang bulu."""
    if curve:
        root, tip = bend(root), bend(tip)
    d = [tip[k] - root[k] for k in range(3)]
    side = norm(cross(d, out))
    # Miring seperti genteng: tepi luar helai terangkat, jadi tiap helai punya sisi terang dan bayangan sendiri.
    tc, ts = math.cos(math.radians(twist)), math.sin(math.radians(twist))
    tone = random.uniform(0.6, 1.05)
    verts, cols, idx = [], [], []
    for i in range(seg + 1):
        t = i / seg
        c = lerp3(root, tip, t)
        w = width * math.sin(math.pi * min(1.0, 0.15 + t) / 1.15) * (1 - t ** 3)  # melebar lalu meruncing
        if ragged and 0.55 < t < 0.95 and i % 2:
            w *= 0.45  # gerigi: bulu robek
        lift = 0.006 * (1 - t)
        along = 0.2 + 0.8 * math.sin(math.pi * min(1.0, t / 0.7) / 2) - 0.45 * max(0.0, t - 0.7) / 0.3
        stripe = 0.12 if i % 2 else -0.1
        for s in (-1, 0, 1):
            cup = -0.012 * (w / width) if s else lift
            p = [c[k] + side[k] * w * s * tc + out[k] * (cup + w * s * ts) for k in range(3)]
            verts.append(p)
            v = max(0.08, min(1.0, tone * (along + stripe) * (1.2 if s == 0 else 0.75)))
            cols.append([v, v, v, 1.0])
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
    return verts, [norm(n) for n in norms], idx, 'Feather', cols


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
    S, E, W, H = (bend(p) for p in (S, E, W, H))
    parts = [(*bone(S, E, 0.022), 'Bone'), (*bone(E, W, 0.018), 'Bone'), (*bone(W, H, 0.015), 'Bone')]
    tw = 24 * s
    # Primer: dari tangan (W→H) jatuh ke betis, sedikit melebar ke luar di bawah.
    for i in range(14):
        t = i / 13
        r = lerp3(W, H, t)
        r[2] += 0.02 + 0.003 * i  # primer paling dalam
        length = random.uniform(1.1, 1.22) - 0.15 * t
        tip = [r[0] + s * (-0.02 + 0.04 * t), r[1] - length, r[2] - 0.03 + 0.02 * t]
        parts.append(feather(r, tip, 0.06, out, ragged=random.random() < 0.4, twist=tw))
    # Sekunder: dari lengan bawah (E→W), lebih pendek, menutupi pangkal primer.
    for i in range(14):
        t = i / 13
        r = lerp3(E, W, t)
        r[2] -= 0.035
        length = random.uniform(0.62, 0.75) * (0.8 + 0.35 * t)
        tip = [r[0] - s * 0.05 * (1 - t), r[1] - length, r[2] - 0.03]
        parts.append(feather(r, tip, 0.065, out, ragged=random.random() < 0.35, twist=tw))
    # Bulu penutup: dua baris pendek di atas, paling luar.
    for row, (ln, dz) in enumerate(((0.26, -0.07), (0.15, -0.095))):
        for i in range(11):
            t = i / 10
            r = lerp3(S, W, t) if row else lerp3(E, W, t)
            r = [r[0], r[1] + 0.02, r[2] + dz]
            tip = [r[0], r[1] - ln * random.uniform(0.85, 1.1), r[2] - 0.015]
            parts.append(feather(r, tip, 0.05, out, twist=tw))
    # Bulu bahu (skapular) dari S ke E.
    for i in range(6):
        r = lerp3(S, E, i / 5)
        r[2] -= 0.05
        tip = [r[0], r[1] - 0.32, r[2] - 0.02]
        parts.append(feather(r, tip, 0.05, out, twist=tw))
    return parts


def spread_wing(s, skel, fan, prim_len, sec_len, keep=1.0, ragged=0.0, shrink=1.0, bone_r=1.0, wide=1.0, sweep=0.05, n=13):
    """Sayap terbuka/terkulai: tulang S→E→W→H, primer mengipas dari W→H, sekunder tergantung dari E→W.
    fan = (sudut primer pertama, terakhir) dalam derajat dari horizontal ke luar (+ = ke atas).
    keep = peluang tiap bulu tetap ada (bulu rontok), ragged = peluang bulu robek, shrink = skala panjang bulu
    (bulu patah), wide = skala lebar helai, sweep = ujung bulu condong ke belakang (volume dari samping).
    Tidak memakai `bend`: sayap terbuka berada di belakang dan di atas lengan."""
    X = lambda p: [p[0] * s, p[1], p[2]]
    S, E, W, H = (X(p) for p in skel)
    out = [0, 0, -1]
    parts = [(*bone(S, E, 0.022 * bone_r), 'Bone'), (*bone(E, W, 0.018 * bone_r), 'Bone'), (*bone(W, H, 0.015 * bone_r), 'Bone')]
    tw = 20 * s
    f = lambda r, tip, w, rag=False: feather(r, tip, w * wide, out, ragged=rag or random.random() < ragged, twist=tw, curve=False)
    def tip_at(r, length, a, back=sweep):
        a = math.radians(a)
        return [r[0] + s * length * math.cos(a), r[1] + length * math.sin(a), r[2] - back * length]
    # Primer: paling panjang, mengipas. Pangkal paling dalam (z lebih depan) supaya tertutup sekunder/penutup.
    for i in range(n):
        t = i / (n - 1)
        if random.random() > keep:
            continue
        r = lerp3(W, H, t)
        r[2] += 0.02 + 0.002 * i
        a = fan[0] + (fan[1] - fan[0]) * t + random.uniform(-3, 3)
        length = prim_len * (0.8 + 0.25 * math.sin(math.pi * min(1.0, t * 1.2))) * random.uniform(0.94, 1.04)
        length *= shrink if random.random() < 0.5 else 1.0
        parts.append(f(r, tip_at(r, length, a), 0.065))
    # Sekunder: dari lengan bawah, tergantung ke bawah sedikit ke luar.
    for i in range(14):
        t = i / 13
        if random.random() > keep:
            continue
        r = lerp3(E, W, t)
        r[2] -= 0.03
        length = sec_len * (0.85 + 0.2 * t) * random.uniform(0.92, 1.05)
        length *= shrink if random.random() < 0.5 else 1.0
        parts.append(f(r, tip_at(r, length, fan[0] - 8 + 6 * t), 0.07))
    # Bulu penutup: dua baris lebih pendek di atas sekunder/primer, paling luar.
    for row, (frac, dz) in enumerate(((0.42, -0.06), (0.24, -0.085))):
        for i in range(12):
            t = i / 11
            if random.random() > keep:
                continue
            r = lerp3(S, W, t) if row else lerp3(E, H, t)
            r = [r[0], r[1] + 0.015, r[2] + dz]
            a = (fan[0] - 4 + (fan[1] - fan[0]) * 0.35 * t) if not row else fan[0] - 2
            parts.append(f(r, tip_at(r, sec_len * frac * random.uniform(0.85, 1.1), a, sweep * 0.4), 0.055))
    # Skapular: dari bahu ke siku, menutup pangkal di punggung.
    for i in range(6):
        if random.random() > keep:
            continue
        r = lerp3(S, E, i / 5)
        r[2] -= 0.05
        parts.append(f(r, [r[0], r[1] - sec_len * 0.45, r[2] - 0.02], 0.05))
    return parts


def write_glb(path, parts, colors):
    mats = sorted({p[3] for p in parts})
    bin_ = bytearray()
    accessors, views, prims = [], [], []
    for mi, mat in enumerate(mats):
        V, N, I, C = [], [], [], []
        for v, n, idx, m, *col in parts:
            if m != mat:
                continue
            off = len(V)
            V += v
            N += n
            C += col[0] if col else [[1.0, 1.0, 1.0, 1.0]] * len(v)
            I += [off + x for x in idx]
        for data, fmt, target, comp, typ in ((V, 'f', 34962, 5126, 'VEC3'), (N, 'f', 34962, 5126, 'VEC3'), (C, 'f', 34962, 5126, 'VEC4'), (I, 'I', 34963, 5125, 'SCALAR')):
            flat = [x for row in data for x in row] if typ != 'SCALAR' else data
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
        a0 = len(accessors) - 4
        prims.append({'attributes': {'POSITION': a0, 'NORMAL': a0 + 1, 'COLOR_0': a0 + 2}, 'indices': a0 + 3, 'material': mi})
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
    colors = {'Feather': [0.5, 0.49, 0.46, 1], 'Bone': [0.4, 0.38, 0.35, 1]}
    parts = wing(1) + wing(-1)
    write_glb(here / 'Wings.glb', parts, colors)
    print('Wings', len(parts), 'pieces')
    # Sayap malaikat: terbuka setengah dan terangkat (mekar), ujung primer menjulang di atas kepala.
    random.seed(11)
    # Rentang ±0,85 m: lebih lebar dari itu, sayap terpotong di panggung Tavern saat dilihat dari depan.
    up = ([0.08, 1.4, -0.15], [0.22, 1.6, -0.3], [0.32, 1.78, -0.42], [0.39, 1.84, -0.48])
    angel = dict(fan=(-86, 34), prim_len=0.52, sec_len=0.64, wide=1.3, sweep=0.26, n=17)
    parts = spread_wing(1, up, **angel) + spread_wing(-1, up, **angel)
    write_glb(here / 'WingsAngel.glb', parts, colors)
    print('WingsAngel', len(parts), 'pieces')
    # Sayap rusak: kiri layu (terkulai, banyak bulu robek), kanan patah di pergelangan (bulu rontok dan patah).
    random.seed(13)
    limp = ([0.08, 1.4, -0.15], [0.22, 1.38, -0.26], [0.34, 1.14, -0.31], [0.37, 1.02, -0.32])
    snapped = ([0.08, 1.4, -0.15], [0.34, 1.66, -0.3], [0.31, 1.3, -0.46], [0.3, 1.16, -0.48])  # siku mencuat, tangan patah ke bawah
    parts = spread_wing(1, limp, (-100, -62), 0.6, 0.5, keep=0.8, ragged=0.75, shrink=0.75)
    parts += spread_wing(-1, snapped, (-95, -40), 0.58, 0.5, keep=0.35, ragged=0.9, shrink=0.55, bone_r=1.5)
    write_glb(here / 'WingsBroken.glb', parts, colors)
    print('WingsBroken', len(parts), 'pieces')
