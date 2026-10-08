"""Agent d'impression de l'Atelier monture 3D.

Service invisible qui tourne sur le PC du magasin (lancé par pythonw.exe au démarrage de Windows) et
n'écoute que ce PC (127.0.0.1). Le site de l'atelier lui envoie la monture (.3mf), la machine et la
qualité choisies ; l'agent lance OrcaSlicer en ligne de commande, sans fenêtre, avec les profils
« monture », et renvoie le fichier d'impression.

Installation et mise à jour : Installer-Atelier.cmd (Python officiel embarqué + OrcaSlicer portable).
Pas d'exécutable maison : non signé et inconnu des antivirus, il serait bloqué sur les postes protégés
(constaté avec Bitdefender), alors que pythonw.exe est signé par la Python Software Foundation.
"""
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.request

VERSION = '1.2.0'
PORT = 47913
# ATELIER_APP_DIR : dossier de travail de remplacement, pour les essais sans toucher à l'installation
APP_DIR = os.environ.get('ATELIER_APP_DIR') or os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'AtelierMonture')
NO_WINDOW = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW

# Sites autorisés à utiliser l'agent : le site de l'atelier (lachal-groupe.github.io) et la version locale.
# La liste peut être restreinte dans %LOCALAPPDATA%\AtelierMonture\config.json (« allowed_origins »).
# Site de l'atelier : l'agent y reprend les derniers réglages d'impression (config.json : « site »).
DEFAULT_SITE = 'https://lachal-groupe.github.io/Print3D'
PROFILE_REFRESH = 10 * 60  # secondes entre deux mises à jour des réglages (aussi faites avant une découpe)
DEFAULT_ORIGINS = [r'^https://lachal-groupe\.github\.io$', r'^http://(localhost|127\.0\.0\.1)(:\d+)?$']


def log(msg):
    try:
        os.makedirs(APP_DIR, exist_ok=True)
        with open(os.path.join(APP_DIR, 'agent.log'), 'a', encoding='utf8') as fh:
            fh.write(time.strftime('%Y-%m-%d %H:%M:%S ') + msg + '\n')
    except OSError:
        pass


