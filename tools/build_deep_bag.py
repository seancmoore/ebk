# EBK Deep Bag · static article publisher.
#
# Long-form studies are written outside the repo (Desktop\ebk-*\reports) as
# self-contained HTML: their own <style>, inline SVG charts, no scripts. This
# tool snapshots one into content/deep-bag/<slug>/ and bakes it into a real
# static page at /deep-bag/<slug>, so every article gets server-side title,
# description, canonical and share-card tags (crawlers and link previews do not
# run JS, which the Firestore posts in /deep-bag/write can't offer).
#
#   python tools/build_deep_bag.py import <article.html> --slug fresh-start-myth
#          [--report <report.html>] [--share <1200x630.png>]
#          [--tags nfl,trades] [--sports nfl]      # new slug -> draft
#   python tools/build_deep_bag.py publish <slug> [--date YYYY-MM-DD]
#   python tools/build_deep_bag.py unpublish <slug>
#   python tools/build_deep_bag.py            # rebuild everything
#   python tools/build_deep_bag.py list
#
# Re-running import on an existing slug refreshes the HTML (a new article
# version) and keeps status/date/tags. Drafts are built to
# public/deep-bag/.drafts/<slug>/ for local preview only: that folder is
# gitignored and excluded from Firebase Hosting, so a draft cannot ship.
#
# Deep Bag v2 (docs/deep-bag-v2.md): a study whose <head> carries
# <meta name="deep-bag-version" content="2"> is rendered with the v2 chrome
# (public/css/deep-bag-v2.css + public/js/deep-bag-v2.js: editorial type,
# 3D hero scene, interactive 3D/2D charts from inline JSON, the looping clip).
# Older studies keep the original template until they are migrated.
#
# Outputs: public/deep-bag/<slug>/index.html (+ report/index.html, share.png),
# public/data/deep-bag.json (the index page's list), public/deep-bag/feed.xml,
# and a sitemap refresh. Python stdlib only, like the rest of tools/.
import argparse
import html
import json
import re
import runpy
import shutil
import sys
from urllib.parse import quote
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "deep-bag"
PUB = ROOT / "public"
OUT = PUB / "deep-bag"
DRAFTS = OUT / ".drafts"
MANIFEST = PUB / "data" / "deep-bag.json"
FEED = OUT / "feed.xml"
SITE = "https://eliteballknowledge.web.app"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# Paths under /deep-bag that already belong to something else.
RESERVED = {"post", "write", "feed", "index", "report", "drafts"}


def die(msg):
    print("error: " + msg, file=sys.stderr)
    sys.exit(1)


def esc(s):
    return html.escape(str(s or ""), quote=True)


