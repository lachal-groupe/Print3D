"""Prépare les profils d'impression de l'agent à partir des profils officiels d'OrcaSlicer.

Chaque profil officiel hérite d'autres profils (« inherits »). On résout toute la chaîne pour obtenir
des profils complets et autonomes, puis on applique les réglages « monture » d'overrides.json.
Résultat : agent/profiles/<machine>.{machine,process,filament}.json, utilisés par l'agent en ligne de commande.

Usage : python build_profiles.py <dossier OrcaSlicer (contenant resources/profiles)>
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def index_presets(profiles_dir):
    """Nom de profil -> chemin du fichier JSON, pour tous les fabricants."""
    idx = {}
    for root, _, files in os.walk(profiles_dir):
        for f in files:
            if not f.endswith('.json'):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, encoding='utf8') as fh:
                    data = json.load(fh)
            except (OSError, ValueError):
                continue
            if isinstance(data, dict) and 'name' in data and 'type' in data:
                # le dossier du fabricant prime en cas d'homonymie
                idx.setdefault(data['name'], []).append(path)
    return idx


def resolve(name, idx, vendor_dir, seen=()):
    """Profil complet : parents d'abord, puis l'enfant par-dessus."""
    if name in seen:
        raise ValueError(f'Héritage circulaire : {name}')
    paths = idx.get(name)
    if not paths:
        raise KeyError(f'Profil introuvable : {name}')
    path = next((p for p in paths if p.startswith(vendor_dir)), paths[0])
    with open(path, encoding='utf8') as fh:
        data = json.load(fh)
    parent = data.get('inherits')
    merged = resolve(parent, idx, vendor_dir, seen + (name,)) if parent else {}
    merged.update(data)
    return merged


def finalize(preset, name, kind, overrides, system_name, machine_system=None):
    """Profil autonome (tous les réglages résolus), qui garde le nom du profil système dont il descend.

    En ligne de commande, OrcaSlicer vérifie que le procédé est compatible avec la machine *système* dont
    hérite le profil machine (sinon code -17) : « inherits » sert ici d'étiquette, les valeurs sont déjà
    toutes présentes, et le procédé et le filament sont déclarés compatibles avec cette machine système.
    """
    preset = dict(preset)
    preset.update(overrides)
    preset['name'] = name
    preset['type'] = kind
    preset['from'] = 'User'
    preset['inherits'] = system_name
    preset['instantiation'] = 'true'
    if machine_system:
        preset['compatible_printers'] = [machine_system]
        preset['compatible_printers_condition'] = ''
    return preset


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    orca = sys.argv[1]
    profiles_dir = os.path.join(orca, 'resources', 'profiles')
    idx = index_presets(profiles_dir)
    with open(os.path.join(HERE, 'overrides.json'), encoding='utf8') as fh:
        conf = json.load(fh)
    out_dir = os.path.join(HERE, 'profiles')
    os.makedirs(out_dir, exist_ok=True)
    common = conf['process_common']
    for mid, m in conf['machines'].items():
        vendor = 'BBL' if m['machine'].startswith('Bambu') else 'Creality'
        vendor_dir = os.path.join(profiles_dir, vendor)
        machine = finalize(resolve(m['machine'], idx, vendor_dir), f'Atelier {m["label"]}', 'machine', {}, m['machine'])
        base_process = resolve(m['process'], idx, vendor_dir)
        for qid, q in conf['qualities'].items():
            proc = finalize(base_process, f'Atelier monture {m["label"]} {qid}', 'process',
                            {**common, **m.get('process_overrides', {}), **q['process']}, m['process'], m['machine'])
            with open(os.path.join(out_dir, f'{mid}.process.{qid}.json'), 'w', encoding='utf8') as fh:
                json.dump(proc, fh, indent=1, ensure_ascii=False)
        process = finalize(base_process, f'Atelier monture {m["label"]}', 'process',
                           {**common, **m.get('process_overrides', {})}, m['process'], m['machine'])
        filament = finalize(resolve(m['filament'], idx, vendor_dir), f'Atelier PLA {m["label"]}', 'filament',
                            m.get('filament_overrides', {}), m['filament'], m['machine'])
        for kind, data in (('machine', machine), ('process', process), ('filament', filament)):
            with open(os.path.join(out_dir, f'{mid}.{kind}.json'), 'w', encoding='utf8') as fh:
                json.dump(data, fh, indent=1, ensure_ascii=False)
        print(f'{mid} : {len(machine)} réglages machine, {len(process)} procédé, {len(filament)} filament')
    with open(os.path.join(out_dir, 'machines.json'), 'w', encoding='utf8') as fh:
        json.dump({k: {'label': v['label'], 'bed': v['bed'], 'output': v['output'],
                       'qualities': {q: conf['qualities'][q]['label'] for q in conf['qualities']}}
                   for k, v in conf['machines'].items()}, fh, indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
