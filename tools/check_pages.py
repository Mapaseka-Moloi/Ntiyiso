#!/usr/bin/env python3
"""Check the generated pages: nav links, aria-current, and asset wiring."""
import glob
import re
import sys

problems = []


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


print("== desk pages ==")
for p in sorted(glob.glob("desk/*/index.html")):
    t = read(p)
    if "login" in p.split("\\")[-2:][0] or "/login/" in p.replace("\\", "/"):
        print("%-24s login screen (no rail expected)" % p)
        if "<aside" in t:
            problems.append("%s: login should have no rail" % p)
        continue
    rail_open = t.count('<aside class="rail">')
    rail_close = t.count("</aside>")
    nav = re.findall(r'<a data-view="(\w+)" href="([^"]+)"([^>]*)>', t)
    current = [v for v, _, rest in nav if 'aria-current="page"' in rest]
    print("%-24s aside %d/%d  nav %d  current=%s"
          % (p, rail_open, rail_close, len(nav), current))
    if rail_open != 1 or rail_close != 1:
        problems.append("%s: rail open/close %d/%d" % (p, rail_open, rail_close))
    if len(nav) != 5:
        problems.append("%s: expected 5 rail links, got %d" % (p, len(nav)))
    if len(current) != 1:
        problems.append("%s: expected exactly 1 aria-current, got %s" % (p, current))
    for view, href, _ in nav:
        if not href.startswith("/desk/"):
            problems.append("%s: non-absolute rail href %s" % (p, href))
    # Every view section on the page must be the active one, and only that one.
    ons = re.findall(r'<section id="view-(\w+)" class="view on"', t)
    if len(ons) != 1:
        problems.append("%s: expected 1 active view section, got %s" % (p, ons))

print()
print("== customer app pages ==")
for p in sorted(glob.glob("app/*/index.html")):
    t = read(p)
    tabs = re.findall(r'<a class="tabbar-link" href="(/app/\w+)"([^>]*)>', t)
    current = [h for h, rest in tabs if 'aria-current="page"' in rest]
    print("%-24s tabs %d  current=%s" % (p, len(tabs), current))
    if len(tabs) != 4:
        problems.append("%s: expected 4 tab links, got %d" % (p, len(tabs)))
    for h, _ in tabs:
        if h != "/app/" + h.rsplit("/", 1)[1]:
            problems.append("%s: odd tab href %s" % (p, h))

print()
print("== auth pages ==")
for p in sorted(glob.glob("auth/*/index.html")):
    t = read(p)
    tabs = re.findall(r'<a href="(/auth/\w+)"([^>]*)>', t)
    current = [h for h, rest in tabs if 'aria-current="page"' in rest]
    forms = re.findall(r'<form[^>]*id="(\w+)"', t)
    print("%-24s tabs %s  current=%s  forms=%s" % (p, [h for h, _ in tabs], current, forms))
    if len(current) != 1:
        problems.append("%s: expected 1 aria-current, got %s" % (p, current))
    if len(forms) != 1:
        problems.append("%s: expected 1 form, got %s" % (p, forms))

print()
print("== element ids: duplicates and balance ==")
for p in sorted(glob.glob("*/*/index.html")) + ["index.html"]:
    t = read(p)
    ids = re.findall(r'\sid="([^"]+)"', t)
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        problems.append("%s: duplicate id(s) %s" % (p, ", ".join(dupes)))
    # Every open tag of these kinds has to be matched, or the page nests wrong.
    for tag in ("div", "section", "nav", "aside", "main", "form", "header", "footer"):
        o = len(re.findall(r"<%s[\s>]" % tag, t))
        c = len(re.findall(r"</%s>" % tag, t))
        if o != c:
            problems.append("%s: <%s> opened %d times, closed %d" % (p, tag, o, c))
    print("%-24s %3d ids, %s" % (p, len(ids), "unique" if not dupes else "DUPLICATES"))

print()
print("== leftovers: inline logo data-URIs / old <button> nav ==")
for p in sorted(glob.glob("*/*/index.html")) + ["index.html"]:
    t = read(p)
    if "data:image/svg+xml" in t:
        problems.append("%s: still has an inline SVG logo" % p)
    if re.search(r'<button[^>]*data-go=', t):
        problems.append("%s: still has a data-go button" % p)
    if re.search(r'<button[^>]*data-scam=', t):
        problems.append("%s: still has a data-scam button" % p)
    if re.search(r'<button[^>]*data-view=', t):
        problems.append("%s: still has a data-view button" % p)
print("scanned %d documents" % (len(glob.glob("*/*/index.html")) + 1))

print()
if problems:
    print("PROBLEMS (%d):" % len(problems))
    for x in problems:
        print("  - " + x)
    sys.exit(1)
print("all checks passed")
