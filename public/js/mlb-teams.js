/* MLB franchise helper (team field is already the franchise key). */
window.MLB = (function () {
  "use strict";
  const F = [
    ["ANA", "Angels", "laa"], ["ARI", "Diamondbacks", "ari"], ["ATL", "Braves", "atl"],
    ["BAL", "Orioles", "bal"], ["BOS", "Red Sox", "bos"], ["CHC", "Cubs", "chc"],
    ["CHW", "White Sox", "chw"], ["CIN", "Reds", "cin"], ["CLE", "Guardians", "cle"],
    ["COL", "Rockies", "col"], ["DET", "Tigers", "det"], ["FLA", "Marlins", "mia"],
    ["HOU", "Astros", "hou"], ["KCR", "Royals", "kc"], ["LAD", "Dodgers", "lad"],
    ["MIL", "Brewers", "mil"], ["MIN", "Twins", "min"], ["NYM", "Mets", "nym"],
    ["NYY", "Yankees", "nyy"], ["OAK", "Athletics", "oak"], ["PHI", "Phillies", "phi"],
    ["PIT", "Pirates", "pit"], ["SDP", "Padres", "sd"], ["SEA", "Mariners", "sea"],
    ["SFG", "Giants", "sf"], ["STL", "Cardinals", "stl"], ["TBD", "Rays", "tb"],
    ["TEX", "Rangers", "tex"], ["TOR", "Blue Jays", "tor"], ["WSN", "Nationals", "wsh"],
  ];
  const nameByKey = {}, espnByKey = {}, franchises = [];
  F.forEach(([key, name, espn]) => {
    nameByKey[key] = name; espnByKey[key] = espn;
    franchises.push({ key, name, abbrs: [key] });
  });
  return {
    franchises,
    keyOf: (a) => a,
    name: (a) => nameByKey[a] || a,
    logo: (a) => "https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/" + (espnByKey[a] || String(a).toLowerCase()) + ".png&w=128",
  };
})();
