"""Extract the original single-file build into reusable parts.

Reads build/monolith.html (the original merged single-file build) and writes
the three CSS blocks, the two JS blocks and the markup slices to a working
directory so they can be reviewed and split into modules. Nothing is rewritten
here — this is a pure slice.

The source lives under build/ on purpose: the split site owns ./index.html, and
a generator that reads the file it writes would eat its own input.
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "monolith.html"
OUT = ROOT / "build" / "extracted"

# 1-based inclusive line ranges into the monolith.
#
# These numbers drift the moment anything above them in the file changes, and
# they used to drift *silently*: a stale end line quietly truncated the last few
# lines of the customer bundle, and the next patch in tools/build_customer_js.py
# failed with "patch target not found" long after the real cause. So every block
# carries an anchor instead. The anchor is searched for, and the recorded number
# is only a fallback plus a sanity check — if the anchor cannot be found, or the
# anchored slice does not contain the required sentinels, extraction stops.
#
#   start  regex that must match the first line of the block
#   end    regex that must match the last line of the block
#   must   substrings that must appear somewhere in the slice
BLOCKS = {
    "shell.css": {
        "lines": (51, 60),
        "start": r"^/\*.*GLOBAL SHELL",
        "end": r"^\}$",
        "must": ["box-sizing:border-box"],
    },
    "customer.css": {
        "lines": (67, 464),
        "start": r"^@scope \(#customerRoot\) \{",
        "end": r"^\}$",
        "must": ["--brand"],
    },
    "desk.css": {
        "lines": (471, 1111),
        "start": r"^@scope \(#deskRoot\) \{",
        "end": r"^\}$",
        "must": ["#deskRoot", ".session-chip"],
    },
    "customer.js": {
        "lines": (2053, 4376),
        "start": r"^\"use strict\";$",
        "end": r"^\}\)\(\);$",
        "must": [
            "var DEFAULT_API = 'http://localhost:8000/api/v1';",
            "window.__ntiyisoCustomer",
            "$('staffCodeBlock')",
            "function fuse(",
        ],
    },
    "desk.js": {
        "lines": (4383, 6171),
        "start": r"^\"use strict\";$",
        "end": r"^\}\)\(\);$",
        "must": ["__ntiyisoDesk", "handOff(", "DESK_ROOT"],
    },
}

# The markup the page builder reuses. Each slice is cut at a boundary that still
# makes sense on its own, so a page gets real markup rather than a retyped copy.
MARKUP = {
    # -- customer app ------------------------------------------------------
    # Lockup, heading, sub-line and the storage notice. The <div class="auth">
    # and <div class="auth-inner"> wrappers sit on 1126-1127 and close far below
    # the forms, so auth_body() supplies them instead of carrying them through.
    "m_auth_head": (1128, 1131),      # lockup + heading + storage notice
    "m_auth_step1": (1132, 1151),     # role picker
    # The back button only. The source opens <div id="authStep2"> on the line
    # above and closes it far below, past the form; build_pages.auth_body()
    # supplies both tags around the pieces it stitches together, so including
    # the opening one here would give the page two elements with that id.
    "m_auth_step2": (1153, 1156),     # back button
    "m_auth_note": (1161, 1161),      # #authNote
    "m_auth_signup": (1162, 1177),    # sign-up form (with its staff-code field)
    "m_auth_signin": (1178, 1188),    # sign-in form (with its staff-code field)
    "m_auth_social": (1189, 1206),    # divider + provider buttons + disclaimer
    "m_cust_appbar": (1212, 1228),    # logo, settings, sign out
    "m_cust_tabbar": (1230, 1248),    # four tabs + alert dot
    "m_toasts": (1271, 1271),
    # -- fraud desk --------------------------------------------------------
    "m_desk_login": (1280, 1340),     # the whole sign-in screen
    "m_grain": (1342, 1342),
    "m_desk_header": (1344, 1369),
    "m_shell_open": (1371, 1372),
    "m_view_home": (1374, 1400),
    "m_view_live": (1403, 1608),
    "m_view_queue": (1611, 1694),
    "m_view_business": (1697, 1876),
    "m_view_case": (1879, 1932),
    "m_main_close": (1933, 1933),
    "m_desk_rail": (1935, 1974),
    "m_shell_close": (1975, 1975),
    "m_desk_footer": (1977, 1988),
    "m_liveness_modal": (1990, 2015),
    # The source is one </div> short: 2044 is blank where the tag closing
    # #settingsModal should be, and the browser only papered over it by
    # borrowing the </div> meant for #deskRoot. In the split that would leave
    # #deskToasts inside the modal, so desk_chrome() closes it explicitly.
    "m_settings_modal": (2017, 2043),
    "m_desk_toasts": (2045, 2045),
}


def resolve_blocks(lines) -> dict:
    """Resolve every block's start, then bound each end by the next block's start.

    A block ends where the next one begins, so the end anchor is only ever
    searched inside that window. Searching to the end of the file instead would
    let the customer bundle swallow the desk bundle, because both close with the
    same `})();`.
    """
    import re

    names = list(BLOCKS)
    starts = {}
    for name in names:
        spec = BLOCKS[name]
        pattern = re.compile(spec["start"])
        found = None
        for index in range(spec["lines"][0] - 1, len(lines)):
            if pattern.match(lines[index].rstrip("\n")):
                found = index
                break
        if found is None:
            sys.exit(f"{name}: could not find the start anchor {spec['start']!r}")
        starts[name] = found

    # Blocks must resolve in file order, otherwise "the next block" is ambiguous.
    ordered = sorted(names, key=lambda n: starts[n])
    if ordered != names:
        sys.exit(
            "BLOCKS are listed out of file order: "
            + ", ".join(f"{n}@{starts[n] + 1}" for n in ordered)
        )

    resolved = {}
    for position, name in enumerate(names):
        spec = BLOCKS[name]
        pattern = re.compile(spec["end"])
        stop = starts[names[position + 1]] if position + 1 < len(names) else len(lines)
        end = None
        for index in range(stop - 1, starts[name], -1):
            if pattern.match(lines[index].rstrip("\n")):
                end = index
                break
        if end is None:
            sys.exit(f"{name}: could not find the end anchor {spec['end']!r}")

        chunk = "".join(lines[starts[name] : end + 1])
        missing = [needle for needle in spec["must"] if needle not in chunk]
        if missing:
            sys.exit(
                f"{name}: anchored slice {starts[name] + 1}-{end + 1} is missing "
                + ", ".join(repr(m) for m in missing)
                + " — the anchor matched the wrong place"
            )
        resolved[name] = (starts[name] + 1, end + 1, chunk)
    return resolved


def main() -> int:
    lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)
    OUT.mkdir(parents=True, exist_ok=True)

    for name, (start, end, chunk) in resolve_blocks(lines).items():
        (OUT / name).write_text(chunk, encoding="utf-8")
        print(f"{name:>14}  lines {start:>5}-{end:<5}  {len(chunk):>7,} bytes")

    markup_dir = OUT / "markup"
    markup_dir.mkdir(parents=True, exist_ok=True)
    for name, (start, end) in MARKUP.items():
        chunk = "".join(lines[start - 1 : end])
        (markup_dir / (name + ".html")).write_text(chunk, encoding="utf-8")
        print(f"{name:>14}  lines {start:>5}-{end:<5}  {len(chunk):>7,} bytes")

    return 0


if __name__ == "__main__":
    sys.exit(main())
