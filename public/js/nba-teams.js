/* NBA franchise helper (mirrors window.NFL interface). Canonicalizes historical
   abbreviations (NJ->Nets/BKN, SEA->Sonics/OKC) and gives names + ESPN logos. */
window.NBA = (function () {
  "use strict";
  const FRANCHISES = [
    { key: "ATL", name: "Hawks",        abbrs: ["ATL"] },
    { key: "BOS", name: "Celtics",      abbrs: ["BOS"] },
    { key: "BKN", name: "Nets",         abbrs: ["BKN", "NJ"] },
    { key: "CHA", name: "Hornets",      abbrs: ["CHA"] },
    { key: "CHI", name: "Bulls",        abbrs: ["CHI"] },
    { key: "CLE", name: "Cavaliers",    abbrs: ["CLE"] },
    { key: "DAL", name: "Mavericks",    abbrs: ["DAL"] },
    { key: "DEN", name: "Nuggets",      abbrs: ["DEN"] },
    { key: "DET", name: "Pistons",      abbrs: ["DET"] },
    { key: "GS",  name: "Warriors",     abbrs: ["GS"] },
    { key: "HOU", name: "Rockets",      abbrs: ["HOU"] },
    { key: "IND", name: "Pacers",       abbrs: ["IND"] },
    { key: "LAC", name: "Clippers",     abbrs: ["LAC"] },
    { key: "LAL", name: "Lakers",       abbrs: ["LAL"] },
    { key: "MEM", name: "Grizzlies",    abbrs: ["MEM"] },
    { key: "MIA", name: "Heat",         abbrs: ["MIA"] },
    { key: "MIL", name: "Bucks",        abbrs: ["MIL"] },
    { key: "MIN", name: "Timberwolves", abbrs: ["MIN"] },
    { key: "NO",  name: "Pelicans",     abbrs: ["NO", "NOH", "NOK"] },
    { key: "NY",  name: "Knicks",       abbrs: ["NY"] },
    { key: "OKC", name: "Thunder",      abbrs: ["OKC", "SEA"] },
    { key: "ORL", name: "Magic",        abbrs: ["ORL"] },
    { key: "PHI", name: "76ers",        abbrs: ["PHI"] },
    { key: "PHX", name: "Suns",         abbrs: ["PHX"] },
    { key: "POR", name: "Trail Blazers",abbrs: ["POR"] },
    { key: "SA",  name: "Spurs",        abbrs: ["SA"] },
    { key: "SAC", name: "Kings",        abbrs: ["SAC"] },
    { key: "TOR", name: "Raptors",      abbrs: ["TOR"] },
    { key: "UTAH",name: "Jazz",         abbrs: ["UTAH"] },
    { key: "WSH", name: "Wizards",      abbrs: ["WSH"] },
  ];
  const toKey = {}, nameByKey = {};
  FRANCHISES.forEach((f) => {
    nameByKey[f.key] = f.name;
    f.abbrs.forEach((a) => (toKey[a] = f.key));
  });
  const keyOf = (abbr) => toKey[abbr] || abbr;
  return {
    franchises: FRANCHISES,
    keyOf,
    name: (abbr) => nameByKey[keyOf(abbr)] || abbr,
    logo: (abbr) => "https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/" + keyOf(abbr).toLowerCase() + ".png&w=128",
  };
})();
