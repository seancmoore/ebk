# Generates the branded Open Graph image (1200x630) and apple-touch-icon (180x180)
# using the site's design tokens: navy #0a0e1c, green #3ddc97, indigo #5b7cff.
# Run: python tools/gen_og.py   (from repo root; requires Pillow)
import math
from PIL import Image, ImageDraw, ImageFont

NAVY = (10, 14, 28)
NAVY2 = (18, 26, 50)
GREEN = (61, 220, 151)
INDIGO = (91, 124, 255)
TEXT = (243, 246, 255)
MUTED = (154, 166, 204)

FONTS = r"C:\Windows\Fonts"


def font(name, size):
    return ImageFont.truetype(rf"{FONTS}\{name}", size)


def radial_glow(img, cx, cy, radius, color, peak):
    """Additively blend a radial glow of `color` centered at (cx, cy)."""
    px = img.load()
    w, h = img.size
    x0, x1 = max(0, cx - radius), min(w, cx + radius)
    y0, y1 = max(0, cy - radius), min(h, cy + radius)
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = math.hypot(x - cx, y - cy) / radius
            if d < 1:
                a = peak * (1 - d) ** 2
                r, g, b = px[x, y]
                px[x, y] = (
                    min(255, int(r + color[0] * a)),
                    min(255, int(g + color[1] * a)),
                    min(255, int(b + color[2] * a)),
                )


def make_og():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), NAVY)
    # vertical navy gradient
    px = img.load()
    for y in range(H):
        t = y / H
        px_row = tuple(int(NAVY2[i] * (1 - t) + NAVY[i] * t) for i in range(3))
        for x in range(W):
            px[x, y] = px_row
    radial_glow(img, 1080, 40, 520, INDIGO, 0.16)
    radial_glow(img, 90, 560, 460, GREEN, 0.10)

    d = ImageDraw.Draw(img)
    # faint pitch/court line motif
    for r in (140, 210, 280):
        d.ellipse([W - 300 - r, H - 160 - r, W - 300 + r, H - 160 + r],
                  outline=(255, 255, 255, 12), width=2)
    d.line([(0, H - 6), (W, H - 6)], fill=GREEN, width=6)

    wordmark = font("seguibl.ttf", 230)   # Segoe UI Black
    sub = font("segoeuib.ttf", 52)
    tag = font("seguibl.ttf", 76)

    # EBK wordmark, B in green (matches site header)
    x = 90
    y = 110
    for ch, col in (("E", TEXT), ("B", GREEN), ("K", TEXT)):
        d.text((x, y), ch, font=wordmark, fill=col)
        x += d.textlength(ch, font=wordmark) + 8

    d.text((96, 400), "ELITE BALL KNOWLEDGE", font=sub, fill=MUTED)
    d.text((96, 480), "Prove it.", font=tag, fill=GREEN)

    img.save(r"public\img\og.png", optimize=True)
    print("wrote public/img/og.png", img.size)


def make_touch_icon():
    S = 180
    img = Image.new("RGB", (S, S), NAVY)
    radial_glow(img, 160, 10, 170, INDIGO, 0.18)
    radial_glow(img, 20, 170, 150, GREEN, 0.12)
    d = ImageDraw.Draw(img)
    f = font("seguibl.ttf", 74)
    text = "EBK"
    w = d.textlength(text, font=f)
    x = (S - w) / 2
    bbox = d.textbbox((0, 0), text, font=f)
    y = (S - (bbox[3] - bbox[1])) / 2 - bbox[1]
    for ch, col in (("E", TEXT), ("B", GREEN), ("K", TEXT)):
        d.text((x, y), ch, font=f, fill=col)
        x += d.textlength(ch, font=f)
    img.save(r"public\img\apple-touch-icon.png", optimize=True)
    print("wrote public/img/apple-touch-icon.png", img.size)


if __name__ == "__main__":
    make_og()
    make_touch_icon()
