"""Tiny static dev server for the frontend prototype that DISABLES caching.

`python -m http.server` lets the browser cache app/*.jsx aggressively, so edits to
the React sources don't show up on reload (you keep seeing the old compiled screen).
This serves the same folder but sends no-store headers, so every reload re-fetches.

Run:  python web/frontend/serve.py [port]     (default 8757)
"""
import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8757
# Bind to all interfaces (0.0.0.0) so other devices on the LAN (e.g. a phone
# on the same Wi-Fi) can reach the dev server, not just this machine.
HOST = sys.argv[2] if len(sys.argv) > 2 else "0.0.0.0"
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    handler = functools.partial(NoCacheHandler, directory=DIRECTORY)
    with socketserver.TCPServer((HOST, PORT), handler) as httpd:
        print(f"no-cache dev server on http://{HOST}:{PORT}  (serving {DIRECTORY})")
        print(f"  -> from a phone on the same Wi-Fi, open  http://<this-PC-IP>:{PORT}/seoul-walk.html")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
