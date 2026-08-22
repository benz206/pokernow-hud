# PokerNow HUD

A Chrome extension that shows live poker odds **directly on the PokerNow table** —
no popup, no clicking. A small draggable panel updates itself as cards are dealt.

## What it shows

| Stat | Meaning |
| --- | --- |
| **Equity** | Your win + tie share vs the active opponents, by Monte Carlo simulation |
| **Hand** | Your best five-card hand right now |
| **Outs** | Cards that turn a currently-losing hand into a winning one |
| **Pot** | Pot size read from the table (`not found` if it cannot be read) |
| **Pot odds** | The equity you need to break even on the call |
| **Call EV** | Your equity minus that break-even number (green = profitable call) |
| **Recommended action** | Fold / Check / Call / Bet / Raise, from equity vs pot odds |

The recommended button is outlined in green **on the table itself**, so you can act
without reading the panel.

The equity bar has a yellow marker at the pot-odds threshold, so a fill past the
marker means calling is +EV.

**Opponents are counted automatically** — seats still holding cards, minus anyone
folded or sitting out. The count drives the equity simulation and is shown in the
footer; it is detected from the table, not editable.

**On the recommendation:** it is a chip-EV suggestion computed from raw equity and
pot odds against *random* opponent hands. It knows nothing about position, opponent
ranges, betting patterns, or implied odds, and it assumes every opponent plays to
showdown. Treat it as a sanity check on your own read, not as a solver.

## Auto-play

The **AUTO** button in the header lets the HUD take the recommended action for you.
While it is on the panel gets an amber border and an "Auto-playing" bar, and every
action it takes is listed in the panel with the reason.

- It acts on a 0.7–1.9 s randomised delay, and re-checks that the spot has not
  changed before committing
- It acts **once per spot** — it cannot loop or double-act
- Raises are sized to two-thirds of the pot as it would stand after calling, typed
  into the raise box. It verifies the box actually holds that number before pressing
  Raise; if the value will not stick it falls back to Call/Check and says so, so a
  stale pre-filled amount can never commit your stack
- **Escape** is a hard stop, as is toggling AUTO off
- **It only acts on your turn.** Pre-action controls ("Fold", "Check/Fold",
  "Call Any") are on screen while you wait and are never pressed; if the table
  marks which seat is acting, that must be yours; and the turn is re-confirmed
  again after the delay, immediately before it commits
- **It knows when you have folded** and sits out the rest of the hand — both from
  the seat being marked folded on the table and from having seen the Fold button
  pressed, whether it pressed it or you did

This is a play-money tool for learning — PokerNow has no cashier and its chips cannot
be cashed out. The decision log is the point: it shows the pot-odds reasoning behind
every action so the arithmetic becomes intuition.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Open a PokerNow table — the panel appears once you're dealt in

## Using it

- **Drag** the header to move it, **drag the bottom-right corner** to resize it
  (0.7x–2.5x). Both are press-move-release drags, and both are remembered
- **–** collapses the panel, **Alt+H** hides it entirely
- **⌕** dumps parser diagnostics to the console

## If something breaks

The panel reports its own failures now: an error shows up in the panel text and is
logged to the console tagged `[PokerNow HUD]`.

One message is worth knowing: **"Extension reloaded — refresh this page"**. Reloading
the extension in `chrome://extensions` orphans the copy already running in your open
tab, and every `chrome.*` call from it then fails with "Extension context
invalidated". It shuts itself down cleanly and waits; just refresh the PokerNow tab.

## If the numbers stop appearing

PokerNow can change its markup at any time, which is the one fragile part of any
scraper like this. The parser tries several selector strategies and falls back to
scanning for card-shaped elements, but if it still comes up empty:

Click **⌕** on the panel. It copies a JSON dump to your clipboard containing the
matched selectors, what it parsed, a survey of the actual class names on the page,
and sample card HTML — everything needed to repoint the selector lists at the top of
`src/content/parser.js`. (It also logs to the console; the panel itself will say
"Cards on table but unreadable" when this is the problem.)

## Architecture

```
manifest.json              MV3 manifest
src/poker/evaluator.js     7-card hand evaluator -> comparable integer score
src/poker/equity.js        Monte Carlo equity + conditional outs
src/poker/advice.js        Equity + pot odds -> recommended action and raise size
src/background/index.js    Service worker; runs simulations off the page's thread
src/content/parser.js      Scrapes cards, opponents, pot and call amount
src/content/overlay.js     The panel UI
src/content/index.js       Observes the table, throttles, requests, renders
```

Simulation runs in the extension service worker, so the poker table's own UI never
janks. A full analysis takes 6–26 ms.

## Tests

```
npm install    # jsdom, for the DOM tests only
npm test
```

- `crosscheck.mjs` — the fast evaluator vs an independent naive implementation over
  400k random 7-card hands, plus category frequencies against published 7-card odds
- `exact.mjs` — exhaustive enumeration of all 1,712,304 boards for known matchups
  (AA vs KK reproduces the published 82.36% / 0.54% exactly)
- `advice.test.mjs` — the recommendation across pot-odds boundaries, including a
  check that advice is monotone in equity
- `variants.test.mjs` — the scraper against seven plausible card layouts and eight
  opponent-counting scenarios
- `interaction.test.mjs` — drag and resize, including that the panel stops moving on
  release and survives a pointer released off-window or cancelled mid-drag
- `autoplay.test.mjs` — that auto-play clicks nothing while off, sizes and commits a
  raise while on, acts exactly once per spot, refuses to raise when the amount will
  not stick, never types into the chat box, and stops dead on Escape
- `state.test.mjs` — pot reading (main value plus add-on, side pots, comma
  grouping, chips still in front of players, genuinely empty vs not found) and
  fold detection
- `parser.test.mjs` — the scraper against a PokerNow-shaped DOM fixture
- `e2e.test.mjs` — the whole content script in jsdom, including a regression test
  that the HUD keeps refreshing under constant DOM animation

## Note

Real-time assistance is against the rules of most online poker sites. PokerNow is
mainly used for private home games — check with your table before running this.
