"""Shared source and runtime paths for Blender exporters."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'src/assets/modelAssets'
PREPARED = ROOT / 'blendFile/prepared'
SCENES = ROOT / 'blendFile/scenes'

def asset_path(name):
    if name.startswith('portal-'):
        category = 'portal'
    elif name.startswith('car-'):
        category = 'vehicles'
    elif name.startswith('incident-rock-') or name.startswith(('tree-', 'rock-')) or name == 'guardrail':
        category = 'environment'
    elif name in ['human', 'worker']:
        category = 'characters'
    elif name in ['substation-original', 'work-worker', 'water-tank-original']:
        category = 'legacy'
    else:
        category = 'equipment'
    path = ASSETS / category / (name + '.glb')
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

def source_path(name):
    base = ROOT / ('blendFile/originals/legacy' if name.endswith('.blend') else 'modelSources/legacy')
    return base / name
