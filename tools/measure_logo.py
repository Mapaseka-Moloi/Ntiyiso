"""Measure assets/logo.png: canvas size and the bounding box of visible ink.

A square canvas can still be mostly padding, which is why a logo that is
"1254x1254" can render as a speck. This reports where the content actually sits
so the CSS can size against the artwork rather than the canvas.
"""
from PIL import Image

im = Image.open("assets/logo.png").convert("RGBA")
w, h = im.size
alpha = im.getchannel("A")
bbox = alpha.getbbox()

print("canvas       %dx%d" % (w, h))
print("alpha bbox   %s" % (bbox,))
if bbox:
    bw = bbox[2] - bbox[0]
    bh = bbox[3] - bbox[1]
    print("ink box      %dx%d" % (bw, bh))
    print("ink share    %.1f%% wide, %.1f%% tall" % (100 * bw / w, 100 * bh / h))
    print("aspect       %.3f (w/h)" % (bw / bh))
    print("margins      left %d  right %d  top %d  bottom %d"
          % (bbox[0], w - bbox[2], bbox[1], h - bbox[3]))
    print()
    print("What that means at a rendered height of H, the visible art is H*%.2f tall"
          % (bh / h))
    print("and the visible width is H*%.2f" % (bh / h * (bw / bh)))

# How much colour is actually there, so we can tell a mark from a wordmark.
px = im.load()
cols = set()
for y in range(0, h, 7):
    for x in range(0, w, 7):
        r, g, b, a = px[x, y]
        if a > 24:
            cols.add((r // 48, g // 48, b // 48))
print("\ndistinct coarse colours in the ink: %d" % len(cols))