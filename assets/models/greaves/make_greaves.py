"""Pelat kaki + sepatu besi prosedural (aset buatan sendiri, CC0) untuk slot legs dan feet.

Jalankan: python3 make_greaves.py  →  6 file .glb (di folder ini).
Koordinat = ruang model saat rest pose (Y atas, +Z depan, meter, kaki kiri di +X). Attachment memakai `rest: true`,
jadi bake tool memindahkan mesh ini ke ruang lokal tulangnya sendiri. Tiap potongan kaku, ikut satu tulang:
- Thigh_<s>: pelat paha (setengah tabung depan, 3 lame) → thigh_<s>
- Greave_<s>: tempurung lutut + pelindung tulang kering (tabung penuh) → calf_<s>
- Sabaton_<s>: sepatu besi berlapis, mengikuti profil kaki → foot_<s> (SabatonToe_<s>: bagian jari → ball_<s>); Ankle_<s>: kerah pergelangan → calf_<s>
- SabatonLean_<s> (bot kulit + tutup jari besi) → foot_<s>; BootLean_<s>: batang bot sampai bawah lutut → calf_<s>
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


# Profil kaki badan UBC (kaki kanan, |x|), diukur dari vertex ber-bobot foot/ball: per z (tumit → jari)
# pusat x, setengah lebar, tinggi punggung kaki. Sepatu dibangun mengikuti profil ini supaya tidak menggembung.
FOOT_Z = [-0.155, -0.13, -0.11, -0.09, -0.07, -0.05, -0.03, -0.01, 0.01, 0.03, 0.05, 0.07, 0.09, 0.11, 0.13, 0.145]
FOOT_CX = [0.12, 0.122, 0.122, 0.12, 0.121, 0.126, 0.13, 0.132, 0.134, 0.134, 0.132, 0.131, 0.124, 0.118, 0.115, 0.113]
FOOT_HW = [0.02, 0.031, 0.034, 0.037, 0.039, 0.04, 0.044, 0.048, 0.049, 0.052, 0.054, 0.053, 0.045, 0.036, 0.028, 0.014]
FOOT_TOP = [0.1, 0.105, 0.105, 0.105, 0.104, 0.1, 0.085, 0.075, 0.064, 0.056, 0.048, 0.04, 0.034, 0.03, 0.026, 0.018]
# Pergelangan + betis bawah (elips): y, pusat |x|, pusat z, setengah lebar x, setengah lebar z.
ANKLE = [(0.05, 0.12, -0.08, 0.034, 0.05), (0.09, 0.1215, -0.081, 0.032, 0.048), (0.12, 0.1225, -0.0845, 0.031, 0.045),
         (0.15, 0.1275, -0.087, 0.031, 0.046), (0.21, 0.1285, -0.088, 0.036, 0.05), (0.24, 0.1295, -0.0865, 0.043, 0.055),
         (0.27, 0.129, -0.085, 0.05, 0.06), (0.33, 0.127, -0.0855, 0.059, 0.069),
         (0.38, 0.1255, -0.083, 0.065, 0.078), (0.44, 0.1255, -0.075, 0.062, 0.075)]


def interp(xs, ys, x):
    if x <= xs[0]:
        return ys[0]
    for i in range(1, len(xs)):
        if x <= xs[i]:
            return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]))
    return ys[-1]


def shoe(s, z0, z1, margin, toe=0.145, point=0.0, lames=0, rise=0.0, part=None, rows=24, cols=24):
    """Cangkang sepatu dari tumit z0 ke ujung z1, mengikuti profil kaki + `margin`. `toe` = ujung jari asli;
    lewat itu (sampai z1) cangkang meruncing ke titik (`point` = sisa setengah lebar di ujung, 0 = lancip).
    `rise` = tinggi cangkang di tumit (menutup pangkal pergelangan). `part` = (za, zb): hanya potongan itu
    (belakang ikut tulang foot, depan ikut tulang ball supaya jari yang menekuk tetap tertutup)."""
    za, zb = part or (z0, z1)

    def pt(t, u):
        z = lerp(max(z0, za), min(z1, zb), t)
        zf = min(z, toe)
        cx = interp(FOOT_Z, FOOT_CX, zf)
        hw = interp(FOOT_Z, FOOT_HW, zf)
        top = interp(FOOT_Z, FOOT_TOP, zf)
        if z > toe:  # moncong lancip melewati jari
            k = (z - toe) / max(1e-6, z1 - toe)
            hw = lerp(hw + margin, point, k ** 0.8) - margin
            top = lerp(top + margin, 0.012, k) - margin
        if z < -0.1:  # tumit membulat ke belakang
            k = min(1.0, (-0.1 - z) / (-0.1 - z0))
            hw *= math.sqrt(max(0.0, 1 - k ** 2)) * 0.6 + 0.4
        top += rise * max(0.0, 1 - (z - z0) / 0.12)
        lame = sawtooth((z + 0.07) / 0.18, lames, 0.005) if lames and -0.07 < z < 0.11 else 0.0
        a = (u - 0.5) * math.pi * 1.25  # dinding melengkung sedikit ke bawah sol
        # 1,5 cm paling belakang/depan dirapatkan supaya cangkang tertutup (jari tidak menyembul).
        close = min(1.0, (z - z0) / 0.015) ** 0.5 * min(1.0, (z1 - z) / 0.015) ** 0.5
        w = (hw + margin + lame) * (0.2 + 0.8 * close)
        # Punggung kaki memuai saat pergelangan/jari menekuk (vertex berbobot campuran), jadi atasnya diberi ruang lebih.
        instep = 0.014 * max(0.0, 1 - abs(z - 0.03) / 0.1)
        h = (top + margin + instep + lame) * (0.3 + 0.7 * close)
        return [s * cx + math.sin(a) * w, max(0.0, math.cos(a)) * h - 0.004, z]

    return surface(rows, cols, pt)


def cuff(s, y0, y1, margin, flare=0.0, arc=360, lames=0, rows=12, cols=28):
    """Tabung elips mengikuti pergelangan/betis bawah dari y0 ke y1, + `margin`; `flare` = bibir atas melebar."""

    def pt(t, u):
        y = lerp(y0, y1, t)
        ys = [a[0] for a in ANKLE]
        cx, cz, rx, rz = (interp(ys, [a[k] for a in ANKLE], y) for k in range(1, 5))
        m = margin + flare * max(0.0, (t - 0.75) / 0.25) ** 2 + sawtooth(t, lames, 0.006)
        a = math.radians((u - 0.5) * arc)
        return [s * cx + math.sin(a) * (rx + m) * s, y, cz + math.cos(a) * (rz + m)]

    return surface(rows, cols, pt)


BALL = 0.055  # sendi pangkal jari (tulang ball) di sumbu z; potongan depan dan belakang bertumpuk 4 cm di sekitarnya
REAR, FRONT = (-1.0, BALL + 0.02), (BALL - 0.02, 1.0)


def sabaton(s, part=REAR):
    """Iron Sabatons: sepatu besi gothic berlapis (6 lame di punggung kaki), moncong lancip, mengikuti bentuk kaki."""
    return [(*shoe(s, -0.165, 0.19, 0.012, point=0.0, lames=6, rise=0.02, part=part), 'Plate')]


def ankle_guard(s):
    """Kerah pergelangan Iron Sabatons (ikut tulang betis supaya tidak menembus saat pergelangan menekuk)."""
    return [(*cuff(s, 0.075, 0.185, 0.012, flare=0.008, lames=2), 'Plate')]


def duelist_shoe(s, part=REAR):
    """Duelist Sabatons: sepatu bot kulit ramping + tutup jari dan pelat punggung kaki dari besi."""
    leather = shoe(s, -0.165, 0.162, 0.0105, point=0.03, rise=0.03, part=part)
    out = [(*leather, 'Leather')]
    if part == FRONT:
        out.append((*shoe(s, 0.02, 0.168, 0.013, point=0.034, part=part), 'Plate'))
    return out


def duelist_shaft(s):
    """Batang bot kulit sampai bawah lutut (ikut tulang betis), dengan sabuk besi tipis di pergelangan."""
    return [(*cuff(s, 0.07, 0.42, 0.008, flare=0.01, rows=18), 'Leather'), (*cuff(s, 0.1, 0.13, 0.011, rows=2), 'Plate')]


def thigh_lean(s):
    """Versi ramping: satu pelat mulus tanpa lame, hanya sisi depan (dari samping tidak melebar)."""
    x = LEG_X * s
    return [(*tube(x, LEG_Z, 0.88, 0.58, lambda t: lerp(0.121, 0.111, t), 170), 'Plate')]


def greave_lean(s):
    """Lutut kecil + pelindung tulang kering terbuka di belakang (betis tidak dibungkus penuh)."""
    x = LEG_X * s
    calf = lambda t: 0.068 + 0.01 * math.sin(min(t / 0.35, 1) * math.pi / 2) - 0.028 * max(0, (t - 0.35) / 0.65) ** 1.2
    knee = tube(x, LEG_Z, 0.58, 0.49, lambda t: 0.092 - 0.025 * (2 * t - 1) ** 2, 130, forward=0.008, rows=8)
    shin = tube(x, lambda t: lerp(LEG_Z - 0.012, -0.088, t), 0.5, 0.15, calf, 210)
    return [(*knee, 'Plate'), (*shin, 'Plate')]


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
    colors = {'Plate': [0.62, 0.62, 0.64, 1], 'Leather': [0.4, 0.27, 0.16, 1]}
    for s, side in ((1, 'L'), (-1, 'R')):
        for name, fn in (('Thigh', thigh), ('Greave', greave), ('Sabaton', sabaton), ('SabatonToe', lambda s: sabaton(s, FRONT)), ('Ankle', ankle_guard)):
            write_glb(here / f'{name}_{side}.glb', fn(s), colors, f'{name}_{side}')
        # Set ramping (lean): pelat lebih tipis menempel; kaki = bot kulit ramping dengan tutup jari besi.
        for name, fn in (('ThighLean', thigh_lean), ('GreaveLean', greave_lean), ('SabatonLean', duelist_shoe), ('SabatonLeanToe', lambda s: duelist_shoe(s, FRONT)), ('BootLean', duelist_shaft)):
            write_glb(here / f'{name}_{side}.glb', fn(s), colors, f'{name}_{side}')
    print('ok')
