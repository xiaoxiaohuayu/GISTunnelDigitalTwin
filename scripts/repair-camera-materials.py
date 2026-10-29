import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Set default camera housing and lens materials without changing its geometry.
Run after converting camera.glb. Original supplied assets are left intact.
"""
import json
import struct
from pathlib import Path

path = asset_path('camera')
raw = path.read_bytes()
json_size = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_size])
if any(node.get('name')=='fab-plaggy-camera' for node in gltf.get('nodes',[])):
    raise SystemExit(0)
if any(material.get('name') == 'Default camera lens' for material in gltf['materials']):
    raise SystemExit(0)
binary = bytearray(raw[28 + json_size:])

def values(index):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    code = {5126: 'f', 5123: 'H', 5125: 'I'}[accessor['componentType']]
    size = 3 if accessor['type'] == 'VEC3' else 1
    stride = view.get('byteStride', struct.calcsize('<' + code * size))
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return [struct.unpack_from('<' + code * size, binary, start + i * stride) for i in range(accessor['count'])]

def index_accessor(indices):
    binary.extend(b'\0' * (-len(binary) % 4))
    offset = len(binary)
    binary.extend(struct.pack('<' + 'I' * len(indices), *indices))
    view = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(indices) * 4, 'target': 34963})
    accessor = len(gltf['accessors'])
    gltf['accessors'].append({'bufferView': view, 'componentType': 5125, 'count': len(indices), 'type': 'SCALAR'})
    return accessor

housing = gltf['materials'][0]
housing['name'] = 'Default light grey camera housing'
housing['pbrMetallicRoughness'].update(baseColorFactor=[.78, .8, .82, 1], metallicFactor=0, roughnessFactor=.72)
lens_material = len(gltf['materials'])
gltf['materials'].append({'name': 'Default camera lens', 'pbrMetallicRoughness': {'baseColorFactor': [.018, .03, .045, 1], 'metallicFactor': 0, 'roughnessFactor': .22}})
for mesh in gltf['meshes']:
    result = []
    for primitive in mesh['primitives']:
        positions = values(primitive['attributes']['POSITION'])
        normals = values(primitive['attributes']['NORMAL'])
        indices = [row[0] for row in values(primitive['indices'])]
        body, lens = [], []
        for start in range(0, len(indices), 3):
            triangle = indices[start:start + 3]
            x, y, z = [sum(positions[i][axis] for i in triangle) / 3 for axis in range(3)]
            normal = sum(normals[i][2] for i in triangle) / 3
            # Recessed optical face inside the supplied camera's forward hood.
            optical = z > .19 and x*x + (y-.35)**2 < .115**2 and abs(normal) > .65
            (lens if optical else body).extend(triangle)
        for region, material in [(body, 0), (lens, lens_material)]:
            if region:
                result.append({**primitive, 'indices': index_accessor(region), 'material': material})
    mesh['primitives'] = result
gltf['buffers'][0]['byteLength'] = len(binary)
encoded = json.dumps(gltf, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
length = 12 + 8 + len(encoded) + 8 + len(binary)
path.write_bytes(struct.pack('<III', 0x46546C67, 2, length) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + struct.pack('<II', len(binary), 0x004E4942) + binary)
print('Camera housing and recessed lens materials updated')
