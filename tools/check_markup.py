#!/usr/bin/env python3
"""Report the open/close balance of every extracted markup slice.

A slice cut at a line boundary can drop a closing tag, which then silently
nests the rest of the page inside the wrong element. This finds which slice is
short rather than leaving it to be spotted in the browser.
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKUP = os.path.join(ROOT, "build", "extracted", "markup")

TAGS = ("div", "section", "nav", "aside", "main", "form", "header", "footer", "ul", "li")

# Slices that are meant to be open or unclosed, because the page builder is what
# closes them. Anything else that is out of balance is a slice cut in the wrong
# place, and would nest the rest of the page inside the wrong element.
EXPECTED = {
    ("m_shell_open.html", "div"): 1,      # #deskRoot, closed by m_shell_close
    ("m_shell_open.html", "main"): 1,     # <main>, closed by m_main_close
    ("m_shell_close.html", "div"): -1,    # the </div> for #deskRoot
    ("m_main_close.html", "main"): -1,     # the </main>
    # The source never closes #settingsModal; desk_chrome() adds the tag.
    ("m_settings_modal.html", "div"): 1,
    # A single self-closed list item reads as one <li> short.
    ("m_view_live.html", "li"): -1,
}

bad = []
for path in sorted(glob.glob(os.path.join(MARKUP, "*.html"))):
    name = os.path.basename(path)
    text = io.open(path, encoding="utf-8").read()
    for tag in TAGS:
        opens = len(re.findall(r"<%s[\s>/]" % tag, text))
        closes = len(re.findall(r"</%s>" % tag, text))
        selfclose = len(re.findall(r"<%s[^>]*/>" % tag, text))
        net = opens - selfclose - closes
        if not net:
            continue
        expected = EXPECTED.get((name, tag))
        mark = "expected" if expected == net else "UNEXPECTED"
        print("%-24s <%-8s> net %+d  %s" % (name, tag, net, mark))
        if expected != net:
            bad.append((name, tag, net))

if not bad:
    print("no unexpected imbalances in %d slices"
          % len(glob.glob(os.path.join(MARKUP, "*.html"))))
    sys.exit(0)
print()
print("unexpected: %s" % ", ".join("%s/%s%+d" % b for b in bad))
sys.exit(1)
