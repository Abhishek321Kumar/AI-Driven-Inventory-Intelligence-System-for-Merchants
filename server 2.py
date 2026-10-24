import http.server
import json
import mimetypes
import os
import socketserver
import sys

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
# Check if nested Mercura-App-main directory exists
NESTED_DIR = os.path.join(BASE_DIR, "Mercura-App-main")
SERVE_DIR = NESTED_DIR if os.path.isdir(NESTED_DIR) and os.path.exists(os.path.join(NESTED_DIR, "index.html")) else BASE_DIR

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

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        routes = {
            "/api/ai/forecast-demand": model_service.forecast,
            "/api/ai/predict-dead-stock": model_service.dead_stock,
        }
        fn = routes.get(path)
        if not fn:
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(size).decode() or "{}")
            body = json.dumps(fn(payload)).encode()
            status = 200
        except Exception:
            body = b'{"error":"kev-unavailable"}'
            status = 503
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for local development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

def run_server(port=PORT):
    for candidate_port in [port, 5500, 8081, 8082, 8888]:
        try:
            httpd = socketserver.TCPServer(("", candidate_port), CleanUrlHandler)
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
    p = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(p)
