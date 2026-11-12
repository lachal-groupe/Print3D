"""Agent d'impression de l'Atelier monture 3D.

Service invisible qui tourne sur le PC du magasin (lancé par pythonw.exe au démarrage de Windows) et
n'écoute que ce PC (127.0.0.1). Le site de l'atelier lui envoie la monture (.3mf), la machine et la
qualité choisies ; l'agent lance OrcaSlicer en ligne de commande, sans fenêtre, avec les profils
« monture », et renvoie le fichier d'impression — ou l'envoie directement à une Bambu Lab du réseau local.

Installation et mise à jour : Installer-Atelier.cmd (Python officiel embarqué + OrcaSlicer portable).
Pas d'exécutable maison : non signé et inconnu des antivirus, il serait bloqué sur les postes protégés
(constaté avec Bitdefender), alors que pythonw.exe est signé par la Python Software Foundation.
"""
import ftplib
import http.server
import io
import json
import os
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.request
from concurrent.futures import ThreadPoolExecutor

VERSION = '1.3.0'
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
        cmd = [orca, '--datadir', data_dir, '--arrange', '0', '--slice', '0', '--load-settings', f'{p["machine"]};{p["process"]}',
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


# ---------------------------------------------------------------- imprimantes Bambu en réseau local
# Impression directe sur une Bambu Lab (P1S) du réseau du magasin : l'imprimante doit être en « Mode LAN
# uniquement » avec le « Mode développeur » activé (exigence de Bambu depuis 2025 pour les logiciels tiers).
# Envoi du fichier en FTPS (port 990, TLS implicite), ordre d'impression en MQTT (port 8883, TLS). Identifiant
# « bblp », mot de passe = code d'accès à 8 chiffres affiché sur l'écran de l'imprimante. Le code n'est gardé
# que sur ce PC (config.json) et n'est jamais renvoyé au site.

FOUND = {}  # numéro de série -> {ip, serial, name, model, seen}


def save_config(conf):
    os.makedirs(APP_DIR, exist_ok=True)
    path = os.path.join(APP_DIR, 'config.json')
    with open(path + '.tmp', 'w', encoding='utf8') as fh:
        json.dump(conf, fh, indent=1, ensure_ascii=False)
    os.replace(path + '.tmp', path)


def saved_printers():
    return config().get('printers', [])


def tls_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # certificat auto-signé de l'imprimante
    return ctx


def cert_serial(der):
    """Numéro de série de l'imprimante = nom commun (CN) du titulaire de son certificat (dernier CN du DER)."""
    serial, i = None, 0
    while True:
        i = der.find(b'\x06\x03\x55\x04\x03', i)  # OID 2.5.4.3 (commonName)
        if i < 0:
            return serial
        n = der[i + 6]
        serial = der[i + 7:i + 7 + n].decode('ascii', 'replace')
        i += 7 + n


def probe_printer(ip, timeout=1.5, port=8883):
    """L'adresse répond-elle comme une imprimante Bambu (certificat « BBL ») ? Renvoie son numéro de série."""
    try:
        with socket.create_connection((ip, port), timeout=timeout) as raw, tls_context().wrap_socket(raw) as t:
            der = t.getpeercert(binary_form=True)
            return cert_serial(der) if b'BBL' in der else None
    except OSError:
        return None


def port_open(ip, port, timeout=1.0):
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def local_networks():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('192.0.2.1', 9))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    return sorted({ip.rsplit('.', 1)[0] for ip in ips if not ip.startswith(('127.', '169.254.'))})


def scan_printers():
    """Sonde le réseau local (/24 de chaque carte réseau). Une Bambu ouvre toujours le port 990 (fichiers, TLS,
    certificat « BBL ») ; le port 8883 (ordres d'impression) ne s'ouvre qu'en mode LAN + mode développeur."""
    targets = [f'{net}.{i}' for net in local_networks() for i in range(1, 255)]
    with ThreadPoolExecutor(64) as ex:
        open_ips = [ip for ip, ok in zip(targets, ex.map(lambda ip: port_open(ip, 990, 0.5), targets)) if ok]
    for ip in open_ips:
        serial = probe_printer(ip, port=990)
        if serial:
            model = 'Bambu Lab P1S' if serial.startswith('01P') else 'Bambu Lab'
            FOUND.setdefault(serial, {'serial': serial, 'model': model, 'name': model.replace('Bambu Lab ', '')})
            FOUND[serial].update(ip=ip, seen=time.time(), lan=port_open(ip, 8883))
    return list(FOUND.values())


