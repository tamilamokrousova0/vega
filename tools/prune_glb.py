#!/usr/bin/env python3
"""Оставляет в GLB только нужные анимации (и, по желанию, убирает сетку).
   python3 tools/prune_glb.py вход.glb выход.glb [--no-mesh] Клип1 Клип2 ..."""
import json, struct, sys

def main():
    args = sys.argv[1:]
    no_mesh = '--no-mesh' in args
    args = [a for a in args if a != '--no-mesh']
    src, dst, keep = args[0], args[1], set(args[2:])
    d = open(src, 'rb').read()
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    bin0 = d[20 + jl + 8:]
    nodes = j['nodes']
    anims = []
    for a in j.get('animations', []):
        if a['name'] not in keep: continue
        ch = []
        for c in a['channels']:
            p = c['target']['path']
            # игре нужны только повороты и смещение таза
            if p == 'rotation' or (p == 'translation' and nodes[c['target']['node']].get('name') in ('pelvis', 'root')):
                ch.append(c)
        used = sorted({c['sampler'] for c in ch}); m = {s: i for i, s in enumerate(used)}
        for c in ch: c['sampler'] = m[c['sampler']]
        a['channels'] = ch; a['samplers'] = [a['samplers'][s] for s in used]
        anims.append(a)
    missing = keep - {a['name'] for a in anims}
    j['animations'] = anims
    if no_mesh:
        for n in nodes: n.pop('mesh', None); n.pop('skin', None)
        for k in ('meshes', 'skins', 'materials', 'textures', 'images', 'samplers'): j.pop(k, None)
    # какие accessor'ы остались нужны
    acc = set()
    for a in anims:
        for s in a['samplers']: acc |= {s['input'], s['output']}
    for me in j.get('meshes', []):
        for pr in me['primitives']:
            acc |= set(pr['attributes'].values())
            if 'indices' in pr: acc.add(pr['indices'])
            for t in pr.get('targets', []): acc |= set(t.values())
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: acc.add(s['inverseBindMatrices'])
    acc = sorted(acc); am = {o: i for i, o in enumerate(acc)}
    A, V = j['accessors'], j['bufferViews']
    vs = sorted({A[i]['bufferView'] for i in acc} | {im['bufferView'] for im in j.get('images', []) if 'bufferView' in im})
    vm = {o: i for i, o in enumerate(vs)}
    out = bytearray(); newV = []
    for o in vs:
        v = dict(V[o]); off = v.get('byteOffset', 0)
        while len(out) % 4: out.append(0)
        chunk = bin0[off:off + v['byteLength']]
        v['byteOffset'] = len(out); v['buffer'] = 0; out += chunk; newV.append(v)
    newA = []
    for o in acc:
        a = dict(A[o]); a['bufferView'] = vm[a['bufferView']]; newA.append(a)
    for a in anims:
        for s in a['samplers']: s['input'] = am[s['input']]; s['output'] = am[s['output']]
    for me in j.get('meshes', []):
        for pr in me['primitives']:
            pr['attributes'] = {k: am[v] for k, v in pr['attributes'].items()}
            if 'indices' in pr: pr['indices'] = am[pr['indices']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = am[s['inverseBindMatrices']]
    for im in j.get('images', []):
        if 'bufferView' in im: im['bufferView'] = vm[im['bufferView']]
    while len(out) % 4: out.append(0)
    j['accessors'] = newA; j['bufferViews'] = newV; j['buffers'] = [{'byteLength': len(out)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(out), b'BIN\0')); f.write(out)
    print(dst, total, 'байт; клипы:', [a['name'] for a in anims], '; не найдены:', sorted(missing))

main()
