#!/usr/bin/env python3
"""Run every check for the split site, in the order that catches problems earliest.

    python tools/check_all.py              # check what is on disk
    python tools/check_all.py --rebuild    # regenerate first, then check

The order matters. The cheap structural checks run first because a duplicated
id or an unclosed tag explains most of the failures the browser would report,
and it reports them in a second instead of a minute. The browser runs are last
because they are the only ones that prove the bundles execute.

A dev server is started for the HTTP checks and stopped at the end, and so is the
API — twice, once per implementation, because the stdlib fallback and FastAPI
have to be indistinguishable from outside.
"""

import argparse
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(label, argv, capture=True):
    """Run one step; return True when it passed."""
    print("\n" + "=" * 72)
    print("  " + label)
    print("=" * 72)
    proc = subprocess.run(argv, cwd=ROOT, capture_output=capture, text=True,
                          encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        sys.stdout.write(proc.stdout or "")
        sys.stderr.write(proc.stderr or "")
        print("  FAILED (exit %d)" % proc.returncode)
        return False
    if capture:
        out = (proc.stdout or "").rstrip().split("\n")
        print("  " + (out[-1] if out and out[-1] else "ok"))
    return True


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for(url, seconds=10):
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1):
                return True
        except urllib.error.HTTPError:
            return True          # responded, even if 404
        except Exception:
            time.sleep(0.2)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true",
                    help="regenerate everything from build/monolith.html first")
    args = ap.parse_args()

    py = sys.executable
    ok = True

    if args.rebuild:
        for label, script in [
            ("slice the monolith", "extract.py"),
            ("split the stylesheets", "split_css.py"),
            ("build the customer library", "build_customer_js.py"),
            ("build the desk library", "build_desk_js.py"),
            ("compose the pages", "build_pages.py"),
        ]:
            ok &= run(label, [py, os.path.join("tools", script)])

    # Every bundle has to parse before anything tries to run it.
    print("\n" + "=" * 72)
    print("  every JavaScript file parses")
    print("=" * 72)
    broken = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in
                       (".git", "node_modules", "build", "tools")]
        for name in filenames:
            if not name.endswith(".js"):
                continue
            path = os.path.join(dirpath, name)
            if subprocess.run(["node", "--check", path],
                              capture_output=True).returncode != 0:
                broken.append(os.path.relpath(path, ROOT))
    if broken:
        ok = False
        for b in broken:
            print("  FAILED: " + b)
    else:
        print("  ok")

    ok &= run("markup slices are cut where the builder expects",
              [py, os.path.join("tools", "check_markup.py")])
    ok &= run("page structure: links, current tab, unique ids, no leftovers",
              [py, os.path.join("tools", "check_pages.py")])

    # The engine exists twice — once in the browser bundle, once in the Python
    # package — so both halves get checked here rather than only in a review.
    ok &= run("the backend imports with nothing installed",
              [py, "-c", "import backend.engine, backend.store, backend.i18n, backend.standalone"])
    ok &= run("the detection engine behaves on the labelled fixtures",
              [py, os.path.join("tools", "eval_fixtures.py")])
    ok &= run("the two engines agree with each other",
              [py, os.path.join("tools", "parity_check.py")])

    # The API is checked against a real server on both implementations, because
    # a contract test that calls the handler directly would miss the parts that
    # only exist once HTTP is involved: status codes, headers, CORS, and the
    # error shape the client parses.
    for label, extra in (("stdlib server", ["--standalone"]), ("FastAPI", [])):
        api_port = free_port()
        api_base = "http://127.0.0.1:%d/api/v1" % api_port
        api_env = dict(os.environ)
        api_env["NTIYISO_DB"] = os.path.join(tempfile.gettempdir(),
                                            "ntiyiso_check_%d.db" % api_port)
        api = subprocess.Popen(
            [py, "-m", "backend", "--port", str(api_port)] + extra,
            cwd=ROOT, env=api_env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            if not wait_for(api_base + "/health"):
                print("  API server did not start on %d" % api_port)
                ok = False
            else:
                ok &= run("the API honours its contract (%s)" % label,
                          [py, os.path.join("tools", "api_check.py"), api_base])
                # The WhatsApp shield page has its own route at the server root,
                # not under /api/v1, because it predates the rest of the API.
                # Checked against both servers for the same reason api_check is:
                # a route that exists on one implementation and not the other is
                # exactly the failure these contract tests exist to catch.
                ok &= run("the WhatsApp shield contract holds (%s)" % label,
                          [py, os.path.join("tools", "shield_check.py"),
                           api_base.rsplit("/api/v1", 1)[0]])
        finally:
            api.terminate()
            try:
                api.wait(timeout=5)
            except subprocess.TimeoutExpired:
                api.kill()
            for suffix in ("", "-wal", "-shm"):
                try:
                    os.remove(api_env["NTIYISO_DB"] + suffix)
                except OSError:
                    pass

    # The browser checks need a server.
    port = free_port()
    base = "http://127.0.0.1:%d" % port
    server = subprocess.Popen(
        ["node", os.path.join(ROOT, "serve", "server.mjs"), "--port", str(port)],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not wait_for(base + "/"):
            print("dev server did not start on %d" % port)
            return 1
        ok &= run("every route and asset resolves", [py, os.path.join("tools", "smoke.py"), base])
        ok &= run("every page runs without a JavaScript error",
                  ["node", os.path.join(ROOT, "tools", "browser_check.mjs"), base], capture=False)
        ok &= run("the flows that cross documents still work",
                  ["node", os.path.join(ROOT, "tools", "flow_check.mjs"), base], capture=False)
        # Last, because it drives the browser through every route and is the
        # slowest of the four. It exists because the flow check above talks to
        # elements by selector: a control that is on the page, wired up and
        # display:none answers a synthetic event and passes. This asks whether
        # anything has area on screen instead.
        ok &= run("nothing a person needs is invisible",
                  ["node", os.path.join(ROOT, "tools", "check_visible.mjs"), base], capture=False)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    print("\n" + "=" * 72)
    if ok:
        print("  ALL CHECKS PASSED")
        return 0
    print("  SOMETHING FAILED — see above")
    return 1


if __name__ == "__main__":
    sys.exit(main())