def ssdp_listener():
    """Les imprimantes Bambu s'annoncent sur le réseau (UDP 2021) : on note adresse, modèle et nom."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('', 2021))
    except OSError as e:
        log(f'écoute des annonces impossible ({e})')
        return
    models = {'C11': 'P1P', 'C12': 'P1S', 'BL-P001': 'X1 Carbon', 'BL-P002': 'X1', 'C13': 'X1E', 'N1': 'A1 mini', 'N2S': 'A1'}
    while True:
        try:
            data, addr = s.recvfrom(4096)
            h = {}
            for line in data.decode('utf8', 'replace').splitlines():
                if ':' in line:
                    k, v = line.split(':', 1)
                    h[k.strip().lower()] = v.strip()
            serial = h.get('usn')
            if not serial or 'bambu' not in data.decode('utf8', 'replace').lower():
                continue
            model = h.get('devmodel.bambu.com', '')
            FOUND[serial] = {'serial': serial, 'ip': h.get('location', addr[0]) or addr[0], 'seen': time.time(),
                             'model': 'Bambu Lab ' + models.get(model, model), 'name': h.get('devname.bambu.com') or serial}
        except Exception:
            time.sleep(1)


# --- MQTT 3.1.1 minimal (connexion, abonnement, publication) sur TLS

def _mqtt_len(n):
    out = bytearray()
    while True:
        b, n = n % 128, n // 128
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _mqtt_str(s):
    b = s.encode('utf8')
    return len(b).to_bytes(2, 'big') + b


def _mqtt_read(sock):
    head = sock.recv(1)
    if not head:
        raise ConnectionError('connexion fermée par l’imprimante')
    n, mult = 0, 1
    while True:
        b = sock.recv(1)[0]
        n += (b & 0x7F) * mult
        mult *= 128
        if not b & 0x80:
            break
    body = b''
    while len(body) < n:
        chunk = sock.recv(n - len(body))
        if not chunk:
            raise ConnectionError('connexion coupée')
        body += chunk
    return head[0], body


class PrinterError(RuntimeError):
    pass


def mqtt_session(printer, publish=None, want_report=False, timeout=10):
    """Ouvre une session MQTT avec l'imprimante ; publie une commande et/ou lit un rapport d'état complet."""
    ip, serial, code = printer['ip'], printer['serial'], printer['code']
    try:
        raw = socket.create_connection((ip, 8883), timeout=timeout)
    except OSError:
        raise PrinterError(f'Imprimante injoignable ({ip}) : allumée et sur le même réseau ?')
    with tls_context().wrap_socket(raw) as sock:
        sock.settimeout(timeout)
        var = _mqtt_str('MQTT') + bytes([4, 0xC2]) + (60).to_bytes(2, 'big')
        pay = _mqtt_str(f'atelier-{int(time.time())}') + _mqtt_str('bblp') + _mqtt_str(code)
        sock.sendall(bytes([0x10]) + _mqtt_len(len(var) + len(pay)) + var + pay)
        kind, body = _mqtt_read(sock)
        if kind >> 4 != 2 or len(body) < 2 or body[1] != 0:
            raise PrinterError('Code d’accès refusé par l’imprimante (vérifiez-le sur son écran).')
        report = None
        if want_report:
            topic = f'device/{serial}/report'
            sub = (1).to_bytes(2, 'big') + _mqtt_str(topic) + b'\x00'
            sock.sendall(bytes([0x82]) + _mqtt_len(len(sub)) + sub)
        if want_report or publish:
            msgs = ([publish] if publish else []) + ([{'pushing': {'sequence_id': '0', 'command': 'pushall'}}] if want_report else [])
            for m in msgs:
                t = _mqtt_str(f'device/{serial}/request')
                data = json.dumps(m).encode('utf8')
                sock.sendall(bytes([0x30]) + _mqtt_len(len(t) + len(data)) + t + data)
        if want_report:
            end = time.time() + timeout
            while time.time() < end:
                kind, body = _mqtt_read(sock)
                if kind >> 4 != 3:
                    continue
                tl = int.from_bytes(body[:2], 'big')
                try:
                    msg = json.loads(body[2 + tl:])
                except ValueError:
                    continue
                p = msg.get('print', {})
                if 'gcode_state' in p:
                    report = p
                    break
        sock.sendall(b'\xe0\x00')
        return report


# --- FTPS à TLS implicite (port 990) : le serveur de l'imprimante exige la réutilisation de session TLS

class ImplicitFTPS(ftplib.FTP_TLS):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._sock = None

    @property
    def sock(self):
        return self._sock

    @sock.setter
    def sock(self, value):
        if value is not None and not isinstance(value, ssl.SSLSocket):
            value = self.context.wrap_socket(value)
        self._sock = value

    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, session=self.sock.session)
        return conn, size

    def storbinary(self, cmd, fp, blocksize=65536, callback=None, rest=None):
        self.voidcmd('TYPE I')
        with self.transfercmd(cmd, rest) as conn:
            while True:
                buf = fp.read(blocksize)
                if not buf:
                    break
                conn.sendall(buf)
            # fin TLS propre (sinon la fin du fichier peut être perdue) ; l'imprimante ne répond pas
            # toujours à cette fin : on n'attend pas plus de quelques secondes
            conn.settimeout(5)
            try:
                conn.unwrap()
            except (OSError, ValueError):
                pass
        return self.voidresp()


def upload(printer, name, data):
    ftp = ImplicitFTPS(context=tls_context(), timeout=60)
    try:
        ftp.connect(printer['ip'], 990)
        ftp.login('bblp', printer['code'])
        ftp.prot_p()
        ftp.storbinary(f'STOR {name}', io.BytesIO(data))
    except ftplib.error_perm as e:
        raise PrinterError(f'Envoi refusé par l’imprimante ({e}). Mode LAN et mode développeur activés ?')
    except OSError as e:
        raise PrinterError(f'Envoi du fichier impossible ({e}).')
    finally:
        try:
            ftp.quit()
        except Exception:
            pass


def printer_by_serial(serial):
    for p in saved_printers():
        if p['serial'] == serial:
            return dict(p)
    raise PrinterError('Imprimante inconnue : ajoutez-la d’abord.')


def reach(printer):
    """Adresse à jour : si l'imprimante a changé d'adresse (box redémarrée), on la retrouve par son numéro."""
    if probe_printer(printer['ip']) == printer['serial']:
        return printer
    for p in list(FOUND.values()) + scan_printers():
        if p['serial'] == printer['serial'] and p.get('ip'):
            printer['ip'] = p['ip']
            conf = config()
            for q in conf.get('printers', []):
                if q['serial'] == printer['serial']:
                    q['ip'] = p['ip']
            save_config(conf)
            return printer
    raise PrinterError('Imprimante introuvable sur le réseau : allumée et sur le même réseau que ce PC ?')


def print_on(serial, data, quality, use_ams=False):
    """Découpe pour la P1S, envoie le fichier à l'imprimante et lance l'impression."""
    printer = reach(printer_by_serial(serial))
    _, out = slice_3mf('p1s', data, quality)
    name = f'monture_{time.strftime("%Y%m%d_%H%M%S")}.gcode.3mf'
    upload(printer, name, out)
    mqtt_session(printer, publish={'print': {
        'sequence_id': '0', 'command': 'project_file', 'param': 'Metadata/plate_1.gcode',
        'project_id': '0', 'profile_id': '0', 'task_id': '0', 'subtask_id': '0', 'subtask_name': name[:-10],
        'url': f'file:///sdcard/{name}', 'file': name, 'md5': '', 'timelapse': False, 'bed_type': 'auto',
        'bed_levelling': True, 'flow_cali': False, 'vibration_cali': False, 'layer_inspect': False,
        'use_ams': bool(use_ams), 'ams_mapping': [0] if use_ams else []}})
    log(f'impression lancée sur {serial} ({printer["ip"]}) : {name}')
    return name


def printer_status(serial):
    printer = reach(printer_by_serial(serial))
    p = mqtt_session(printer, want_report=True) or {}
    return {'state': p.get('gcode_state'), 'percent': p.get('mc_percent'), 'remaining': p.get('mc_remaining_time'),
            'layer': p.get('layer_num'), 'layers': p.get('total_layer_num'), 'file': p.get('subtask_name')}


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
        if self.path.startswith('/printers'):
            return self.reply(200, self.printers_list())
        m = re.match(r'^/printer-status\?printer=([A-Za-z0-9]+)', self.path)
        if m:
            try:
                return self.reply(200, printer_status(m.group(1)))
            except PrinterError as e:
                return self.reply(502, {'error': str(e)})
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
        if self.path.startswith('/printers/'):
            return self.printers_post()
        m = re.match(r'^/print\?printer=([A-Za-z0-9]+)(?:&quality=([a-z]+))?(&ams=1)?', self.path)
        if m:
            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0 or length > 80 * 1024 * 1024:
                return self.reply(400, {'error': 'Fichier absent ou trop gros'})
            data = self.rfile.read(length)
            try:
                name = print_on(m.group(1), data, m.group(2) or 'rapide', bool(m.group(3)))
            except PrinterError as e:
                return self.reply(502, {'error': str(e)})
            except Exception as e:
                log('erreur impression : ' + traceback.format_exc())
                return self.reply(500, {'error': str(e)})
            return self.reply(200, {'ok': True, 'file': name})
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


    # --- imprimantes réseau
    def body_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(length) or b'{}') if 0 < length < 65536 else {}
        except ValueError:
            return {}

    @staticmethod
    def printers_list():
        saved = [{k: v for k, v in p.items() if k != 'code'} for p in saved_printers()]  # jamais le code d'accès
        known = {p['serial'] for p in saved}
        return {'saved': saved, 'found': [p for p in FOUND.values() if p['serial'] not in known]}

    def printers_post(self):
        req = self.body_json()
        try:
            if self.path.startswith('/printers/scan'):
                scan_printers()
                return self.reply(200, self.printers_list())
            if self.path.startswith('/printers/add'):
                ip = str(req.get('ip', '')).strip()
                code = str(req.get('code', '')).strip()
                if not re.match(r'^\d{1,3}(\.\d{1,3}){3}$', ip) or not re.match(r'^[A-Za-z0-9]{8}$', code):
                    return self.reply(400, {'error': 'Adresse IP ou code d’accès (8 caractères) incorrect.'})
                serial = probe_printer(ip, timeout=4)
                if not serial:
                    if probe_printer(ip, timeout=4, port=990):
                        raise PrinterError('L’imprimante est bien là, mais refuse les ordres d’impression : activez sur son '
                                           'écran le Mode LAN uniquement puis le Mode développeur.')
                    raise PrinterError(f'Aucune imprimante Bambu ne répond à l’adresse {ip}.')
                found = FOUND.get(serial, {})
                printer = {'serial': serial, 'ip': ip, 'code': code, 'name': str(req.get('name') or found.get('name') or serial)[:40],
                           'model': found.get('model', 'Bambu Lab')}
                mqtt_session(printer)  # vérifie le code d'accès
                conf = config()
                conf['printers'] = [p for p in conf.get('printers', []) if p['serial'] != serial] + [printer]
                save_config(conf)
                log(f'imprimante ajoutée : {serial} ({ip})')
                return self.reply(200, self.printers_list())
            if self.path.startswith('/printers/remove'):
                conf = config()
                conf['printers'] = [p for p in conf.get('printers', []) if p['serial'] != req.get('serial')]
                save_config(conf)
                return self.reply(200, self.printers_list())
        except PrinterError as e:
            return self.reply(502, {'error': str(e)})
        return self.reply(404, {'error': 'Inconnu'})


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
    threading.Thread(target=ssdp_listener, daemon=True).start()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    srv.serve_forever()


if __name__ == '__main__':
    run_agent()
