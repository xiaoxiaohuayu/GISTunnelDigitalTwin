"""Compress only embedded terrain textures, preserving geometry and instances.
Requires cwebp and Pillow. Never use a scene optimizer that drops instancing.
python3 scripts/compress-portal-terrain.py --source SOURCE --output OUTPUT
"""
import argparse
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]

def read_glb(path):
    raw = path.read_bytes()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 4)[0] == 2
    length = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+length]), raw[28+length:]

def view_bytes(doc, binary, index):
    view = doc['bufferViews'][index]
    start = view.get('byteOffset', 0)
    return binary[start:start+view['byteLength']]

def compress(source, output, report_path):
    assert source.resolve() != output.resolve(), 'Keep the complete source untouched'
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    doc, binary = read_glb(source)
    original = copy.deepcopy(doc)
    instances = sum(doc['accessors'][next(iter(n['extensions']['EXT_mesh_gpu_instancing']['attributes'].values()))]['count']
                    for n in doc['nodes'] if 'EXT_mesh_gpu_instancing' in n.get('extensions', {}))
    assert instances > 0, 'The input must contain the complete instanced landscape'
    replacements, images = {}, []
    with tempfile.TemporaryDirectory(prefix='terrain-textures-') as directory:
        for index, image in enumerate(doc['images']):
            view = image['bufferView']
            raw = view_bytes(doc, binary, view)
            before = Image.open(io.BytesIO(raw)).convert('RGBA')
            if image['mimeType'] == 'image/webp':
                replacements[view] = raw
                images.append({'name': image.get('name', str(index)), 'dimensions': list(before.size),
                    'beforeBytes': len(raw), 'afterBytes': len(raw), 'alphaUnchanged': True, 'reused': True})
                continue
            name = image.get('name', str(index))
            if 'normal' in name.lower():
                options = ['-lossless', '-near_lossless', '80', '-m', '6']
            elif 'roughness' in name.lower():
                options = ['-lossless', '-m', '6']
            else:
                options = ['-q', '90', '-m', '6', '-sharp_yuv']
            incoming, outgoing = Path(directory)/f'{index}.png', Path(directory)/f'{index}.webp'
            # Decode to PNG without resizing; cwebp preserves the alpha channel losslessly.
            before.save(incoming)
            subprocess.run(['cwebp', '-quiet', *options, '-exact', '-alpha_q', '100', str(incoming), '-o', str(outgoing)], check=True)
            encoded = outgoing.read_bytes()
            after = Image.open(io.BytesIO(encoded)).convert('RGBA')
            assert before.size == after.size
            assert before.getchannel('A').tobytes() == after.getchannel('A').tobytes(), name
            difference = ImageChops.difference(before.convert('RGB'), after.convert('RGB'))
            mse = sum(n*n for n in ImageStat.Stat(difference).rms)/3
            images.append({'name': name, 'dimensions': list(before.size), 'beforeBytes': len(raw),
                'afterBytes': len(encoded), 'alphaUnchanged': True,
                'rgbPSNR': round(10*math.log10(255*255/mse), 2) if mse else None, 'options': options})
            assert view not in replacements
            replacements[view] = encoded
            image['mimeType'] = 'image/webp'
            print(name, len(raw), '->', len(encoded), flush=True)
    # Repack buffer views without changing their indices or any non-image bytes.
    packed = bytearray()
    for index, view in enumerate(doc['bufferViews']):
        data = replacements.get(index, view_bytes(original, binary, index))
        packed.extend(b'\0'*(-len(packed)%4))
        view.update(byteOffset=len(packed), byteLength=len(data))
        packed.extend(data)
    packed.extend(b'\0'*(-len(packed)%4))
    doc['buffers'][0]['byteLength'] = len(packed)
    for texture in doc['textures']:
        if 'source' in texture:
            texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
    for field in ['extensionsUsed', 'extensionsRequired']:
        if 'EXT_texture_webp' not in doc.setdefault(field, []): doc[field].append('EXT_texture_webp')
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    encoded += b' '*(-len(encoded)%4)
    data = (struct.pack('<4sII', b'glTF', 2, 28+len(encoded)+len(packed))
            + struct.pack('<I4s', len(encoded), b'JSON') + encoded
            + struct.pack('<I4s', len(packed), b'BIN\0') + packed)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    result, result_binary = read_glb(output)
    for key in ['nodes', 'scenes', 'scene', 'meshes', 'accessors', 'materials', 'samplers']:
        assert original.get(key) == result.get(key), key
    for index in range(len(original['bufferViews'])):
        if index not in replacements:
            assert view_bytes(original, binary, index) == view_bytes(result, result_binary, index), index
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
    report = {'source': str(source), 'sourceSHA256': original_hash, 'beforeBytes': source.stat().st_size,
        'afterBytes': len(data), 'reductionPercent': round((1-len(data)/source.stat().st_size)*100, 2),
        'instanceCount': instances, 'geometryAndInstancesByteIdentical': True, 'images': images}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print('RESULT', report['beforeBytes'], '->', report['afterBytes'], 'instances', instances, flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT/'src/assets/modelAssets/legacy/portal-terrain_back.glb')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--report', type=Path, default=ROOT/'docs/terrain-compression/texture-report.json')
    args = parser.parse_args()
    compress(args.source, args.output, args.report)
