"""Parsers for the cached Statscrew NFL team-season pages (tools/statscrew_nfl_fetch.py)."""
import csv, glob, json, os, re, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
SC = os.path.join(HERE, "raw", "statscrew_nfl")


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"[^a-z]", "", s)


def code_for(team, y):
    """Statscrew team code + year -> club code used in players.json / teams.js."""
    m = {"HOO": "TEN", "LAA": "OAK", "LAN": "LA", "PHO": "ARI", "CLE": "CLE", "SLC": "ARI", "BAC": "IND", "JAC": "JAX"}
    if team == "STL":
        return "ARI" if y <= 1987 else "STL"      # St. Louis Cardinals until 1987, Rams from 1995
    if team == "BAL":
        return "IND" if y <= 1983 else "BAL"       # Baltimore Colts 1983, Ravens from 1996
    if team == "RAI":
        return "OAK"
    return m.get(team, team)


def roster(team, y):
    f = os.path.join(SC, "roster_%s_%d.html" % (team, y))
    if not os.path.exists(f):
        return None
    s = open(f, encoding="utf8", errors="ignore").read()
    out = []
    for tr in re.findall(r"<tr>(.*?)</tr>", s, flags=re.S):
        tds = re.findall(r"<td([^>]*)>(.*?)</td>", tr, flags=re.S)
        if len(tds) < 10:
            continue
        txt = [re.sub(r"<[^>]+>", "", t[1]).strip() for t in tds]
        bd = re.search(r'sorttable_customkey="(\d{4}-\d{2}-\d{2})"', tds[3][0])
        try:
            gp, gs = int(txt[-2]), int(txt[-1])
        except ValueError:
            continue
        out.append({"name": txt[1], "pos": txt[2], "bd": bd.group(1) if bd else None, "gp": gp, "gs": gs})
    return out


def table(s, head):
    k = s.find("<h2>" + head)
    if k < 0:
        return {}
    seg = s[k:s.find("</table>", k)]
    out = {}
    for m in re.finditer(r'<td class="dt-left"><a [^>]*>([^<]+)</a></td>((?:<td class="dt-right">[^<]*(?:&nbsp;)?</td>)+)', seg):
        c = [x.replace("&nbsp;", "").strip() for x in re.findall(r'<td class="dt-right">([^<]*)</td>', m.group(2))]
        out.setdefault(norm(m.group(1)), c)
    return out


def stats(team, y):
    f = os.path.join(SC, "stats_%s_%d.html" % (team, y))
    if not os.path.exists(f):
        return None
    s = open(f, encoding="utf8", errors="ignore").read()
    return {"sacks": table(s, "Sacks:"), "int": table(s, "Interceptions:"), "def": table(s, "Defense and Fumbles:"),
            "pass": table(s, "Passing:"), "rush": table(s, "Rushing:"), "recv": table(s, "Receiving:")}


def year_teams(y):
    f = os.path.join(SC, "year_%d.html" % y)
    if not os.path.exists(f):
        return []
    s = open(f, encoding="utf8", errors="ignore").read()
    return sorted(set(re.findall(r'football/stats/t-([A-Za-z]+)/y-%d"' % y, s)))
