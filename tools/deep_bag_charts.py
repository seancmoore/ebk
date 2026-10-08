# EBK Deep Bag v2 · put chart data into a study article (docs/deep-bag-v2.md).
#
#   python tools/deep_bag_charts.py <article.html> <charts.json> [--check]
#
# charts.json is a list of chart specs written by the STUDY's own export
# script from its outputs/tables CSVs (numbers are never typed by hand). In
# the article, each chart is a figure holding a pair of markers:
#
#   <figure class="v2-fig v2-chart" data-chart="role-by-method">
#     <!--chart:role-by-method--><!--/chart:role-by-method-->
#     <figcaption>...</figcaption>
#   </figure>
#
# This tool replaces whatever sits between the markers with the chart card:
# title, an empty stage that deep-bag-v2.js draws into, a key, the data table
# (the accessible / no-JS fallback, built here from the same JSON) and the
# JSON itself. Re-run it after every export; it is idempotent. --check only
# reports which markers have no spec and which specs are unused.
#
# Types: line, hbar, bars3d (deep-bag-v2.js / deep-bag-v2-chart3d.js) and the
# extra types agecurve, rangeplot, ridge3d (deep-bag-v2-xcharts.js). The extra
# types carry their own fallback table, because their rows are not cells:
#   "table": {"cols": [...], "rows": [[...], ...], "caption": "optional"}
# and an optional "key": [{"cls": "line s-accent", "label": "..."}] (each cls
# becomes <i class="k-CLS">); without "key" one is built from series / band /
# bars / legend.
# Python stdlib only.
import argparse
import html
import json
import re
import sys
from pathlib import Path

MINUS = "−"


def esc(s):
    return html.escape(str("" if s is None else s), quote=True)


def fmt(v, dec=1, signed=False):
    if v is None:
        return "n/a"
    s = f"{abs(v):.{dec}f}"
    if float(s) == 0:
        return s
    if v < 0:
        return MINUS + s
    return ("+" if signed else "") + s


def fmt_p(p):
    if p is None:
        return ""
    if p < 0.001:
        return "&lt;0.001"
    return f"{p:.3f}" if p < 0.01 else f"{p:.2f}"


def ci(c, dec):
    if c.get("lo") is None:
        return ""
    return f"{fmt(c['lo'], dec, True)} to {fmt(c['hi'], dec, True)}"


def row_html(label, c, dec, signed):
    cls = []
    if c.get("emph"):
        cls.append("is-emph")
    if c.get("sig") is False:
        cls.append("is-unclear")
    note = c.get("note")
    val = fmt(c.get("v"), dec, signed) if c.get("v") is not None else (esc(note) if note else "n/a")
    return (f'<tr class="{" ".join(cls)}"><th scope="row">{esc(label)}</th><td>{val}</td>'
            f'<td>{ci(c, dec)}</td><td>{c.get("n", "")}</td><td>{fmt_p(c.get("p"))}</td></tr>')


XTYPES = ("agecurve", "rangeplot", "ridge3d")


def table_x(spec):
    t = spec.get("table")
    if not t:
        raise SystemExit(f"chart {spec.get('id')!r} ({spec['type']}) needs a \"table\": {{cols, rows}} for its fallback")
    head = "".join(f'<th scope="col">{esc(c)}</th>' for c in t["cols"])
    body = "".join("<tr>" + "".join((f'<th scope="row">{esc(v)}</th>' if i == 0 else f"<td>{esc(v)}</td>")
                                    for i, v in enumerate(r)) + "</tr>" for r in t["rows"])
    cap = esc(t.get("caption") or spec.get("title", ""))
    return (f'<div class="v2-data-wrap"><table class="v2-data"><caption>{cap}</caption><thead><tr>{head}</tr></thead>'
            f"<tbody>{body}</tbody></table></div>")


def key_x(spec):
    bits = []
    if spec.get("key") is not None:
        for k in spec["key"]:
            bits.append(f'<span><i class="k-{esc(k["cls"])}"></i>{esc(k["label"])}</span>')
    elif spec["type"] == "agecurve" and not spec.get("panels"):
        for sr in spec.get("series", []):
            bits.append(f'<span><i class="k-line {esc(sr.get("cls", ""))}"></i>{esc(sr["label"])}</span>')
        if spec.get("band"):
            bits.append(f'<span><i class="k-band"></i>{esc(spec["band"].get("label", ""))}</span>')
        if spec.get("bars"):
            bits.append(f'<span><i class="k-bar"></i>{esc(spec["bars"].get("label", ""))}</span>')
    elif spec["type"] == "rangeplot":
        for lg in spec.get("legend", []):
            bits.append(f'<span><i class="k-{esc(lg["cls"])}"></i>{esc(lg["label"])}</span>')
    return f'<p class="v2-key">{"".join(bits)}</p>' if bits else ""


