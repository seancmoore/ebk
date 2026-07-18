# Injects Open Graph / Twitter card / canonical / touch-icon tags into every
# HTML page under public/, deriving og:title and og:description from each
# page's existing <title> and meta description. Idempotent: pages that already
# have og:title are skipped. Run: python tools/add_social_meta.py
import re
from pathlib import Path

SITE = "https://eliteballknowledge.web.app"
PUB = Path("public")


def clean_url(p: Path) -> str:
    rel = p.relative_to(PUB).as_posix()
    if rel == "index.html":
        return SITE + "/"
    if rel.endswith("/index.html"):
        return SITE + "/" + rel[: -len("/index.html")]
    return SITE + "/" + rel[: -len(".html")]


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace('"', "&quot;")


def block(title, desc, url, noindex):
    lines = []
    if noindex:
        lines.append('<meta name="robots" content="noindex" />')
    lines += [
        '<link rel="canonical" href="%s" />' % url,
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="EBK — Elite Ball Knowledge" />',
        '<meta property="og:title" content="%s" />' % esc(title),
        '<meta property="og:description" content="%s" />' % esc(desc),
        '<meta property="og:url" content="%s" />' % url,
        '<meta property="og:image" content="%s/img/og.png" />' % SITE,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        '<meta property="og:image:alt" content="EBK — Elite Ball Knowledge. Prove it." />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="%s" />' % esc(title),
        '<meta name="twitter:description" content="%s" />' % esc(desc),
        '<meta name="twitter:image" content="%s/img/og.png" />' % SITE,
        '<link rel="apple-touch-icon" href="/img/apple-touch-icon.png" />',
    ]
    return "".join("  %s\n" % ln for ln in lines)


def main():
    changed = skipped = 0
    for p in sorted(PUB.rglob("*.html")):
        html = p.read_text(encoding="utf-8")
        if 'property="og:title"' in html:
            skipped += 1
            continue
        mt = re.search(r"<title>(.*?)</title>", html, re.S)
        md = re.search(r'<meta name="description" content="(.*?)"', html, re.S)
        if not mt:
            print("!! no <title>:", p)
            continue
        title = mt.group(1).strip()
        desc = (md.group(1).strip() if md else "EBK — sports trivia games. Prove your ball knowledge.")
        noindex = p.relative_to(PUB).as_posix().startswith(("admin/", "dashboard/"))
        ins = block(title, desc, clean_url(p), noindex)
        # insert right after the </title> line
        html = re.sub(r"(<title>.*?</title>\s*\n)", r"\1" + ins.replace("\\", "\\\\"), html, count=1, flags=re.S)
        p.write_text(html, encoding="utf-8", newline="\n")
        changed += 1
    print(f"updated {changed}, skipped {skipped}")


if __name__ == "__main__":
    main()
