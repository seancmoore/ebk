"""Bake the home-hero ball textures to public/img/hero/*.webp.

The textures are procedural (tools/hero_textures/gen.js). Generating them in
the visitor's browser froze the home page for seconds, so we generate them
once here, in headless Chrome, and ship the images.

    python tools/bake_hero_textures.py            # 1024x512, default accent
    python tools/bake_hero_textures.py --accent "#3ddc97"

Re-run after editing gen.js. Stamp directions in gen.js must stay in sync
with the `logo` directions in public/js/hero3d.js.
"""
import argparse
import http.server
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from urllib.parse import urlencode

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "img", "hero")
CHROME_CANDIDATES = [
    os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
    os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
    os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome", "chromium", "chromium-browser",
]


def find_chrome():
    for c in CHROME_CANDIDATES:
        p = c if os.path.isabs(c) else shutil.which(c)
        if p and os.path.exists(p):
            return p
    sys.exit("Chrome not found; install it or add it to CHROME_CANDIDATES")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--accent", default="#3ddc97")
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--qbump", type=float, default=0.8)
    ap.add_argument("--timeout", type=int, default=180)
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    done = threading.Event()
    result = {}

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ROOT, **kw)

        def log_message(self, *a):
            pass

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path.startswith("/save/"):
                name = os.path.basename(self.path[len("/save/"):])
                with open(os.path.join(OUT, name), "wb") as f:
                    f.write(body)
                print(f"  {name:24s} {len(body) / 1024:6.1f} KB")
            elif self.path == "/done":
                result["status"] = body.decode()
                done.set()
            self.send_response(204)
            self.end_headers()

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    qs = urlencode({"accent": args.accent, "size": args.size, "qbump": args.qbump})
    url = f"http://127.0.0.1:{srv.server_port}/tools/hero_textures/bake.html?{qs}"

    profile = tempfile.mkdtemp(prefix="ebk-bake-")
    chrome = subprocess.Popen([
        find_chrome(), "--headless=new", "--disable-gpu", "--no-first-run",
        f"--user-data-dir={profile}", "--remote-debugging-port=0", url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"baking {args.size}x{args.size // 2} textures -> {os.path.relpath(OUT, ROOT)}")
    try:
        ok = done.wait(args.timeout)
    finally:
        chrome.kill()
        chrome.wait()
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    if not ok:
        sys.exit("timed out waiting for the bake page")
    if result["status"] != "ok":
        sys.exit(result["status"])
    print("done")


if __name__ == "__main__":
    main()
