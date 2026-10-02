#!/usr/bin/env python3
"""Crude undefined-reference scan for a generated JS bundle.

Lists every identifier that is called as a function but never declared in the
file and is not a known browser/node global. Good enough to catch a slice that
was moved to another file without moving its helpers.
"""

import io
import re
import sys

GLOBALS = set("""
window document navigator location history console setTimeout clearTimeout
setInterval clearInterval requestAnimationFrame cancelAnimationFrame fetch
alert confirm prompt btoa atob unescape escape parseInt parseFloat isFinite
isNaN Date Math JSON Object Array String Number Boolean RegExp Error Promise
Symbol Map Set WeakMap Intl URL URLSearchParams localStorage sessionStorage
performance crypto structuredClone TextEncoder TextDecoder PromiseProxy
encodeURIComponent decodeURIComponent decodeURI encodeURI undefined NaN
Infinity Function this arguments null true false if for while do return
typeof void delete new switch case break continue try catch finally throw
class extends super yield await async of in instanceof
""".split())

DECL = [
    re.compile(r"\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)"),
    re.compile(r"\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)"),
    re.compile(r"(?:^|[,{;]\s*)([A-Za-z_$][\w$]*)\s*:\s*function"),
]
CALL = re.compile(r"(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(")


def declared(text):
    names = set()
    for rx in DECL:
        names.update(rx.findall(text))
    # catch-all: anything appearing as `name =` or `name:` or `function(name)`
    names.update(re.findall(r"\b([A-Za-z_$][\w$]*)\s*=", text))
    names.update(re.findall(r"([A-Za-z_$][\w$]*)\s*:", text))
    names.update(re.findall(r"function\s*\([^)]*?\b([A-Za-z_$][\w$]*)", text))
    names.update(re.findall(r"function\s*\([^)]*?,\s*([A-Za-z_$][\w$]*)", text))
    names.update(re.findall(r"\(([^)]*)\)\s*=>", text and text) and
                 re.findall(r"\(([^)]*)\)\s*=>", text)[0].replace(",", " ").split())
    return names


def main():
    path = sys.argv[1]
    text = io.open(path, encoding="utf-8").read()
    known = declared(text) | GLOBALS
    missing = []
    for m in CALL.finditer(text):
        name = m.group(1)
        if name in known:
            continue
        line = text.count("\n", 0, m.start()) + 1
        missing.append((line, name))
    seen = set()
    for line, name in missing:
        if name in seen:
            continue
        seen.add(name)
        print("%s:%d  %s" % (path, line, name))
    print("-- %d candidate(s)" % len(seen))


if __name__ == "__main__":
    main()