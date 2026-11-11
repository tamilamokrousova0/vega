#!/usr/bin/env python3
"""Локальный сервер для DEAD FRONT: отдаёт файлы без кеша, чтобы правки были видны сразу."""
import http.server, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