def config():
    try:
        with open(os.path.join(APP_DIR, 'config.json'), encoding='utf8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def find_orca():
    root = os.path.join(APP_DIR, 'orca')
    for dirpath, _, files in os.walk(root):
        for f in files:
            if f.lower() in ('orca-slicer.exe', 'orcaslicer.exe'):
                return os.path.join(dirpath, f)
    return None


def machines():
    try:
        with open(os.path.join(APP_DIR, 'profiles', 'machines.json'), encoding='utf8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


LAST_PROFILES = [0.0]  # heure de la dernière mise à jour réussie des réglages


def site():
    return (config().get('site') or DEFAULT_SITE).rstrip('/')


def update_profiles():
    """Télécharge les réglages d'impression publiés sur le site ; garde ceux du PC si le site est injoignable."""
    base = site() + '/agent/profiles/'
    prof = os.path.join(APP_DIR, 'profiles')

    def fetch(name):
        with urllib.request.urlopen(base + name, timeout=20) as r:
            data = r.read()
        json.loads(data)  # refuse un fichier abîmé
        return data

    try:
        index = fetch('machines.json')
        files = {'machines.json': index}
        for mid, m in json.loads(index).items():
            for kind in ['machine', 'process', 'filament'] + [f'process.{q}' for q in m.get('qualities', {})]:
                files[f'{mid}.{kind}.json'] = fetch(f'{mid}.{kind}.json')
    except Exception as e:  # hors ligne, site en travaux… : on garde les réglages actuels
        log(f'réglages non mis à jour ({e})')
        return False
    os.makedirs(prof, exist_ok=True)
    changed = 0
    for name, data in files.items():
        path = os.path.join(prof, name)
        try:
            with open(path, 'rb') as fh:
                if fh.read() == data:
                    continue
        except OSError:
            pass
        with open(path + '.tmp', 'wb') as fh:
            fh.write(data)
        os.replace(path + '.tmp', path)
        changed += 1
    if changed:
        log(f"réglages d’impression mis à jour depuis le site ({changed} fichiers)")
    LAST_PROFILES[0] = time.time()
    return True


def profile_updater():
    while True:
        update_profiles()
        time.sleep(PROFILE_REFRESH)


def self_update():
    """Remplace agent.py par la version publiée sur le site (vérifiée avant : fichier Python valide)."""
    with urllib.request.urlopen(site() + '/agent/agent.py', timeout=30) as r:
        code = r.read()
    compile(code, 'agent.py', 'exec')  # refuse un fichier abîmé ou tronqué
    if b"agent': 'atelier-monture'" not in code:
        raise RuntimeError('fichier inattendu')
    path = os.path.abspath(__file__)
    with open(path + '.new', 'wb') as fh:
        fh.write(code)
    os.replace(path + '.new', path)
    update_profiles()
    log('agent mis à jour depuis le site, redémarrage')


def restart(server):
    """Relance l'agent (nouvelle version) dans un processus invisible, puis arrête celui-ci."""
    time.sleep(0.3)  # laisse partir la réponse au site
    subprocess.Popen([sys.executable, os.path.abspath(__file__), '--agent', '--wait'], cwd=APP_DIR,
                     creationflags=NO_WINDOW | 0x00000008, close_fds=True)  # 0x8 : DETACHED_PROCESS
    server.shutdown()
    os._exit(0)


# ---------------------------------------------------------------- découpe

def slice_3mf(machine_id, data, quality='fine'):
    """Découpe le .3mf reçu avec les profils de la machine ; renvoie (nom de fichier, contenu)."""
    if time.time() - LAST_PROFILES[0] > PROFILE_REFRESH:
        update_profiles()  # derniers réglages publiés (remplissage, températures…) avant de découper
    orca = find_orca()
    if not orca:
        raise RuntimeError('OrcaSlicer est introuvable : relancez l’installation de l’agent.')
    conf = machines().get(machine_id)
    if not conf:
        raise RuntimeError(f'Machine inconnue : {machine_id}')
    prof = os.path.join(APP_DIR, 'profiles')
    p = {k: os.path.join(prof, f'{machine_id}.{k}.json') for k in ('machine', 'process', 'filament')}
    q = os.path.join(prof, f'{machine_id}.process.{quality}.json')
    if os.path.exists(q):
        p['process'] = q
    work = tempfile.mkdtemp(prefix='atelier_')
    try:
        src = os.path.join(work, 'monture.3mf')
        out = os.path.join(work, 'sortie')
        os.makedirs(out)
        with open(src, 'wb') as fh:
            fh.write(data)
        # dossier de données propre à l'agent : indépendant d'un éventuel OrcaSlicer installé par l'opticien
        data_dir = os.path.join(APP_DIR, 'orcadata')
        os.makedirs(data_dir, exist_ok=True)
        cmd = [orca, '--datadir', data_dir, '--slice', '0', '--load-settings', f'{p["machine"]};{p["process"]}',
               '--load-filaments', p['filament'], '--outputdir', out]
        if conf['output'] == 'gcode.3mf':
            cmd += ['--export-3mf', 'monture.gcode.3mf']
        cmd.append(src)
        t0 = time.time()
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=300, creationflags=NO_WINDOW,
                             cwd=os.path.dirname(orca))
        log(f'découpe {machine_id} : code {res.returncode} en {time.time() - t0:.1f} s')
        wanted = '.gcode.3mf' if conf['output'] == 'gcode.3mf' else '.gcode'
        found = [os.path.join(dp, f) for dp, _, fs in os.walk(out) for f in fs if f.lower().endswith(wanted)]
        if conf['output'] == 'gcode':
            found = [f for f in found if not f.lower().endswith('.gcode.3mf')]
        if res.returncode != 0 or not found:
            log('sortie OrcaSlicer :\n' + (res.stdout or '')[-3000:] + '\n' + (res.stderr or '')[-3000:])
            raise RuntimeError('La découpe a échoué (détails dans agent.log).')
        with open(found[0], 'rb') as fh:
            return os.path.basename(found[0]), fh.read()
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ---------------------------------------------------------------- serveur local

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'AtelierMonture/' + VERSION

    def log_message(self, *args):
        pass

    def origin_ok(self):
        origin = self.headers.get('Origin')
        if not origin:
            return True  # appel direct sur ce PC (pas depuis une page web)
        patterns = config().get('allowed_origins') or DEFAULT_ORIGINS
        return any(re.match(p, origin) for p in patterns)

    def cors(self):
        origin = self.headers.get('Origin')
        if origin and self.origin_ok():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Expose-Headers', 'Content-Disposition, X-Filename')
            # accès d'un site public à un service local (Chrome / Edge, « Private Network Access »)
            self.send_header('Access-Control-Allow-Private-Network', 'true')

    def reply(self, code, body, ctype='application/json', extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf8')
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204 if self.origin_ok() else 403)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if not self.origin_ok():
            return self.reply(403, {'error': 'Site non autorisé'})
        if self.path.startswith('/status'):
            return self.reply(200, {'agent': 'atelier-monture', 'version': VERSION, 'orca': bool(find_orca()),
                                    'machines': machines()})
        self.reply(404, {'error': 'Inconnu'})

    def do_POST(self):
        if not self.origin_ok():
            return self.reply(403, {'error': 'Site non autorisé'})
        if self.path.startswith('/quit') and not self.headers.get('Origin'):
            self.reply(200, {'ok': True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path.startswith('/update'):
            # mise à jour demandée depuis le site (bouton « Mettre à jour l'agent »)
            try:
                self_update()
            except Exception as e:
                log('mise à jour impossible : ' + traceback.format_exc())
                return self.reply(500, {'error': f'Mise à jour impossible : {e}'})
            self.reply(200, {'ok': True, 'restarting': True})
            threading.Thread(target=restart, args=(self.server,), daemon=True).start()
            return
        m = re.match(r'^/slice\?machine=([a-z0-9]+)(?:&quality=([a-z]+))?', self.path)
        if not m:
            return self.reply(404, {'error': 'Inconnu'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > 80 * 1024 * 1024:
            return self.reply(400, {'error': 'Fichier absent ou trop gros'})
        data = self.rfile.read(length)
        try:
            name, out = slice_3mf(m.group(1), data, m.group(2) or 'fine')
        except Exception as e:  # le site affiche le message à l'opticien
            log('erreur : ' + traceback.format_exc())
            return self.reply(500, {'error': str(e)})
        self.reply(200, out, 'application/octet-stream',
                   {'X-Filename': name, 'Content-Disposition': f'attachment; filename="{name}"'})


def agent_running():
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/status', timeout=1.5) as r:
            return json.load(r).get('agent') == 'atelier-monture'
    except Exception:
        return False


def run_agent():
    if '--wait' in sys.argv:  # relance après mise à jour : l'ancienne version libère le port
        for _ in range(50):
            if not agent_running():
                break
            time.sleep(0.3)
    if agent_running():
        return
    log(f'démarrage de l’agent {VERSION}')
    threading.Thread(target=profile_updater, daemon=True).start()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    srv.serve_forever()


if __name__ == '__main__':
    run_agent()
