import http.server
import json
import mimetypes
import os
import socketserver
import sys

import db
import model_service

# Ensure correct MIME types on Windows
mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/jpeg", ".jpg")
mimetypes.add_type("image/jpeg", ".jpeg")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Check if nested frontend directory exists (mercura_ai or Mercura-App-main)
SERVE_DIR = BASE_DIR
for candidate in ["mercura_ai", "Mercura-App-main"]:
    nested = os.path.join(BASE_DIR, candidate)
    if os.path.isdir(nested) and os.path.exists(os.path.join(nested, "index.html")):
        SERVE_DIR = nested
        break

PORT = 8000

class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SERVE_DIR, **kwargs)

    def translate_path(self, path):
        orig_path = super().translate_path(path)
        # If the file exists directly or is a directory, use it
        if os.path.exists(orig_path):
            return orig_path
        # Otherwise, check if appending .html matches an existing file (clean URLs)
        html_path = orig_path + ".html"
        if os.path.exists(html_path):
            return html_path
        return orig_path

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        size = int(self.headers.get("Content-Length") or 0)
        if not size:
            return {}
        return json.loads(self.rfile.read(size).decode() or "{}")

    def _token(self):
        header = self.headers.get("Authorization") or ""
        return header[7:].strip() if header.startswith("Bearer ") else ""

    def _merchant(self):
        return db.read_token(self._token())

    def _db_error(self, err):
        code = str(err)
        if code in ("invalid-email", "email-already-in-use", "invalid-credential", "weak-password"):
            status = 409 if code == "email-already-in-use" else 401 if code == "invalid-credential" else 400
            self._json(status, {"error": code})
            return
        if code == "unauthorized":
            self._json(401, {"error": "unauthorized"})
            return
        self._json(503, {"error": "database-unavailable"})

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            self._json(200, {"ok": True, "database": "postgresql"})
            return
        if path == "/api/store":
            merchant = self._merchant()
            if not merchant:
                self._json(401, {"error": "unauthorized"})
                return
            try:
                self._json(200, db.load_book(merchant))
            except Exception as err:
                self._db_error(err)
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/auth") or path.startswith("/api/store"):
            self._db_post(path)
            return
        routes = {
            "/api/ai/decide": model_service.decide,
            "/api/ai/forecast-demand": model_service.forecast,
            "/api/ai/predict-dead-stock": model_service.dead_stock,
            "/api/ai/scan-bill": model_service.scan_bill,
            "/api/ai/identify": model_service.identify,
        }
        fn = routes.get(path)
        if not fn:
            self.send_error(404)
            return
        try:
            if not self._merchant():
                self._json(401, {"error": "unauthorized"})
                return
        except Exception as err:
            self._db_error(err)
            return
        size = int(self.headers.get("Content-Length") or 0)
        if size > 8_000_000:
            self._json(413, {"error": "too-large"})
            return
        try:
            payload = json.loads(self.rfile.read(size).decode() or "{}")
            if isinstance(payload, dict) and isinstance(payload.get("skus"), list):
                payload["skus"] = payload["skus"][:12]
            body = json.dumps(fn(payload)).encode()
            status = 200
        except Exception as err:
            bad = str(err) == "bad-image"
            body = b'{"error":"bad-image"}' if bad else b'{"error":"model-unavailable"}'
            status = 400 if bad else 503
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        self._db_post(self.path.split("?", 1)[0])

    def _db_post(self, path):
        try:
            payload = self._read_json()
        except Exception:
            self._json(400, {"error": "invalid-email"})
            return
        try:
            if path == "/api/auth/register":
                self._json(200, db.register(payload))
                return
            if path == "/api/auth/login":
                self._json(200, db.login(payload))
                return
            if path == "/api/auth/logout":
                db.logout(self._token())
                self._json(200, {"ok": True})
                return
            merchant = self._merchant()
            if not merchant:
                self._json(401, {"error": "unauthorized"})
                return
            if path == "/api/store":
                self._json(200, db.replace_book(merchant, payload))
                return
            if path == "/api/store/sample":
                catalog = os.path.join(SERVE_DIR, "data", "catalog.json")
                with open(catalog, encoding="utf-8") as handle:
                    rows = json.load(handle)
                self._json(200, db.load_sample(merchant, rows))
                return
            self.send_error(404)
        except Exception as err:
            self._db_error(err)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for local development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

def run_server(port=PORT, scan=True):
    try:
        db.init_db()
        print("PostgreSQL store book ready.")
    except Exception as err:
        print("PostgreSQL is not ready:", err)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    candidates = [port, 5500, 8081, 8082, 8888] if scan else [port]
    for candidate_port in candidates:
        try:
            httpd = socketserver.ThreadingTCPServer(("", candidate_port), CleanUrlHandler)
            httpd.daemon_threads = True
            print(f"Mercura Local Server running at http://localhost:{candidate_port}")
            print(f"Serving files from: {SERVE_DIR}")
            print("Press Ctrl+C to stop the server.")
            sys.stdout.flush()
            httpd.serve_forever()
            return
        except OSError:
            print(f"Port {candidate_port} is busy, trying next available port...")
    print("Could not find an available port to start the server.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_server(int(sys.argv[1]), scan=True)
    elif os.environ.get("PORT"):
        run_server(int(os.environ["PORT"]), scan=False)
    else:
        run_server(PORT, scan=True)