def text_of(fragment):
    """Visible text of an HTML fragment: tags out, entities decoded."""
    s = re.sub(r"<br\s*/?>", " ", fragment or "", flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


# ---------------------------------------------------------------- parsing --

# Read time counts running prose only (docs/deep-bag-v2.md, "Read time"): the
# words a reader moves through top to bottom. Figures, captions, tables (data
# fallbacks and study tables), chart source lines and keys, scripts, SVG, the
# hero's static fallback, pull quotes (lifted from the body), the colophon and
# long margin notes are skipped.
WPM = 238
ASIDE_MAX_WORDS = 80          # a margin note longer than this is reference, not reading
PROSE_SKIP_TAGS = {"figure", "figcaption", "table", "script", "style", "svg", "noscript", "template",
                   "video", "audio", "button", "nav", "select", "textarea"}
PROSE_SKIP_CLASSES = {"v2-src", "v2-data-wrap", "v2-data", "v2-key", "v2-fig-card", "v2-colophon",
                      "v2-hero-fallback", "v2-views", "v2-cue", "v2-chart-stage", "v2-film", "v2-pull"}
_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class _ProseCounter(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # (tag, skips, is_aside)
        self.skip = 0
        self.asides = []         # word counters of open asides
        self.words = 0

    def handle_starttag(self, tag, attrs):
        if tag in _VOID:
            return
        cls = set((dict(attrs).get("class") or "").split())
        skips = tag in PROSE_SKIP_TAGS or bool(cls & PROSE_SKIP_CLASSES)
        is_aside = tag == "aside" and not skips and not self.skip
        self.stack.append((tag, skips, is_aside))
        self.skip += skips
        if is_aside:
            self.asides.append(0)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, skips, is_aside in reversed(self.stack[i:]):
                    self.skip -= skips
                    if is_aside:
                        n = self.asides.pop()
                        if n <= ASIDE_MAX_WORDS:
                            self.words += n
                del self.stack[i:]
                return

    def handle_data(self, data):
        if self.skip:
            return
        n = len(data.split())
        if self.asides:
            self.asides[-1] += n
        else:
            self.words += n


def prose_words(body):
    c = _ProseCounter()
    c.feed(body)
    c.close()
    while c.asides:                       # unclosed aside at the end
        n = c.asides.pop()
        c.words += n if n <= ASIDE_MAX_WORDS else 0
    return c.words


# Study-scoped modules from the first v2 migrations whose work the shared system
# now does (scenes in public/js/deep-bag-v2-scenes/, charts in deep-bag-v2-xcharts.js).
# Their <script> tags are dropped at publish time and the files are not shipped,
# so the shared runtime draws the same markup. Delete an entry to let a study's
# own module run again.
SUPERSEDED_MODULES = {"revenge-bowl.js", "champagne-scene.js", "the-cliff-v2.js"}
_SUPERSEDED_TAG = re.compile(r'\s*<script\b[^>]*\bsrc="[^"]*?([\w.-]+\.js)"[^>]*>\s*</script>', re.I)


def drop_superseded(body):
    return _SUPERSEDED_TAG.sub(lambda m: "" if m.group(1) in SUPERSEDED_MODULES else m.group(0), body)


def split_doc(src):
    """(head, body) of a study HTML file, which may or may not have
    <html>/<head>/<body> wrappers. The body starts at <body> or at the first
    layout element."""
    m = re.search(r"<body[^>]*>", src, re.I)
    if m:
        head, body = src[: m.start()], src[m.end():]
    else:
        m = re.search(r"<(div|header|main|article|section)\b", src, re.I)
        if not m:
            die("couldn't find where the article body starts")
        head, body = src[: m.start()], src[m.start():]
    body = re.sub(r"</body>\s*(</html>)?\s*$", "", body.strip(), flags=re.I)
    return head, body


def parse_study(src):
    head, body = split_doc(src)
    body = drop_superseded(body)
    css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", head, re.S | re.I))
    fonts = re.findall(r"@import\s+url\(\s*['\"]?([^'\")]+)['\"]?\s*\)\s*;?", css)
    css = re.sub(r"@import\s+url\([^)]*\)\s*;?", "", css).strip()

    def meta(name):
        m = re.search(r'<meta\s+(?:name|property)="' + re.escape(name) + r'"\s+content="([^"]*)"', head, re.I)
        return html.unescape(m.group(1)) if m else ""

    def first(pattern, where=body):
        m = re.search(pattern, where, re.S | re.I)
        return text_of(m.group(1)) if m else ""

    def var(name):
        m = re.search(r"--" + name + r"\s*:\s*(#[0-9a-fA-F]{3,8})", css)
        return m.group(1) if m else ""

    words = prose_words(body)
    return {
        "css": css,
        "fonts": fonts,
        "body": body,
        "title": first(r"<h1[^>]*>(.*?)</h1>") or first(r"<title>(.*?)</title>", head),
        "kicker": first(r'<div class="kicker">(.*?)</div>'),
        "dek": first(r'<p class="dek">(.*?)</p>') or first(r'<p class="v2-standfirst">(.*?)</p>'),
        "byline": first(r'<p class="byline">(.*?)</p>'),
        "description": meta("og:description") or meta("description"),
        "bg": var("bg") or "#0a0e1c",
        "accent": var("accent") or "#3ddc97",
        "words": words,
        "readMins": max(1, round(words / WPM)),
        "v2": meta("deep-bag-version").strip() == "2",
    }


# ------------------------------------------------------------ css scoping --
#
# A study's stylesheet was written for a page of its own: it styles :root,
# html, body and bare p/h2/section/footer/a. On EBK the study sits inside the
# site's header and footer, so every selector is prefixed with the wrapper
# (SCOPE) and the page-level selectors become the wrapper itself. The study
# then renders exactly as it does standalone, and none of it leaks into the
# site chrome. @media/@supports bodies are scoped recursively; @keyframes and
# @font-face pass through untouched.

SCOPE = ".dbx-study"
_PAGE_SEL = re.compile(r"^(?::root|html|body)(?![\w-])")


def _split_top(s, sep):
    """Split on sep outside (), [] and quotes."""
    out, depth, q, cur = [], 0, "", []
    for ch in s:
        if q:
            cur.append(ch)
            if ch == q:
                q = ""
            continue
        if ch in "\"'":
            q = ch
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == sep and depth == 0:
            out.append("".join(cur))
            cur = []
            continue
        cur.append(ch)
    out.append("".join(cur))
    return out


def _scope_selector(sel, scope):
    sel = sel.strip()
    if not sel:
        return sel
    if _PAGE_SEL.match(sel):
        rest = _PAGE_SEL.sub("", sel, count=1)
        # "html body x" / "html > body": the second page token is the wrapper too
        rest = re.sub(r"^\s*>?\s*body(?![\w-])", "", rest)
        return scope + rest
    return scope + " " + sel


def _block_end(css, i):
    """Index just past the } matching the { at css[i]."""
    depth, q, n = 0, "", len(css)
    while i < n:
        ch = css[i]
        if q:
            if ch == "\\":
                i += 2
                continue
            if ch == q:
                q = ""
        elif ch in "\"'":
            q = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


def scope_css(css, scope=SCOPE):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        k = css.find(";", i)
        if j < 0:
            tail = css[i:].strip()
            if tail:
                out.append(tail)
            break
        if 0 <= k < j and css[i:k].strip().startswith("@"):   # @charset/@import/@layer a, b;
            out.append(css[i:k + 1].strip())
            i = k + 1
            continue
        prelude = css[i:j].strip()
        end = _block_end(css, j)
        inner = css[j + 1:end - 1]
        if prelude.startswith("@"):
            name = prelude.split(None, 1)[0].lower()
            if name in ("@media", "@supports", "@container", "@layer", "@scope", "@document"):
                out.append(prelude + "{" + scope_css(inner, scope) + "}")
            else:                                             # @keyframes, @font-face, @page ...
                out.append(prelude + "{" + inner + "}")
        else:
            sels = ",".join(_scope_selector(x, scope) for x in _split_top(prelude, ","))
            out.append(sels + "{" + inner.strip() + "}")
        i = end
    return "\n".join(out)


# ----------------------------------------------------------------- content --

def load_meta(slug):
    p = CONTENT / slug / "meta.json"
    if not p.exists():
        die(f"no article '{slug}' in content/deep-bag (import it first)")
    return json.loads(p.read_text(encoding="utf-8"))


def save_meta(meta):
    p = CONTENT / meta["slug"] / "meta.json"
    p.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def all_metas():
    if not CONTENT.exists():
        return []
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(CONTENT.glob("*/meta.json"))]


def split_list(s):
    return [t.strip().lower() for t in (s or "").split(",") if t.strip()]


LOCAL_REF = re.compile(r'(?:href|src|poster|data-scene-src)="(?!https?:|mailto:|data:|#|/)([^"]+)"', re.I)


def collect_assets(d, sources):
    """Copy the non-HTML local files a study links to (e.g. full-size figure
    PNGs) into content/<slug>/assets/, returning {original ref: file name}."""
    out = {}
    adir = d / "assets"
    shutil.rmtree(adir, ignore_errors=True)
    for src in sources:
        if not src or not src.is_file():
            continue
        for ref in set(LOCAL_REF.findall(src.read_text(encoding="utf-8"))):
            if ref.lower().endswith(".html") or Path(ref).name in SUPERSEDED_MODULES:
                continue
            f = (src.parent / ref).resolve()
            if f.is_file():
                adir.mkdir(exist_ok=True)
                shutil.copyfile(f, adir / f.name)
                out[ref] = f.name
            else:
                print(f"  warning: {src.name} links {ref!r}, which doesn't exist")
    if out:
        print(f"  copied {len(out)} linked file(s) into {adir.relative_to(ROOT)}")
    return out


def cmd_import(a):
    slug = a.slug
    if not SLUG_RE.match(slug) or slug in RESERVED:
        die(f"bad slug '{slug}': lowercase words joined by hyphens, and not one of {sorted(RESERVED)}")
    src = Path(a.article)
    if not src.exists():
        die(f"{src} not found")
    d = CONTENT / slug
    d.mkdir(parents=True, exist_ok=True)
    existing = (d / "meta.json").exists()
    meta = load_meta(slug) if existing else {"slug": slug, "status": "draft", "date": "", "tags": [], "sports": []}

    shutil.copyfile(src, d / "article.html")
    meta.setdefault("source", {})["article"] = str(src)
    if a.report:
        rp = Path(a.report)
        if not rp.exists():
            die(f"{rp} not found")
        shutil.copyfile(rp, d / "report.html")
        meta["source"]["report"] = str(rp)
    if a.share:
        sp = Path(a.share)
        if not sp.exists():
            die(f"{sp} not found")
        shutil.copyfile(sp, d / "share.png")
    report_src = meta["source"].get("report")
    meta["assets"] = collect_assets(d, [src] + ([Path(report_src)] if report_src else []))
    if a.tags is not None:
        meta["tags"] = split_list(a.tags)[:8]
    if a.sports is not None:
        meta["sports"] = split_list(a.sports)
    meta["imported"] = date.today().isoformat()
    save_meta(meta)
    info = parse_study((d / "article.html").read_text(encoding="utf-8"))
    print(f"{'updated' if existing else 'imported'} {slug}: \"{info['title']}\" "
          f"({info['words']} words of running prose, {info['readMins']} min) status={meta['status']}")
    build()


def cmd_publish(a):
    meta = load_meta(a.slug)
    meta["status"] = "published"
    if a.date:
        meta["date"] = a.date
    elif not meta.get("date"):
        meta["date"] = date.today().isoformat()
    save_meta(meta)
    print(f"published {a.slug} dated {meta['date']}")
    build()


def cmd_unpublish(a):
    meta = load_meta(a.slug)
    meta["status"] = "draft"
    save_meta(meta)
    print(f"unpublished {a.slug} (back to draft)")
    build()


def cmd_list(_a):
    for m in all_metas():
        print(f"{m['status']:<10} {m.get('date') or '----------'}  {m['slug']}  tags={','.join(m.get('tags', []))}")


# ------------------------------------------------------------------- build --

def rewrite_links(body, art_url, report_url, assets=None):
    """Point the study's sibling-file links at their published URLs. Any other
    relative link would 404 once hosted, so it is unwrapped to plain text."""
    for ref, name in (assets or {}).items():
        body = body.replace(f'"{ref}"', f'"{art_url}/assets/{name}"')

    def fix(m):
        attrs, inner = m.group(1), m.group(2)
        hm = re.search(r'href="([^"]*)"', attrs)
        if not hm:
            return m.group(0)
        href = hm.group(1)
        if re.match(r"^(https?:|mailto:|#|/)", href):
            return m.group(0)
        if re.match(r"^report[^/]*\.html$", href) and report_url:
            return "<a" + attrs.replace(hm.group(0), f'href="{report_url}"') + ">" + inner + "</a>"
        if re.match(r"^article[^/]*\.html$", href):
            return "<a" + attrs.replace(hm.group(0), f'href="{art_url}"') + ">" + inner + "</a>"
        print(f"  warning: unlinked relative href {href!r} (not publishable)")
        return inner
    return re.sub(r"<a\b([^>]*)>(.*?)</a>", fix, body, flags=re.S | re.I)


# Phrases the Deep Bag house rules ban from study prose (docs/deep-bag-v2.md).
BANNED = [r"\bit'?s not (?:just )?\w+(?: \w+)?, it'?s\b", r"\bnot just\b.{0,40}\bbut\b", r"here'?s the thing",
          r"let'?s dive in", r"the answer might surprise you", r"\bin other words\b", r"\bultimately\b",
          r"\bcrucially\b", r"\bdelve", r"\btapestry\b", r"\blandscape\b", r"\bnavigat(?:e|es|ing)\b",
          r"a testament to", r"so what does this mean"]


def lint(slug, info, assets=None):
    """House rules that are cheap to check mechanically."""
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", info["body"], flags=re.S | re.I)
    t = text_of(body)
    n = t.count("\u2014")
    if n:
        print(f"  warning: {slug} has {n} em dash(es) in its text")
    if info.get("v2"):
        for pat in BANNED:
            for m in re.finditer(pat, t, re.I):
                print(f"  warning: {slug} uses a banned pattern: ...{t[max(0, m.start() - 30):m.end() + 30]}...")
    for m in re.finditer(r'\bsrc="(?!data:|https?:|/)([^"]+)"', info["body"]):
        if m.group(1) not in (assets or {}):
            print(f"  warning: {slug} references local file {m.group(1)!r}, which won't be published")


FONT_LINKS = ('<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
              '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n')
ARROW = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" '
         'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>')
