import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Give the supplied lamp lens its own controllable emissive glTF material."""
import json,struct
from pathlib import Path
p=asset_path('portal-structures')
b=p.read_bytes();length=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+length])
for material in doc['materials']:
 if material.get('name')=='lights':material['emissiveFactor']=[1,.9,.7]
encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*((-len(encoded))%4)
rest=b[20+length:];size=12+8+len(encoded)+len(rest)
p.write_bytes(struct.pack('<4sII',b'glTF',2,size)+struct.pack('<I4s',len(encoded),b'JSON')+encoded+rest)
