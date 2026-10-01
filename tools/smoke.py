#!/usr/bin/env python3
"""Smoke-test the split site against the dev server.

Fetches every route, then follows every local href/src on each page and checks
that it resolves. A page that 200s but points at a missing stylesheet or script
is just as broken as one that 404s, so both are reported.

    node serve/server.mjs --port 5199
    python tools/smoke.py http://localhost:5199
"""
import re
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

ROUTES = [
    "/", "/auth/login", "/auth/signup",
    "/app/check", "/app/send", "/app/library", "/app/alerts", "/app/checking",
    "/app/verdict", "/app/history", "/app/settings", "/app/scam",
    "/desk/login", "/desk/overview", "/desk/live", "/desk/radar",
    "/desk/business", "/desk/case",
]

REF = re.compile(r'(?:href|src)="([^"]+)"')

failures = []
checked_assets = set()


def get(url):
    try:
        with urlopen(url, timeout=10) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except HTTPError as e:
        return e.code, "", b""
    except URLError as e:
        print("cannot reach %s (%s)" % (url, e.reason))
        sys.exit(2)


def main(base):
    print("== routes ==")
    for route in ROUTES:
        url = base + route
        status, ctype, body = get(url)
        text = body.decode("utf-8", "replace")
        ok = status == 200 and "text/html" in ctype
        # The root document is a redirect, so it must NOT be a full app page.
        if route == "/":
            ok = ok and "/app/check" in text and len(text) < 2000
            note = "front door"
        else:
            note = "%d bytes" % len(body)
        print("%-4s %-16s %-26s %s" % (status, route, ctype.split(";")[0], note))
        if not ok:
            failures.append("route %s -> %s %s" % (route, status, ctype))

        if not ok or route == "/":
            continue
        for ref in REF.findall(text):
            if ref.startswith(("http://", "https://", "mailto:", "tel:", "data:", "#")):
                continue
            target = urljoin(url, ref.split("#")[0])
            if target in checked_assets:
                continue
            checked_assets.add(target)
            st, ct, _ = get(target)
            if st != 200:
                failures.append("%s references %s -> %s" % (route, ref, st))

    print()
    print("== local assets resolved: %d unique ==" % len(checked_assets))
    if failures:
        print()
        print("FAILURES (%d):" % len(failures))
        for f in failures:
            print("  - " + f)
        return 1
    print("all %d routes and %d asset references OK" % (len(ROUTES), len(checked_assets)))
    return 0


if __name__ == "__main__":
    sys.exit(main((sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5199").rstrip("/")))
