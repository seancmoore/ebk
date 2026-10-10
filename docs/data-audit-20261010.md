# EBK data audit, 2026-10-10

Scope: Higher/Lower, Stat Line, Career Path, Player Grid, Team Study (all share public/data/*/players.json), Deep Cut bank, Stat Lab. Nothing deployed, nothing committed.

## Checks run
- `node tools/solvable.cjs` (today, ET): 0 degenerate cells, 0 cells with 1-2 answers, 0 errors, grid-rosters current. Thinnest cells: NFL 28, NBA 12, MLB 10, NHL 5, soccer 3.
- There is no separate "verify" script in the repo. `tools/deep-cut-smoke.cjs`: all 420 scheduled days decode and accept their own answer; 6 UI failures on the home "CUT" chip / streak chip (not data, needs a look).
- `python tools/build_deep_cuts.py --check`: 420 valid.
- Freshness vs 2026-10-10: NFL 2025, CFB 2025, NBA 2025-26, MLB 2026, NHL 2025-26, soccer 2025-26. All at latest complete season. 2025-26 leaders verified (NHL McDavid 138 pts, MacKinnon 53 G; NFL Stafford 4,707, Garrett 23 sacks; NBA Doncic 2,143 pts; soccer Salah/Haaland).
- Structural: 0 duplicate (id,season,team) rows in any sport; 0 NHL/soccer/CFB headshot id vs player id mismatches (NHL goalie rows differ only by the g prefix); no shared headshots between ids; NFL ESPN-id headshots (2,567) all match nflverse espn_id; NFL draft data spot checks fine (supplemental-draft "R6 #1" style rows are legitimate).

## Counts checked
- Record/leader lines (top-5 per stat category, 5 sports, all categories): about 300 lines, all correct except the items below.
- Bulk independent comparison: MLB vs MLB Stats API, 4,129 hitter-seasons (7 seasons): 9 diffs of 1 unit (see below). NHL vs api.nhle.com, 6,300 skater-seasons (7 seasons): 0 diffs.
- Row samples against web sources: NFL 30, CFB 25, NBA 30 (+7 2025-26), soccer 30 (+4), plus ~40 team-history rows by eye.
- Deep Cut bank: 60 entries (10 per bank file) fact-checked.
- Total about 5,000 rows/lines compared.

## Fixes applied
| Item | Change | Source |
|---|---|---|
| nhl-030 (data/deep-cuts/bank_nhl.json) | Question said Bure's 60 goals were "ahead of Sergei Fedorov's 56". Runner-up in 1993-94 was Brett Hull, 57 (Fedorov third). Now "ahead of Brett Hull's 57". | https://www.hockey-reference.com/leagues/NHL_1994_leaders.html |
| nhl-060 fact text | "wrapped his hands in tape" changed to "boxing wraps" (Schultz Rule banned wraps) | https://en.wikipedia.org/wiki/Dave_Schultz_(ice_hockey) |
| public/data/deep-cuts.json | Patched only the two scheduled slots (2027-01-01 nhl-030, 2026-12-27 nhl-060) in place with the build script's own pack(). A full rebuild was NOT used: it reshuffled 398 future slots. Bank files and published schedule now agree. | n/a |

## Needs decision (data left unchanged)
1. NFL Jamal Lewis 2003 BAL rushing: data 2,063, official 2,066 (387 att, 14 TD). Source: ESPN athlete stats, https://en.wikipedia.org/wiki/2003_Baltimore_Ravens_season. Per standing rule this belongs in `OFFICIAL_FIXES` in data/build_players.py and needs owner approval.
2. NFL Kevin Smith 2008 DET rushing: data 975, ESPN 976. Same OFFICIAL_FIXES route.
3. NFL Kevin Carter 1999 STL: data sacks 15, games 14, tackles 30; ESPN/Wikipedia: 17 sacks (led NFL), 16 games, 34 tackles. Looks like a partial 1999-2000 defensive season; recommend auditing early-era defensive rows. https://en.wikipedia.org/wiki/Kevin_Carter_(American_football)
4. NFL small diffs vs ESPN (medium/low confidence, nflverse vs ESPN scoring): Kitna 2007 4,066 vs 4,068; Bryant 2006 SF 41/747 vs 40/733; Ware 2011 tackles 56 vs 58; Marshall 2014 112 vs 113.
5. CFB Max Duggan 2020 TCU: data 1,764 pass yds / 9 TD, 114 car / 547 rush; ESPN and Wikipedia 1,795 / 10, 116 / 526. Other CFB diffs (Griffis 2023, Burmeister 2020, Douglas 2025, Stribling 2024) are 1-16 units vs ESPN only. CFB `games` is 0 in every row; CFB defensive stats untested.
6. SOCCER ASSISTS (systemic): FPL assists exceed official in 12 of 30 sampled seasons, never lower (+1 to +4; about 25% inflation). Examples: Bruno Fernandes 2025-26 data 24 vs official 21 (the record, 21, https://www.premierleague.com/en/news/4615664/fernandes-on-course-to-break-premier-league-assist-record), De Bruyne 2019-20 23 vs 20, Salah 2018-19 12 vs 8, Cancelo 2021-22 11 vs 7. Any "most assists" question or Higher/Lower assists matchup is affected, and a hidden 24 > the real 21. Recommend dropping or relabelling to "FPL assists", or switching source. Not fixable without a new feed.
7. Soccer goals: Kane 2017-18 data 29, official 30 (https://en.wikipedia.org/wiki/2017–18_Premier_League). FPL attribution. Clean sheets, goals conceded, bonus, pts are FPL concepts (outfielders' "clean sheets" are team clean sheets while on pitch, so the grid achievement "50+ Clean Sheets (career)" can credit forwards/mids).
8. Soccer: no `teams` list for mid-season transfers (van Dijk 2017-18 only Liverpool, also played 11 for Southampton), `games` is 0 in every row, and some ids carry several name spellings (127 ids, mostly accents; "Thiago Thiago" is an FPL quirk for Thiago Alcantara; legal long names such as "Matheus Santos Carneiro Da Cunha", "Ederson Santana de Moraes").
9. "(career)" grid labels are totals within the data window (NFL from 1999, NBA 2002, MLB 2000, NHL 2001, soccer 2016). Answers are never false positives, but veterans can be missed and the label overstates. Consider "(since 2002)" style labels.
10. NBA: Eddy Curry and Jiri Welsch have position "NA" (ESPN gap; Curry is a C, Welsch a SG per Wikipedia). Not overridden, per the no-position-overrides rule. Minor ESPN box-score drift on low-minute players: Belinelli 2017-18 (data 966 pts vs 971), Ron Baker 2016-17 (207 vs 215), LaMelo Ball 2025-26 blocks 18 vs 17 (basketball-reference).
11. MLB: 2026 rows built 2026-10-01 differ by 1 unit from the Stats API on 6 of 657 hitters (e.g. Gunnar Henderson RBI 60 vs 59, Sal Stewart RBI 111 vs 112); 2001 Lahman: Abernathy RBI 33 vs 34, Gomez 43 vs 42. Re-running build_mlb.py refreshes 2026 from the same source. Not run (long job, laptop RAM).
12. Deep Cut wording, uncertain: nhl-019 hint "a first for a major North American sport" is supported by only secondary sources (suggest dropping the clause); hints "First name X" in cbb-001, cbb-017, cfb-038 leak half the answer (style). Not changed.
13. Deep Cut: the home CUT chip / streak chip smoke checks fail (UI, unrelated to data).

## Not independently verifiable this pass
NFL cloudinary headshots (4,096 equal nflverse's own URLs; person identity not independently confirmed), CFB headshots (ids already ESPN), MLB/NHL headshot name-vs-image (NHL ids match, MLB URLs embed the Stats API person id which was not cross-checked per player), retired/active flags (no such field exists in the data), Team Study and Stat Lab (derived from the same files).

---
# Second pass: approved fixes applied (2026-10-10, owner approved all)

Items 1-5 and 7 (Kane) and 9 and 12 of "Needs decision" above are now resolved as follows. Items 6 (numbers), 8, 10, 11, 13 remain open.

## Pinned to official figures
| Entry | Where | Value | Source |
|---|---|---|---|
| Jamal Lewis 2003 BAL rush yds | OFFICIAL_FIXES, data/build_players.py | 2,063 -> 2,066 (fantasy pts +0.3) | ESPN athlete stats; https://en.wikipedia.org/wiki/2003_Baltimore_Ravens_season |
| Kevin Smith 2008 DET rush yds | same | 975 -> 976 (fantasy +0.1) | ESPN athlete stats |
| Kevin Carter 1999 STL | same | sacks 15 -> 17, games 14 -> 16, tackles 30 -> 34 | ESPN athlete stats; https://en.wikipedia.org/wiki/Kevin_Carter_(American_football) |
| Michael Strahan 2003 NYG sacks | same (new, from early-era sample) | 18 -> 18.5 | ESPN; https://en.wikipedia.org/wiki/Michael_Strahan |
| Adewale Ogunleye 2003 MIA sacks | same (new) | 16 -> 15 (led AFC) | ESPN; https://en.wikipedia.org/wiki/Adewale_Ogunleye |
| Harry Kane 2017-18 goals | OFFICIAL_FIXES, data/build_soccer.py | 29 -> 30 (FPL pts left as FPL computed) | https://en.wikipedia.org/wiki/2017%E2%80%9318_Premier_League |
| Max Duggan 2020 TCU | OFFICIAL_FIXES, data/build_cfb.py | pass 1,764 -> 1,795, TD 9 -> 10, carries 114 -> 116, rush 547 -> 526 | ESPN athlete stats; https://en.wikipedia.org/wiki/Max_Duggan |

build_players.py now supports pinning `games` and `tackles` and adjusts fantasy points for rushing/receiving/passing yard pins (FIX_FANTASY). Diff of rebuilt players.json vs previous: exactly these 5 NFL rows changed, nothing else. Soccer diff: Kane only. CFB diff: Duggan only.

## Early-era NFL defensive sample (30 rows, 1999-2005, ESPN athlete stats API)
Interceptions matched 30/30. Pinned only where a second source (Wikipedia) agreed: Strahan 2003, Ogunleye 2003 (above), plus Carter. Single-source (ESPN only) discrepancies were NOT pinned, listed for a decision:
- Games short by 1-2 (data lower than ESPN, 7 of 30; never higher): Hugh Douglas 2000 (15 vs 16), Bertrand Berry 2004 (14 vs 16), Warren Sapp 2000 (15 vs 16), Brian Russell 2003 (15 vs 16), Rod Woodson 1999 (15 vs 16), Tebucky Jones 2000 (14 vs 15), Reynaldo Hill 2005 (13 vs 15). Pattern suggests nflverse early weekly rows are missing for about a quarter of defenders; a full fix needs an ESPN fetch for all ~5,800 1999-2005 defensive rows.
- Sacks off 0.5-1: Berry 2004 (13.5 vs 14.5), Simeon Rice 2003 (14.5 vs 15), Kawika Mitchell 2005 (1 vs 2), Grant Wistrom 2005 (3 vs 4).
- Tackles: 21 of 30 differ, mostly by 1-3 (ESPN early-era tackles are not official). Bigger: Darren Woodson 1999 (76 vs 70), Rod Woodson 1999 (60 vs 66), Tebucky Jones 2000 (67 vs 57), Darryl Williams 2000 (101 vs 98).

## Labels
- Soccer assists renamed "FPL Assists" (numbers untouched): data/build_soccer.py category (feeds Higher/Lower and Career Path), public/js/stat-line.js, public/js/team.js column ("FPL A"), public/js/player-grid.js ("10+ FPL Assists (season)", "30+ FPL Assists (since 2016)"), and C:\Users\panky\ebk-studio\pipeline\autogen.py video text ("Premier League FPL assists" / "FPL ASSISTS"). No Deep Cut question text mentions soccer assists.
- "(career)" grid categories now state their window: NFL "(since 1999)", NBA "(since 2002)", MLB "(since 2000)", NHL "(since 2001)", soccer "(since 2016)". Achievement keys unchanged.
- Clean sheets: grid engine (`csOk` in buildRoster, public/js/player-grid.js) now only credits `cs` to GK/DEF; labels "15+ Clean Sheets (season, GK/DEF)" and "50+ Clean Sheets (since 2016, GK/DEF)". Solvable stays clean.

## Deep Cut
- cfb-038, cbb-001, cbb-017: "First name X" hint 2 replaced by factual hints (Hail Flutie vs Miami 1984; heave dunked by Lorenzo Charles; double-clutch three that tied the 2016 title game with 4.7s left).
- nhl-019: dropped the unsupported "a first for a major North American sport".
- Patched in place in public/data/deep-cuts.json (2027-02-09, 2027-04-30, 2027-05-14, 2027-08-29, plus earlier 2026-12-27 and 2027-01-01). Banks and schedule agree; no reshuffle.

## Rebuild + cache
build_players.py, build_soccer.py, build_cfb.py run one at a time from cached raw inputs (no network refetch of stats). Then `node tools/build_grid_roster.cjs` (30/30 boards identical for every sport), `python tools/build_stat_lab.py`. `?v=9` bumped to `?v=10` on DATA_URL/ROSTER_URL in game.js, h2h.js, stat-line.js, team.js, career-path.js, player-grid.js, ebk-rack.js and DATA_V in ebk-home-sections.js.

## Tests
- `node tools/solvable.cjs`: 0 errors on 9 dates; soccer on 60 dates (3-day steps to 2027-04): 0 errors (one date, 2027-02-28, has 2 thin 2-answer cells, Swansea x Newcastle and Chelsea x Newcastle, an existing floor-fallback, not caused by the cs change).
- Browser smoke (tools/smoke.cjs adapted to playwright-core + Edge, as the repo version needs full playwright): nfl 100%, soccer + cfb 25/25 assertions green.
- tools/deep-cut-smoke.cjs: 420 days decode; the same 6 home CUT chip / streak chip UI failures as before (pre-existing, unrelated).
- `python tools/build_deep_cuts.py --check`: 420 valid.
