# EBK Deep Cut: question bank spec

"Deep Cut" is the daily one-question game on Elite Ball Knowledge (eliteballknowledge.web.app).
Every day at midnight ET every visitor gets the same single question. They get 3 guesses,
typed as free text (or a number). After a miss they see hint 1, after a second miss hint 2.
Number answers also get "higher / lower" feedback after each miss. After the round, the answer
and a short "fact" paragraph are revealed. Players share their result and come back tomorrow.

## What a good question is

- Real deep ball knowledge. Not "who won Super Bowl 50" (too easy) and not unanswerable
  box-score noise ("how many yards did X have in Week 7 of 2011"). The sweet spot: a hardcore
  fan has a real shot, a casual fan learns something cool. Think: forgotten record holders,
  the other guy in a famous moment, weird trivia with a story, coaching trees, draft oddities,
  one-season wonders, nicknames, iconic numbers (e.g. a famous single-season total), teams
  that no longer exist, strange rule-change origins, trades that became legendary.
- Answer types should vary: player, player + specific season, a number (TDs, goals, wins,
  jersey number, year, etc.), team/franchise, coach/GM, venue/city, nickname.
- Exactly ONE correct answer. Watch for ties, co-holders, and records that were later broken
  (phrase with a fixed time frame, e.g. "Through the 2024 season" or "In 2007"). Avoid facts
  that can change after September 2026 unless the question pins the time frame.
- Question text: one or two sentences, max ~220 characters, no answer leakage. Do NOT say the
  answer's name anywhere in the question, hints, or options. The "fact" may.
- Hints are progressive: hint 1 narrows it a little (era, team, position), hint 2 makes it very
  gettable for a real fan (college, nickname, a teammate, a range for numbers). Hints must be
  TRUE and must not contain the answer string.
- Spread difficulty: about 30% difficulty 2 ("real fan"), 50% difficulty 3 ("deep"),
  20% difficulty 4 ("elite, almost nobody gets it without hints"). No difficulty 1.
- Spread eras (1960s to 2025) but weight toward 1985-2025 so the audience has lived it.
- Tone: fun, confident, short. No em dashes (—) anywhere; use commas, periods, colons.

## Accuracy is non-negotiable

Every single question must be fact-checked before it goes in the file. Use WebSearch/WebFetch
(Wikipedia, Pro-Football-Reference, Basketball-Reference, Baseball-Reference,
Hockey-Reference, Sports-Reference CFB/CBB, FBref/Transfermarkt, official league sites) and/or
local data. Put the URL you actually checked in "source". If you cannot verify it, DROP it.
Numbers must be exact (tolerance 0) unless the question explicitly asks for an approximate.
Check uniqueness: is there any other answer that is also correct? If so rewrite or drop.

## JSON format

The output file is a JSON array. Each item:

```json
{
  "id": "nfl-001",
  "sport": "nfl",                 // nfl | nba | mlb | nhl | cfb | cbb | soccer
  "type": "player",               // player | player-season | number | team | coach | year | venue | nickname | other
  "difficulty": 3,                // 2, 3 or 4
  "q": "The question text?",
  "answer": "Canonical display answer",
  "kind": "text",                 // "text" or "number"
  "num": null,                    // for kind "number": the exact numeric value (integer or decimal)
  "accept": ["lowercase alias", "..."],  // for kind "text": every reasonable way to type it,
                                  // lowercase, no punctuation needed (matching strips it):
                                  // full name, common short name, last name ONLY if the last
                                  // name alone is unambiguous in the context of the question,
                                  // nickname if commonly used, city-only / nickname-only for
                                  // teams ("packers", "green bay"), "st louis" vs "saint louis".
                                  // For player-season answers accept the player name (the
                                  // season is given away by the question) unless the season
                                  // is the thing being asked.
  "hints": ["hint 1", "hint 2"],
  "fact": "1-3 sentence reveal that makes the answer land, with one extra cool detail.",
  "source": "https://... (the page you verified against)"
}
```

For kind "number", "accept" can be [] and "num" must be set. Year answers use kind "number".
