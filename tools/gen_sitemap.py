# Generates public/sitemap.xml from the HTML pages under public/, excluding
# admin, dashboard, and the 404 page. Run after adding/removing routes:
#   python tools/gen_sitemap.py
from datetime import date
from pathlib import Path

SITE = "https://eliteballknowledge.web.app"
PUB = Path("public")
SKIP = ("admin/", "dashboard/", "404.html", "deep-bag/write/", "deep-bag/post/")


def clean_url(p: Path) -> str:
    rel = p.relative_to(PUB).as_posix()
    if rel == "index.html":
        return SITE + "/"
    if rel.endswith("/index.html"):
        return SITE + "/" + rel[: -len("/index.html")]
    return SITE + "/" + rel[: -len(".html")]


urls = sorted(
    clean_url(p)
    for p in PUB.rglob("*.html")
    if not p.relative_to(PUB).as_posix().startswith(SKIP)
)
today = date.today().isoformat()
lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    lines.append(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>")
lines.append("</urlset>")
(PUB / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
print(f"wrote public/sitemap.xml with {len(urls)} urls")
