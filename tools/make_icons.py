#!/usr/bin/env python3
"""Generate the PWA icons from the one logo the project already has.

    pip install pillow
    python tools/make_icons.py

Run it when assets/logo.png changes. The output files are committed, so nobody
else needs Pillow to build or run the site — this is a one-off, not a build
step, and nothing in tools/check_all.py depends on it.

Why icons at all: a fraud checker lives on a phone, and the phone's browser will
happily offer "add to home screen". Without an icon it adds a grey letter, which
looks like a broken app on the one screen people will actually keep open.

The maskable variant is the one Android uses when the launcher crops your icon
to its own shape. Android may cut 20% off every edge, so the logo is inset to
60% on a solid background and anything important stays inside the safe zone.
"""

import os

try:
    from PIL import Image
except ImportError:
    raise SystemExit(
        "This one script needs Pillow: pip install pillow\n"
        "(Only to regenerate the icons. They are committed, so the site itself "
        "never needs it.)")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "assets", "logo.png")

#: Android crops up to 20% off each edge, so the safe zone is the middle 60%.
MASKABLE_INSET = 0.20

#: The brand's own dark, so a maskable icon does not crop onto transparency.
MASKABLE_BACKGROUND = (14, 18, 28)

TARGETS = [
    # name,                    size,  maskable
    ("assets/icon-192.png",      192, False),
    ("assets/icon-512.png",      512, False),
    ("assets/icon-maskable.png", 512, True),
]


def make_maskable(logo, size):
    """Centre the logo on a solid square, inset by the launcher's crop."""
    canvas = Image.new("RGB", (size, size), MASKABLE_BACKGROUND)
    inner = int(size * (1 - 2 * MASKABLE_INSET))
    resized = logo.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(resized, (offset, offset))
    return canvas


def make_plain(logo, size):
    """The logo on transparency, which is what desktop and iOS use."""
    resized = logo.resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, (0, 0), resized if resized.mode == "RGBA" else None)
    return canvas


def main():
    if not os.path.exists(SOURCE):
        raise SystemExit("missing %s — nothing to derive icons from" % SOURCE)

    logo = Image.open(SOURCE)
    if logo.mode != "RGBA":
        logo = logo.convert("RGBA")

    for relative, size, maskable in TARGETS:
        image = make_maskable(logo, size) if maskable else make_plain(logo, size)
        path = os.path.join(ROOT, *relative.split("/"))
        image.save(path, "PNG", optimize=True)
        print("  %-28s %4dpx  %6.1f kB"
              % (relative, size, os.path.getsize(path) / 1024))

    print("\n  committed — nothing in the build regenerates these")


if __name__ == "__main__":
    main()