def table(spec):
    if spec["type"] in XTYPES:
        return table_x(spec)
    dec = spec.get("decimals", 1)
    signed = spec.get("signed", False)
    head = ('<thead><tr><th scope="col">Group</th><th scope="col">Value</th><th scope="col">95% CI</th>'
            '<th scope="col">n</th><th scope="col">p</th></tr></thead>')
    rows = []
    t = spec["type"]
    if t == "line":
        cats = {c["key"]: c["label"] for c in spec["x"]["cats"]}
        for p in spec["points"]:
            rows.append(row_html(cats[p["x"]] + (f' ({p["label"].lower()})' if p.get("label") else ""), p, dec, signed))
        unit = spec.get("unit", "")
    elif t == "hbar":
        unit = ""
        for panel in spec["panels"]:
            if len(spec["panels"]) > 1 or panel.get("title"):
                rows.append(f'<tr class="v2-grp"><th colspan="5" scope="rowgroup">{esc(panel.get("title", ""))}'
                            f'{" (" + esc(panel["unit"]) + ")" if panel.get("unit") else ""}</th></tr>')
            else:
                unit = panel.get("unit", "")
            for g in panel["groups"]:
                if g.get("label"):
                    rows.append(f'<tr class="v2-grp"><th colspan="5" scope="rowgroup">{esc(g["label"])}</th></tr>')
                for r in g["rows"]:
                    rows.append(row_html(r["label"], r, dec, signed))
    elif t == "bars3d":
        unit = spec.get("unit", "")
        xl = {c["key"]: c["label"] for c in spec["x"]["cats"]}
        zl = {c["key"]: c["label"] for c in spec["z"]["cats"]}
        by = spec.get("flat", "x")
        outer = spec[by]["cats"]
        inner_key = "z" if by == "x" else "x"
        cell = {(c["x"], c["z"]): c for c in spec["cells"]}
        for o in outer:
            rows.append(f'<tr class="v2-grp"><th colspan="5" scope="rowgroup">{esc(o["label"])}</th></tr>')
            for i in spec[inner_key]["cats"]:
                c = cell.get((o["key"], i["key"]) if by == "x" else (i["key"], o["key"]))
                if c:
                    rows.append(row_html((zl if by == "x" else xl)[i["key"]], c, dec, signed))
    else:
        raise SystemExit(f"unknown chart type {t!r} in {spec.get('id')}")
    cap = esc(spec.get("title", "")) + (f" ({esc(unit)})" if unit else "")
    return (f'<div class="v2-data-wrap"><table class="v2-data"><caption>{cap}</caption>{head}'
            f'<tbody>{"".join(rows)}</tbody></table></div>')


def key_html(spec):
    if spec["type"] in XTYPES:
        return key_x(spec)
    has_unclear = has_emph = has_ci = False

    def scan(c):
        nonlocal has_unclear, has_emph, has_ci
        has_unclear |= c.get("sig") is False
        has_emph |= bool(c.get("emph"))
        has_ci |= c.get("lo") is not None
    if spec["type"] == "bars3d":
        for c in spec["cells"]:
            scan(c)
    elif spec["type"] == "line":
        for c in spec["points"]:
            scan(c)
    else:
        for p in spec["panels"]:
            for g in p["groups"]:
                for r in g["rows"]:
                    scan(r)
    bits = []
    if spec.get("key_accent") and has_emph:
        bits.append(f'<span><i class="k-accent"></i>{esc(spec["key_accent"])}</span>')
    if has_unclear:
        bits.append('<span><i class="k-solid"></i>Clearly different from zero</span>')
        bits.append('<span><i class="k-unclear"></i>Can’t be told apart from zero</span>')
    if has_ci:
        bits.append('<span><i class="k-ci"></i>95% confidence interval</span>')
    return f'<p class="v2-key">{"".join(bits)}</p>' if bits else ""


def card(spec):
    sub = spec.get("subtitle") or (spec.get("unit") if spec["type"] not in ("hbar",) + XTYPES else "")
    js = json.dumps(spec, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return (f'<div class="v2-fig-card">'
            f'<div class="v2-fig-head"><div><h3 class="v2-fig-title">{esc(spec.get("title", ""))}</h3>'
            + (f'<p class="v2-fig-sub">{esc(sub)}</p>' if sub else "")
            + '</div></div>'
            f'<div class="v2-chart-stage"></div>'
            f'{key_html(spec)}{table(spec)}'
            + (f'<p class="v2-src">Source: {esc(spec["source"])}</p>' if spec.get("source") else "")
            + f'</div><script type="application/json" class="v2-chart-data">{js}</script>')


MARK = re.compile(r"<!--chart:([\w-]+)-->(.*?)<!--/chart:\1-->", re.S)


def main():
    ap = argparse.ArgumentParser(description="inject Deep Bag v2 chart JSON into a study article")
    ap.add_argument("article")
    ap.add_argument("charts")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    art = Path(a.article)
    src = art.read_text(encoding="utf-8")
    specs = {c["id"]: c for c in json.loads(Path(a.charts).read_text(encoding="utf-8"))}
    used, missing = set(), []

    def fill(m):
        cid = m.group(1)
        if cid not in specs:
            missing.append(cid)
            return m.group(0)
        used.add(cid)
        return f"<!--chart:{cid}-->{card(specs[cid])}<!--/chart:{cid}-->"
    out = MARK.sub(fill, src)
    for cid in missing:
        print(f"  warning: marker chart:{cid} has no spec in {a.charts}")
    for cid in sorted(set(specs) - used):
        print(f"  note: spec {cid} isn't placed in the article")
    if a.check:
        return
    if out != src:
        art.write_text(out, encoding="utf-8", newline="\n")
    print(f"{art.name}: {len(used)} chart(s) filled from {Path(a.charts).name}")


if __name__ == "__main__":
    sys.exit(main())
