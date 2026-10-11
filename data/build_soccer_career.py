#!/usr/bin/env python
"""Pre-2016-17 Premier League career rows for players already in public/data/soccer/players.json.

Source: Premier League's own stats API (footballapi.pulselive.com), seasons 1992-93..2015-16.
  teams        : /football/teams?comps=1&compSeasons=S&altIds=true       (opta team code, e.g. t43)
  ranked stats : /football/stats/ranked/players/{stat}?comps=1&compSeasons=S&teams=T&altIds=true
                 stat in appearances, goals, goal_assist, mins_played
Player join: owner.altIds.opta ("p37572") == FPL `code` (players.json id "37572").
One row per (player, season). A player who played for 2+ clubs in a season gets summed
stats and team = the club with most appearances. Rows whose team is not in
public/js/soccer-teams.js are skipped and counted. Only goals/assists/minutes/appearances
are emitted (never cs/saves/gc/bonus/pts). minutes only when the API has minutes for that
team-season. Stdlib only, one worker, 0.5s throttle, raw cache in data/raw/soccer_career/.
"""
import json, os, re, time, hashlib, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYERS = os.path.join(ROOT, 'public', 'data', 'soccer', 'players.json')
TEAMS_JS = os.path.join(ROOT, 'public', 'js', 'soccer-teams.js')
CACHE = os.path.join(ROOT, 'data', 'raw', 'soccer_career')
OUT = os.path.join(ROOT, 'data', 'raw', 'career', 'soccer.json')
BASE = 'https://footballapi.pulselive.com/football/'
HDR = {'Origin': 'https://www.premierleague.com', 'Referer': 'https://www.premierleague.com/',
       'User-Agent': 'Mozilla/5.0'}
# compSeasons id by season end year (premierleague.com compseasons list)
SEASON_IDS = {1993: 1, 1994: 2, 1995: 3, 1996: 4, 1997: 5, 1998: 6, 1999: 7, 2000: 8, 2001: 9,
              2002: 10, 2003: 11, 2004: 12, 2005: 13, 2006: 14, 2007: 15, 2008: 16, 2009: 17,
              2010: 18, 2011: 19, 2012: 20, 2013: 21, 2014: 22, 2015: 27, 2016: 42}
STATS = {'appearances': 'appearances', 'goals': 'goals', 'assists': 'goal_assist', 'minutes': 'mins_played'}
last = [0.0]


def get(path):
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, hashlib.md5(path.encode()).hexdigest() + '.json')
    if os.path.exists(f):
        return json.load(open(f, encoding='utf8'))
    for attempt in range(8):
        wait = 0.5 - (time.time() - last[0])
        if wait > 0:
            time.sleep(wait)
        last[0] = time.time()
        try:
            r = subprocess.run(['curl', '-s', '-f', '-H', 'Origin: https://www.premierleague.com',
                                '-H', 'Referer: https://www.premierleague.com/', BASE + path],
                               capture_output=True, timeout=60, check=True)
            data = json.loads(r.stdout.decode('utf8'))
            json.dump(data, open(f, 'w', encoding='utf8'))
            return data
        except Exception as e:
            print('retry', path, e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise SystemExit('failed ' + path)


def ranked(stat, sid, tid):
    out, page = [], 0
    while True:
        d = get('stats/ranked/players/%s?page=%d&pageSize=100&compSeasons=%d&comps=1&altIds=true&teams=%d'
                % (stat, page, sid, tid))['stats']
        out += d['content']
        page += 1
        if page >= d['pageInfo']['numPages']:
            return out


def fmt(y):
    return '%d-%02d' % (y - 1, y % 100)


def main():
    main_d = json.load(open(PLAYERS, encoding='utf8'))
    first = {}
    for p in main_d['players']:
        if p['id'] not in first or p['season'] < first[p['id']]['season']:
            first[p['id']] = p
    helper = set(re.findall(r'key:"(\d+)"', open(TEAMS_JS, encoding='utf8').read()))
    agg = {}  # (id, season) -> {team: {apps,goals,assists,minutes|None}}
    skipped_clubs = {}
    unmapped = 0
    for yr, sid in SEASON_IDS.items():
        teams = get('teams?pageSize=50&comps=1&compSeasons=%d&altIds=true' % sid)['content']
        for t in teams:
            tcode = t['altIds']['opta'][1:]
            tid = int(t['id'])
            vals = {}
            for k, stat in STATS.items():
                vals[k] = {}
                for c in ranked(stat, sid, tid):
                    o = c['owner']
                    code = o.get('altIds', {}).get('opta', '')[1:]
                    vals[k][code] = c['value']
            has_min = bool(vals['minutes'])
            for code, apps in vals['appearances'].items():
                if code not in first:
                    continue
                rec = agg.setdefault((code, yr), {})
                rec[tcode] = {'appearances': int(apps), 'goals': int(vals['goals'].get(code, 0)),
                              'assists': int(vals['assists'].get(code, 0)),
                              'minutes': int(vals['minutes'][code]) if has_min and code in vals['minutes'] else None,
                              'club': t['name']}
        print('season', yr, 'done', file=sys.stderr)
    rows, skipped, merged = [], 0, 0
    hist = {}
    for (code, yr), clubs in sorted(agg.items(), key=lambda x: (x[0][0], x[0][1])):
        dom = max(clubs, key=lambda k: (clubs[k]['appearances'], clubs[k]['minutes'] or 0))
        for k, c in clubs.items():      # clubs that never appear in 2016+ data: history-only names (soccer-teams.js HIST)
            if k not in helper:
                hist[k] = c['club']
        if len(clubs) > 1:
            merged += 1
        # goals + minutes only: assists would mix official PL assists with the FPL assists of 2016+ in one
        # career sum, and appearances is not part of the dataset schema
        st = {'goals': sum(c['goals'] for c in clubs.values())}
        if all(c['minutes'] is not None for c in clubs.values()):
            st['minutes'] = sum(c['minutes'] for c in clubs.values())
        p = first[code]
        rec = {'id': code, 'name': p['name'], 'pos': p['pos'], 'grp': p['grp'], 'season': yr,
               'seasonLabel': fmt(yr), 'team': dom, 'games': 0, 'stats': st}
        if len(clubs) > 1:      # the API has no dates: clubs ordered by appearances (set matters, order is a guess)
            rec['teams'] = sorted(clubs, key=lambda k: -clubs[k]['appearances'])
        rows.append(rec)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(hist, open(os.path.join(os.path.dirname(OUT), 'soccer_hist_clubs.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    json.dump({'sport': 'soccer', 'through': 2016, 'players': rows}, open(OUT, 'w', encoding='utf8'),
              ensure_ascii=False, separators=(',', ':'))
    print('rows', len(rows), 'players', len({r['id'] for r in rows}), 'skipped(club not in helper)', skipped,
          'multi-club merged', merged, 'size', os.path.getsize(OUT))
    print('skipped clubs', json.dumps(skipped_clubs))


if __name__ == '__main__':
    main()
