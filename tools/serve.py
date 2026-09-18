#!/usr/bin/env python3
"""A static server that never caches. `python3 tools/serve.py [port]`.

python3 -m http.server is fine for playing, but during development a cached
ES module is indistinguishable from a bug you already fixed, so this exists.
"""
import sys, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Quantum Poker on http://localhost:{port}")
    ThreadingHTTPServer(("", port), NoCache).serve_forever()
