/* NHL franchise helper + ESPN logos. Canonicalizes relocated clubs to the franchise that exists today:
   PHX/WIN->ARI, ATL(Thrashers)->WPG, AFM(Atlanta Flames)->CGY, HFD->CAR, QUE->COL, MNS->DAL, CLR(Colorado Rockies)/KCS(Kansas City Scouts)->NJD.
   Clubs that folded or merged away (Oakland/California Seals, Cleveland Barons) are history-only: named, no logo, no grid axis. */
window.NHL = (function () {
  "use strict";
  const F = [
    ["ANA", "Ducks", "ana", ["ANA"]], ["ARI", "Coyotes", "ari", ["ARI", "PHX", "WIN"]],
    ["BOS", "Bruins", "bos", ["BOS"]], ["BUF", "Sabres", "buf", ["BUF"]],
    ["CGY", "Flames", "cgy", ["CGY", "AFM"]], ["CAR", "Hurricanes", "car", ["CAR", "HFD"]],
    ["CHI", "Blackhawks", "chi", ["CHI"]], ["COL", "Avalanche", "col", ["COL", "QUE"]],
    ["CBJ", "Blue Jackets", "cbj", ["CBJ"]], ["DAL", "Stars", "dal", ["DAL", "MNS"]],
    ["DET", "Red Wings", "det", ["DET"]], ["EDM", "Oilers", "edm", ["EDM"]],
    ["FLA", "Panthers", "fla", ["FLA"]], ["LAK", "Kings", "la", ["LAK"]],
    ["MIN", "Wild", "min", ["MIN"]], ["MTL", "Canadiens", "mtl", ["MTL"]],
    ["NSH", "Predators", "nsh", ["NSH"]], ["NJD", "Devils", "nj", ["NJD", "CLR", "KCS"]],
    ["NYI", "Islanders", "nyi", ["NYI"]], ["NYR", "Rangers", "nyr", ["NYR"]],
    ["OTT", "Senators", "ott", ["OTT"]], ["PHI", "Flyers", "phi", ["PHI"]],
    ["PIT", "Penguins", "pit", ["PIT"]], ["SJS", "Sharks", "sj", ["SJS"]],
    ["SEA", "Kraken", "sea", ["SEA"]], ["STL", "Blues", "stl", ["STL"]],
    ["TBL", "Lightning", "tb", ["TBL"]], ["TOR", "Maple Leafs", "tor", ["TOR"]],
    ["UTA", "Mammoth", "utah", ["UTA"]],
    ["VAN", "Canucks", "van", ["VAN"]], ["VGK", "Golden Knights", "vgk", ["VGK"]],
    ["WSH", "Capitals", "wsh", ["WSH"]], ["WPG", "Jets", "wpg", ["WPG", "ATL"]],
  ];
  const nameByKey = {}, espnByKey = {}, toKey = {}, franchises = [];
  F.forEach(([key, name, espn, abbrs]) => {
    nameByKey[key] = name; espnByKey[key] = espn;
    abbrs.forEach((a) => (toKey[a] = key));
    franchises.push({ key, name, abbrs });
  });
  const HIST = { OAK: "Oakland Seals", CGS: "California Golden Seals", CLE: "Cleveland Barons" };
  const keyOf = (a) => toKey[a] || a;
  return {
    franchises, keyOf,
    name: (a) => nameByKey[keyOf(a)] || HIST[a] || a,
    logo: (a) => HIST[a] ? "" : "https://a.espncdn.com/combiner/i?img=/i/teamlogos/nhl/500/" + (espnByKey[keyOf(a)] || String(keyOf(a)).toLowerCase()) + ".png&w=128",
  };
})();