# The page around a study is the site's (base tokens, kit pieces, wordmark);
# the study itself keeps its own palette and type inside .dbx-study.
SITE_CSS = ('<link rel="stylesheet" href="/css/base.css" />\n'
            '<link rel="stylesheet" href="/css/ebk-kit.css" />\n')


def head_common(title, desc, url, image, noindex, alt):
    robots = '<meta name="robots" content="noindex" />\n' if noindex else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0e1c" />
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}" />
<link rel="canonical" href="{esc(url)}" />
{robots}<meta property="og:site_name" content="EBK Deep Bag" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(desc)}" />
<meta property="og:url" content="{esc(url)}" />
<meta property="og:image" content="{esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="{esc(alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{esc(title)}" />
<meta name="twitter:description" content="{esc(desc)}" />
<meta name="twitter:image" content="{esc(image)}" />
<meta name="twitter:image:alt" content="{esc(alt)}" />
<link rel="alternate" type="application/rss+xml" title="EBK Deep Bag" href="/deep-bag/feed.xml" />
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png" />
<link rel="icon" type="image/svg+xml" href="/img/icon.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="32x32" />
"""


def study_styles(info):
    """Site CSS, the study's fonts, its scoped stylesheet, then the chrome."""
    fonts = ""
    if info["fonts"]:
        fonts = FONT_LINKS + "".join(f'<link rel="stylesheet" href="{esc(f)}" />\n' for f in info["fonts"])
    return (SITE_CSS + fonts
            + f"<style>\n{scope_css(info['css'])}\n</style>\n"
            + '<link rel="stylesheet" href="/css/deep-bag-article.css" />\n'
            + '<script src="/js/ebk-kit.js" defer></script>\n'
            + '<script src="/js/ebk-analytics.js" defer></script>\n'
            + '<script src="/js/deep-bag-article.js" defer></script>\n'
            + "</head>\n")


V2_FONTS = ("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800"
            "&family=Martian+Mono:wdth,wght@75..100,400..650"
            "&family=Schibsted+Grotesk:ital,wght@0,400..700;1,400..600&display=swap")
V2_VERSION = "2"   # bump to bust caches of the v2 css/js (deep-bag-v2.js passes it on to every module it loads)


def study_styles_v2(info):
    """v2: site tokens, v2 fonts, the study's own (scoped) overrides, the v2
    system, then scripts. The inline class flip lets the CSS hide below-the-fold
    pieces for the scroll reveal before first paint (no flash)."""
    return (SITE_CSS + FONT_LINKS
            + '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />\n'
            + f'<link rel="stylesheet" href="{esc(V2_FONTS)}" />\n'
            + (f"<style>\n{scope_css(info['css'])}\n</style>\n" if info["css"].strip() else "")
            + '<link rel="stylesheet" href="/css/deep-bag-article.css" />\n'
            + f'<link rel="stylesheet" href="/css/deep-bag-v2.css?v={V2_VERSION}" />\n'
            + "<script>document.documentElement.classList.add('v2-js')</script>\n"
            + '<script src="/js/ebk-analytics.js" defer></script>\n'
            + '<script src="/js/deep-bag-article.js" defer></script>\n'
            + f'<script src="/js/deep-bag-v2.js?v={V2_VERSION}" defer></script>\n'
            + "</head>\n")


def top_bar_v2(right, static=False):
    return ('<div class="dbx-progress" aria-hidden="true"></div>\n'
            f'<header class="v2-top{" is-static" if static else ""}"><div class="v2-top-in">'
            '<a class="v2-brand" href="/" aria-label="EBK home"><span class="wordmark" aria-hidden="true">E<span>B</span>K</span>'
            '<span class="v2-brand-sub">Deep Bag</span></a>'
            f'<div class="v2-top-r">{right}</div>'
            '</div></header>\n')


def share_v2(title, url):
    u = quote(url, safe="")
    return ('<div class="v2-share"><span class="v2-label">Share</span>'
            '<button type="button" class="v2-chip" data-share="copy">Copy link</button>'
            '<button type="button" class="v2-chip" data-share="native" hidden>Share</button>'
            f'<a class="v2-chip" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url={u}">LinkedIn</a>'
            f'<a class="v2-chip" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text={quote(title)}&amp;url={u}">X</a>'
            f'<a class="v2-chip" target="_blank" rel="noopener" href="https://www.reddit.com/submit?url={u}&amp;title={quote(title)}">Reddit</a>'
            '</div>')


def ctas_v2():
    return ('<div class="v2-ctas"><a class="v2-btn" href="/">Play EBK ' + ARROW + '</a>'
            '<a class="v2-btn ghost" href="/deep-bag">All Deep Bag studies</a></div>')


def more_v2(others):
    if not others:
        return ""
    items = "".join(
        f'<li><a href="/deep-bag/{esc(o["slug"])}">'
        + (f'<img src="{esc(o["image"])}" width="1200" height="630" loading="lazy" alt="" />' if o.get("image") else "<span></span>")
        + f'<div><h3>{esc(o["title"])}</h3><p>{esc(o["dek"])}</p></div></a></li>'
        for o in others[:3])
    return '<h2 class="v2-label">More from the Deep Bag</h2><ul class="v2-more">' + items + "</ul>"


def body_open_v2(cls, info):
    accent = info.get("accent") or "#3ddc97"
    return f'<body class="dbx dbv2 {cls}" style="--v2-accent: {esc(accent)}">\n'


def top_bar(back_href, back_label, right):
    return ('<div class="dbx-progress" aria-hidden="true"></div>\n'
            '<header class="dbx-top"><div class="dbx-top-in">'
            '<a class="dbx-brand" href="/" aria-label="EBK home"><span class="wordmark" aria-hidden="true">E<span>B</span>K</span>'
            '<span class="dbx-brand-sub">Elite Ball Knowledge</span></a>'
            f'<a class="k-back dbx-back" href="{back_href}">&larr; {back_label}</a>'
            f'<div class="dbx-top-r">{right}</div>'
            '</div></header>\n')


def study_main(body):
    tag = "div" if re.search(r"<main\b", body, re.I) else "main"
    return f'<{tag} class="dbx-study" id="story">\n{body}\n</{tag}>\n'


SITE_FOOTER = ('<footer class="dbx-foot">'
               '<p><a href="/">EBK · Elite Ball Knowledge</a> &nbsp;·&nbsp; '
               '<a href="/deep-bag">Deep Bag</a> &nbsp;·&nbsp; <a href="/deep-bag/feed.xml">RSS</a></p>'
               '<p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · '
               'Not affiliated with any league. Logos and trademarks belong to their owners.</p>'
               '</footer>\n')


def shd(_n, title):
    # Deep Bag house rule: no numbered section badges anywhere (the "01/02" LED
    # segment read as template). The argument is kept so old call sites work.
    return (f'<div class="k-shd"><h2 class="k-shd-t">{esc(title)}</h2>'
            '<span class="k-shd-rail" aria-hidden="true"></span></div>')


def more_card(o, href):
    img = (f'<img class="dbx-more-img" src="{esc(o["image"])}" width="1200" height="630" loading="lazy" alt="" />'
           if o.get("image") else "")
    kick = " · ".join(s.upper() for s in o.get("sports") or []) or "Study"
    return (f'<a class="k-card dbx-more-card" href="{href}">{img}'
            f'<span class="k-kick">{esc(kick)} <i>{o["readMins"]} min</i></span>'
            f'<h3>{esc(o["title"])}</h3><p>{esc(o["dek"])}</p>'
            f'<span class="k-cta">Read the study {ARROW}</span></a>')


def ctas():
    return ('<div class="dbx-ctas"><a class="k-btn pill" href="/">Play EBK ' + ARROW + '</a>'
            '<a class="k-btn ghost pill" href="/deep-bag">All Deep Bag studies</a></div>')


def fmt_date(iso):
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%B %-d, %Y") if sys.platform != "win32" \
            else datetime.strptime(iso, "%Y-%m-%d").strftime("%B %#d, %Y")
    except (ValueError, TypeError):
        return ""


def render_article(meta, info, base, others):
    slug = meta["slug"]
    draft = meta["status"] != "published"
    url_path = f"{base}/{slug}"
    report_path = f"{url_path}/report" if (CONTENT / slug / "report.html").exists() else ""
    url = SITE + f"/deep-bag/{slug}"
    image = SITE + f"/deep-bag/{slug}/share.png" if (CONTENT / slug / "share.png").exists() else SITE + "/img/og.png"
    title = info["title"]
    desc = info["description"] or info["dek"]
    body = rewrite_links(info["body"], url_path, report_path, meta.get("assets"))

    ld = {
        "@context": "https://schema.org", "@type": "Article",
        "headline": title, "description": desc, "image": image, "url": url,
        "mainEntityOfPage": url,
        "author": {"@type": "Organization", "name": "EBK Deep Bag"},
        "publisher": {"@type": "Organization", "name": "EBK: Elite Ball Knowledge", "url": SITE},
    }
    if meta.get("date"):
        ld["datePublished"] = meta["date"]

    date_line = fmt_date(meta.get("date")) if not draft else ""
    if info.get("v2"):
        right = (('<span class="k-tag gold dbx-draft">Draft preview</span>' if draft else "")
                 + '<span class="v2-pill v2-meta">' + (esc(date_line) + " · " if date_line else "")
                 + f'{info["readMins"]} min read</span>'
                 + (f'<a class="v2-pill is-accent" href="{report_path}">Nerd version {ARROW}</a>' if report_path else ""))
        end = '<section class="v2-end" aria-label="After the story"><div class="v2-end-in">'
        if report_path:
            end += (f'<a class="v2-report" href="{report_path}"><div><h2>The nerd version</h2>'
                    '<p>Methods, every table, the robustness checks and the caveats behind this story.</p></div>'
                    f'<span class="v2-arrow" aria-hidden="true">{ARROW}</span></a>')
        end += share_v2(title, url) + more_v2(others) + ctas_v2() + "</div></section>\n"
        return (head_common(f"{title} · EBK Deep Bag", desc, url, image, draft, f"{title}: an EBK Deep Bag study")
                + '<meta property="og:type" content="article" />\n'
                + (f'<meta property="article:published_time" content="{esc(meta["date"])}" />\n' if meta.get("date") else "")
                + "".join(f'<meta property="article:tag" content="{esc(t)}" />\n' for t in meta.get("tags", []))
                + '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>\n"
                + study_styles_v2(info)
                + body_open_v2("dbv2-art", info)
                + '<a class="dbx-skip" href="#story">Skip to the story</a>\n'
                + top_bar_v2(right)
                + study_main(body)
                + end + SITE_FOOTER + "</body>\n</html>\n")
    right = (('<span class="k-tag gold dbx-draft">Draft preview</span>' if draft else "")
             + '<span class="dbx-meta">' + (esc(date_line) + " · " if date_line else "")
             + f'{info["readMins"]} min read</span>'
             + (f'<a class="dbx-nerd" href="{report_path}">Nerd version {ARROW}</a>' if report_path else ""))

    n = 1
    end = '<section class="dbx-end" aria-label="After the story"><div class="dbx-end-in">' + shd(n, "Keep digging")
    if report_path:
        end += (f'<a class="k-card glow dbx-report" href="{report_path}">'
                '<span class="k-kick">For the nerds <i>Technical report</i></span>'
                '<h3>Read the nerd version</h3>'
                '<p>Methods, every table, robustness checks and caveats behind this story.</p>'
                f'<span class="k-cta">Open the report {ARROW}</span></a>')
    end += ('<div class="dbx-share"><span class="dbx-label">Share this study</span><div class="k-chips">'
            '<button type="button" class="k-chip" data-share="copy">Copy link</button>'
            '<button type="button" class="k-chip" data-share="native" hidden>Share</button>'
            f'<a class="k-chip" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text={quote(title)}&amp;url={quote(url, safe="")}">Post on X</a>'
            f'<a class="k-chip" target="_blank" rel="noopener" href="https://www.reddit.com/submit?url={quote(url, safe="")}&amp;title={quote(title)}">Reddit</a>'
            '</div></div>')
    if others:
        n += 1
        end += shd(n, "More from the Bag")
        end += '<div class="dbx-more">' + "".join(more_card(o, f'/deep-bag/{esc(o["slug"])}') for o in others[:3]) + "</div>"
    end += ctas() + "</div></section>\n"

    return (head_common(f"{title} · EBK Deep Bag", desc, url, image, draft, f"{title}: an EBK Deep Bag study")
            + '<meta property="og:type" content="article" />\n'
            + (f'<meta property="article:published_time" content="{esc(meta["date"])}" />\n' if meta.get("date") else "")
            + "".join(f'<meta property="article:tag" content="{esc(t)}" />\n' for t in meta.get("tags", []))
            + '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>\n"
            + study_styles(info)
            + '<body class="dbx dbx-art">\n'
            + '<a class="dbx-skip" href="#story">Skip to the story</a>\n'
            + top_bar("/deep-bag", "<b>Deep Bag</b>", right)
            + study_main(body)
            + end
            + SITE_FOOTER
            + "</body>\n</html>\n")


def render_report(meta, src, base, art_info):
    slug = meta["slug"]
    info = parse_study(src)
    draft = meta["status"] != "published"
    art_path = f"{base}/{slug}"
    url = SITE + f"/deep-bag/{slug}/report"
    title = (info["title"] or art_info["title"] + ": Technical Report")
    desc = f"The full methods, tables and robustness checks behind \"{art_info['title']}\"."
    image = SITE + f"/deep-bag/{slug}/share.png" if (CONTENT / slug / "share.png").exists() else SITE + "/img/og.png"
    body = rewrite_links(info["body"], art_path, f"{art_path}/report", meta.get("assets"))
    if info.get("v2"):
        info["accent"] = art_info.get("accent") or info.get("accent")
        right = (('<span class="k-tag gold dbx-draft">Draft preview</span>' if draft else "")
                 + '<span class="v2-pill v2-meta">Technical report</span>'
                 + f'<a class="v2-pill is-accent" href="{art_path}">Read the story {ARROW}</a>')
        end = ('<section class="v2-end" aria-label="After the report"><div class="v2-end-in">'
               + f'<a class="v2-report" href="{art_path}"><div><h2>{esc(art_info["title"])}</h2>'
               + f'<p>{esc(art_info["dek"])}</p></div><span class="v2-arrow" aria-hidden="true">{ARROW}</span></a>'
               + ctas_v2() + "</div></section>\n")
        return (head_common(f"{title} · EBK Deep Bag", desc, url, image, draft, f"{art_info['title']}: an EBK Deep Bag study")
                + '<meta property="og:type" content="article" />\n'
                + study_styles_v2(info)
                + body_open_v2("dbv2-rep", info)
                + '<a class="dbx-skip" href="#story">Skip to the report</a>\n'
                + top_bar_v2(right, static=True)
                + study_main(body)
                + end + SITE_FOOTER + "</body>\n</html>\n")
    right = (('<span class="k-tag gold dbx-draft">Draft preview</span>' if draft else "")
             + '<span class="dbx-meta">Technical report</span>'
             + f'<a class="dbx-nerd" href="{art_path}">Read the story {ARROW}</a>')
    end = ('<section class="dbx-end" aria-label="After the report"><div class="dbx-end-in">'
           + shd(1, "Back to the story")
           + f'<a class="k-card glow dbx-report" href="{art_path}">'
           + f'<span class="k-kick">The story <i>{art_info["readMins"]} min read</i></span>'
           + f'<h3>{esc(art_info["title"])}</h3><p>{esc(art_info["dek"])}</p>'
           + f'<span class="k-cta">Read the story {ARROW}</span></a>'
           + ctas() + "</div></section>\n")
    return (head_common(f"{title} · EBK Deep Bag", desc, url, image, draft, f"{art_info['title']}: an EBK Deep Bag study")
            + '<meta property="og:type" content="article" />\n'
            + study_styles(info)
            + '<body class="dbx dbx-rep">\n'
            + '<a class="dbx-skip" href="#story">Skip to the report</a>\n'
            + top_bar(art_path, "<b>The story</b>", right)
            + study_main(body)
            + end
            + SITE_FOOTER
            + "</body>\n</html>\n")


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def build():
    metas = all_metas()
    prev = []
    if MANIFEST.exists():
        prev = [a["slug"] for a in json.loads(MANIFEST.read_text(encoding="utf-8")).get("articles", [])]

    # Start clean: drafts folder, and every slug folder this tool owns.
    shutil.rmtree(DRAFTS, ignore_errors=True)
    for slug in set(prev) | {m["slug"] for m in metas}:
        if SLUG_RE.match(slug) and slug not in RESERVED:
            shutil.rmtree(OUT / slug, ignore_errors=True)

    entries = []
    for m in metas:
        info = parse_study((CONTENT / m["slug"] / "article.html").read_text(encoding="utf-8"))
        lint(m["slug"], info, m.get("assets"))
        entries.append((m, info))

    def summary(m, info):
        return {
            "slug": m["slug"], "title": info["title"], "dek": info["dek"] or info["description"],
            "kicker": info["kicker"], "byline": info["byline"], "date": m.get("date", ""),
            "tags": m.get("tags", []), "sports": m.get("sports", []), "readMins": info["readMins"],
            "accent": info["accent"], "bg": info["bg"],
            "report": (CONTENT / m["slug"] / "report.html").exists(),
            "image": f"/deep-bag/{m['slug']}/share.png" if (CONTENT / m["slug"] / "share.png").exists() else "",
            "status": m["status"],
        }

    published = sorted([summary(m, i) for m, i in entries if m["status"] == "published"],
                       key=lambda s: s["date"], reverse=True)
    drafts = [summary(m, i) for m, i in entries if m["status"] != "published"]

    for m, info in entries:
        is_pub = m["status"] == "published"
        base = "/deep-bag" if is_pub else "/deep-bag/.drafts"
        dest = (OUT if is_pub else DRAFTS) / m["slug"]
        others = [s for s in published if s["slug"] != m["slug"]]
        write(dest / "index.html", render_article(m, info, base, others))
        rp = CONTENT / m["slug"] / "report.html"
        if rp.exists():
            write(dest / "report" / "index.html", render_report(m, rp.read_text(encoding="utf-8"), base, info))
        ad = CONTENT / m["slug"] / "assets"
        if ad.is_dir():
            shutil.copytree(ad, dest / "assets", ignore=lambda _d, names: [n for n in names if n in SUPERSEDED_MODULES])
        sp = CONTENT / m["slug"] / "share.png"
        if sp.exists():
            shutil.copyfile(sp, dest / "share.png")

    for s in published:
        s.pop("status")
    write(MANIFEST, json.dumps({"generated": date.today().isoformat(), "articles": published},
                               indent=1, ensure_ascii=False) + "\n")
    # Local preview only; the index page merges this in on localhost. Written
    # even when empty so the localhost fetch doesn't 404 (never deployed).
    write(DRAFTS / "index.json", json.dumps({"articles": drafts}, indent=1, ensure_ascii=False) + "\n")
    write(FEED, render_feed(published))

    # keep the sitemap in step with the pages we just wrote
    cwd = Path.cwd()
    try:
        import os
        os.chdir(ROOT)
        runpy.run_path(str(ROOT / "tools" / "gen_sitemap.py"))
    finally:
        os.chdir(cwd)
    print(f"built {len(published)} published, {len(drafts)} draft(s)"
          + (f"; preview drafts at /deep-bag/.drafts/<slug>/" if drafts else ""))


def render_feed(published):
    def rfc822(iso):
        try:
            d = datetime.strptime(iso, "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
            return d.strftime("%a, %d %b %Y %H:%M:%S +0000")
        except (ValueError, TypeError):
            return ""
    items = "".join(
        f"""  <item>
    <title>{esc(a['title'])}</title>
    <link>{SITE}/deep-bag/{a['slug']}</link>
    <guid isPermaLink="true">{SITE}/deep-bag/{a['slug']}</guid>
    <pubDate>{rfc822(a['date'])}</pubDate>
    <description>{esc(a['dek'])}</description>
{''.join(f'    <category>{esc(t)}</category>' + chr(10) for t in a['tags'])}  </item>
""" for a in published)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>EBK Deep Bag</title>
  <link>{SITE}/deep-bag</link>
  <atom:link href="{SITE}/deep-bag/feed.xml" rel="self" type="application/rss+xml" />
  <description>Sports research from Elite Ball Knowledge: real data, matched comparisons, and the myths that don't survive them.</description>
  <language>en-us</language>
{items}</channel>
</rss>
"""


def main():
    p = argparse.ArgumentParser(description="EBK Deep Bag static article publisher")
    sub = p.add_subparsers(dest="cmd")
    i = sub.add_parser("import", help="snapshot a study's article (and report) into content/deep-bag")
    i.add_argument("article")
    i.add_argument("--slug", required=True)
    i.add_argument("--report")
    i.add_argument("--share", help="1200x630 PNG used for link previews")
    i.add_argument("--tags")
    i.add_argument("--sports")
    pb = sub.add_parser("publish")
    pb.add_argument("slug")
    pb.add_argument("--date")
    up = sub.add_parser("unpublish")
    up.add_argument("slug")
    sub.add_parser("list")
    sub.add_parser("build")
    a = p.parse_args()
    {"import": cmd_import, "publish": cmd_publish, "unpublish": cmd_unpublish,
     "list": cmd_list}.get(a.cmd, lambda _a: build())(a)


if __name__ == "__main__":
    main()
