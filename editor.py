#!/usr/bin/env python3
"""Q Youth Site Editor — python3 editor.py"""
import json, os, threading, time, webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = 8080
DIR  = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(DIR, 'public')

PAGES = [
    {"file": "index.html",          "title": "Home"},
    {"file": "drop-ins.html",       "title": "Drop Ins"},
    {"file": "young-adults.html",   "title": "Young Adults"},
    {"file": "events.html",         "title": "Events"},
    {"file": "education.html",      "title": "Education"},
    {"file": "local-directory.html","title": "Directory"},
    {"file": "resources.html",      "title": "Resources"},
    {"file": "blog.html",           "title": "Blog"},
    {"file": "get-involved.html",   "title": "Get Involved"},
    {"file": "privacy-policy.html", "title": "Privacy Policy"},
]

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        p = urlparse(self.path).path
        if p in ('/editor', '/editor/'):
            self._file('editor.html', 'text/html; charset=utf-8', base=DIR)
        elif p == '/editor-inject.js':
            self._file('editor-inject.js', 'application/javascript; charset=utf-8', base=DIR)
        elif p == '/api/data':
            self._file('site-data.json', 'application/json')
        elif p == '/api/pages':
            self._json(PAGES)
        else:
            super().do_GET()

    def do_POST(self):
        p = urlparse(self.path).path
        if p == '/api/save-data':
            self._save_json('site-data.json', self._body())
        elif p == '/api/save-html':
            self._save_html(self._body())
        elif p == '/api/save-page':
            self._save_page(self._body())
        elif p == '/api/upload-image':
            self._upload_image(self._body())
        else:
            self.send_error(404)

    # --- helpers ---
    def _body(self):
        n = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(n))

    def _file(self, name, ctype, base=None):
        path = os.path.join(base or SITE, name)
        try:
            data = open(path, 'rb').read()
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', len(data))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_error(404, f'{name} not found')

    def _json(self, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(data))
        self.end_headers()
        self.wfile.write(data)

    def _ok(self): self._json({'ok': True})
    def _err(self, msg):
        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'ok': False, 'error': msg}).encode())

    def _save_json(self, filename, data):
        try:
            path = os.path.join(SITE, filename)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self._ok()
        except Exception as e:
            self._err(str(e))

    def _save_html(self, body):
        try:
            from bs4 import BeautifulSoup
            file_name = os.path.basename(body['file'])   # sanitise path
            path = os.path.join(SITE, file_name)
            soup = BeautifulSoup(open(path, encoding='utf-8').read(), 'html.parser')
            el = soup.find(attrs={'data-editable': body['id']})
            if not el:
                return self._err(f'Element data-editable="{body["id"]}" not found')
            # Replace text preserving the tag; clear children then set NavigableString
            el.clear()
            el.append(body['text'])
            with open(path, 'w', encoding='utf-8') as f:
                f.write(str(soup))
            self._ok()
        except ImportError:
            self._err('beautifulsoup4 not installed — run: pip install beautifulsoup4')
        except Exception as e:
            self._err(str(e))

    def _save_page(self, body):
        try:
            filename = os.path.basename(body['file'])
            with open(os.path.join(SITE, filename), 'w', encoding='utf-8') as f:
                f.write(body['html'])
            self._ok()
        except Exception as e:
            self._err(str(e))

    def _upload_image(self, body):
        try:
            import base64
            filename = os.path.basename(body['filename'].replace('\\', '/'))
            folder = body.get('folder', 'images').strip('/').replace('..', '').replace('/', os.sep)
            raw = body['data']
            # strip data-URL prefix if present: "data:image/png;base64,..."
            if ',' in raw: raw = raw.split(',', 1)[1]
            data = base64.b64decode(raw)
            dest_dir = os.path.join(SITE, folder)
            os.makedirs(dest_dir, exist_ok=True)
            with open(os.path.join(dest_dir, filename), 'wb') as f:
                f.write(data)
            rel = folder.replace(os.sep, '/') + '/' + filename
            self._json({'ok': True, 'path': rel, 'filename': filename})
        except Exception as e:
            self._err(str(e))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and not str(args[1]).startswith('2'):
            super().log_message(fmt, *args)

def main():
    os.chdir(SITE)
    # Kill any stale process already holding the port
    try:
        import socket as _s, signal
        probe = _s.socket(_s.AF_INET, _s.SOCK_STREAM)
        probe.settimeout(0.3)
        if probe.connect_ex(('127.0.0.1', PORT)) == 0:
            # Port in use — try to find and kill the old process (POSIX only)
            try:
                import subprocess
                out = subprocess.check_output(['lsof', '-ti', f':{PORT}'], text=True).strip()
                for pid in out.split():
                    try: os.kill(int(pid), signal.SIGTERM)
                    except: pass
                time.sleep(0.4)
            except Exception:
                pass
        probe.close()
    except Exception:
        pass

    HTTPServer.allow_reuse_address = True
    srv = HTTPServer(('', PORT), Handler)
    print(f'\n  Q Youth Editor  →  http://localhost:{PORT}/editor\n  Ctrl+C to stop\n')
    threading.Thread(target=lambda: (time.sleep(0.7), webbrowser.open(f'http://localhost:{PORT}/editor')), daemon=True).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: print('\n  Stopped.'); srv.shutdown()

if __name__ == '__main__': main()
