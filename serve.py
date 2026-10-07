# Petit serveur local pour l'atelier : comme python -m http.server, mais sans cache navigateur,
# pour que chaque mise à jour des fichiers soit prise en compte au simple rechargement de la page.
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.wasm': 'application/wasm', '.mjs': 'text/javascript'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *args):
        pass

# Sous Windows, autoriser la réutilisation du port laisserait deux serveurs se partager le même port :
# on préfère échouer clairement si un ancien serveur de l'atelier tourne encore.
socketserver.ThreadingTCPServer.allow_reuse_address = False
try:
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), NoCache)
except OSError:
    print(f"Le port {PORT} est déjà utilisé : fermez l'ancienne fenêtre noire de l'atelier, puis relancez lancer.bat.")
    input('Appuyez sur Entrée pour fermer…')
    sys.exit(1)
with httpd:
    print(f'Atelier monture 3D : http://localhost:{PORT}/  (fermez cette fenêtre pour arrêter)')
    httpd.serve_forever()
