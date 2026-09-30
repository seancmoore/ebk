/* EBK catalog — single source of truth for sports + games. */
window.EBK = {
  sports: [
    { key: "nfl",    name: "NFL",        emoji: "\u{1F3C8}", accent: "#3ddc97", status: "live", blurb: "Pro football, 1999–present.",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },
    { key: "cfb",    name: "College FB", emoji: "\u{1F3DF}️", accent: "#f4a300", status: "live", blurb: "FBS, 2014–2025.",
      logo: "https://a.espncdn.com/i/espn/misc_logos/500/ncaa_football.png" },
    { key: "nba",    name: "NBA",        emoji: "\u{1F3C0}", accent: "#ff7a3c", status: "live", blurb: "Pro basketball, 2002–2026.",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png" },
    { key: "mlb",    name: "MLB",        emoji: "⚾",    accent: "#4aa3ff", status: "live", blurb: "America's pastime, 2000–2026.",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png" },
    { key: "nhl",    name: "NHL",        emoji: "\u{1F3D2}", accent: "#5fd0e6", status: "live", blurb: "Pro hockey, 2000–2026.",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png" },
    { key: "soccer", name: "Soccer",     emoji: "⚽",    accent: "#8ee04a", status: "live", blurb: "Premier League, 2016–2026.",
      logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png" },
  ],

  // small league-logo <img> (falls back to the emoji if the logo can't load)
  logoTag: function (s, cls) {
    if (!s) return "";
    if (!s.logo) return '<span class="league-emoji">' + s.emoji + "</span>";
    return '<img class="league-logo ' + (cls || "") + '" src="' + s.logo + '" alt="' + s.name +
      '" loading="lazy" onerror="this.outerHTML=\'<span class=league-emoji>' + s.emoji + '</span>\'" />';
  },

  // shared game types offered for every sport
  games: [
    { slug: "higher-lower", title: "Higher / Lower", emoji: "\u{1F4C8}",
      desc: "Two player-seasons, one stat — call higher or lower and run the streak." },
    { slug: "stat-line", title: "Guess the Stat Line", emoji: "\u{1F9FE}",
      desc: "Name the player from a mystery season's numbers." },
    { slug: "career-path", title: "Career Path", emoji: "\u{1F5FA}️",
      desc: "Trace draft, college and team clues to the player." },
    { slug: "player-grid", title: "Player Grid", emoji: "\u{1F532}",
      desc: "Name a player for every team-and-stat square." },
    { slug: "team", title: "Team Study", emoji: "\u{1F4CA}",
      desc: "Browse, filter and sort every player-season for a team." },
  ],

  // which game slugs are live per sport key
  live: {
    nfl: ["higher-lower", "stat-line", "career-path", "player-grid", "team"],
    nba: ["higher-lower", "stat-line", "career-path", "player-grid", "team"],
    mlb: ["higher-lower", "stat-line", "career-path", "player-grid", "team"],
    nhl: ["higher-lower", "stat-line", "career-path", "player-grid", "team"],
    cfb: ["higher-lower", "stat-line", "career-path", "team"],
    soccer: ["higher-lower", "stat-line", "career-path", "player-grid", "team"],
  },

  sport: function (key) { return this.sports.find(function (s) { return s.key === key; }); },
  isLive: function (sportKey, slug) { return (this.live[sportKey] || []).indexOf(slug) !== -1; },
  // a sport is playable if it has any live game
  sportLive: function (key) { return (this.live[key] || []).length > 0; },
  href: function (sportKey, slug) {
    return slug === "team" ? "/" + sportKey + "/teams" : "/" + sportKey + "/" + slug;
  },
};
