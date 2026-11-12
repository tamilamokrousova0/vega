#!/usr/bin/env python3
"""Уменьшает текстуры внутри GLB (PNG → JPEG, сторона не больше N) и убирает ненужные анимации.
   python3 tools/shrink_glb.py вход.glb выход.glb [--size 1024] [--keep Клип1,Клип2]
   Текстуры с прозрачностью (материал не OPAQUE) остаются PNG. Нужен macOS (утилита sips)."""
import json, struct, sys, os, subprocess, tempfile

def main():
    a = sys.argv[1:]; src, dst = a[0], a[1]
    size = int(a[a.index('--size') + 1]) if '--size' in a else 1024
    keep = set(a[a.index('--keep') + 1].split(',')) if '--keep' in a else None
    d = open(src, 'rb').read(); jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl]); bin0 = d[20 + jl + 8:]
    V = j['bufferViews']
    if keep is not None: j['animations'] = [x for x in j.get('animations', []) if x.get('name') in keep]
    alpha = set()
    for m in j.get('materials', []):
        if m.get('alphaMode', 'OPAQUE') != 'OPAQUE':
            t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
            if t is not None: alpha.add(j['textures'][t['index']].get('source'))
    used = set()
    for an in j.get('animations', []):
        for s in an['samplers']: used |= {s['input'], s['output']}
    for me in j.get('meshes', []):
        for pr in me['primitives']:
            used |= set(pr['attributes'].values())
            if 'indices' in pr: used.add(pr['indices'])
            for t in pr.get('targets', []): used |= set(t.values())
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
    A = j['accessors']
    views = {A[i]['bufferView'] for i in used if 'bufferView' in A[i]}
    blobs = {}
    tmp = tempfile.mkdtemp()
    for n, im in enumerate(j.get('images', [])):
        if 'bufferView' not in im: continue
        v = V[im['bufferView']]; raw = bin0[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        ext = 'png' if im.get('mimeType') == 'image/png' else 'jpg'
        p = os.path.join(tmp, f'{n}.{ext}'); open(p, 'wb').write(raw)
        if n in alpha:
            q = os.path.join(tmp, f'{n}_o.png'); subprocess.run(['sips', '-Z', str(size), p, '--out', q], capture_output=True)
            mime = 'image/png'
        else:
            q = os.path.join(tmp, f'{n}_o.jpg'); subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '-Z', str(size), p, '--out', q], capture_output=True)
            mime = 'image/jpeg'
        new = open(q, 'rb').read() if os.path.exists(q) else raw
        if len(new) < len(raw): raw = new; im['mimeType'] = mime
        blobs[im['bufferView']] = raw; views.add(im['bufferView'])
    order = sorted(views); vm = {o: i for i, o in enumerate(order)}
    out = bytearray(); newV = []
    for o in order:
        v = dict(V[o]); off = v.get('byteOffset', 0)
        chunk = blobs.get(o, bin0[off:off + v['byteLength']])
        while len(out) % 4: out.append(0)
        v['byteOffset'] = len(out); v['byteLength'] = len(chunk); v['buffer'] = 0; out += chunk; newV.append(v)
    am = {}; newA = []
    for i, acc in enumerate(A):
        if i not in used: continue
        acc = dict(acc)
        if 'bufferView' in acc: acc['bufferView'] = vm[acc['bufferView']]
        am[i] = len(newA); newA.append(acc)
    for an in j.get('animations', []):
        for s in an['samplers']: s['input'] = am[s['input']]; s['output'] = am[s['output']]
    for me in j.get('meshes', []):
        for pr in me['primitives']:
            pr['attributes'] = {k: am[x] for k, x in pr['attributes'].items()}
            if 'indices' in pr: pr['indices'] = am[pr['indices']]
            if 'targets' in pr: pr['targets'] = [{k: am[x] for k, x in t.items()} for t in pr['targets']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = am[s['inverseBindMatrices']]
    for im in j.get('images', []):
        if 'bufferView' in im: im['bufferView'] = vm[im['bufferView']]
    while len(out) % 4: out.append(0)
    j['accessors'] = newA; j['bufferViews'] = newV; j['buffers'] = [{'byteLength': len(out)}]
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(out)))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(out), b'BIN\0')); f.write(out)
    print(dst, len(d), '→', 28 + len(js) + len(out))
main()
