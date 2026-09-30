# PokerNow Coach

A Chrome extension that explains decisions on a PokerNow Hold’em table. The panel
connects observed actions to explicit assumptions, shows the arithmetic, and saves
your own decisions for review.

## Learn a decision

The panel separates:

- **Observed:** the player’s action, your position and effective remaining stack
  when readable. Table-inferred actions are labelled as inferred.
- **Because:** why that action or call price affects the recommendation.
- **Assumptions:** the opponent ranges used in the calculation, including why an
  example range was selected. These are teaching models, not solver charts or
  claims that we know someone’s cards or playing style.
- **Alternatives:** what would change the answer, and the difference between
  betting for value and bluffing.

For example, paying 50 into a pot of 150 requires 25% equity. A river call with
33.3% equity against your assumed betting range has about +16.7 chips of EV,
assuming no rake or further betting. If a different assumed range lowers your
equity below 25%, the recommendation changes to Fold.

In **Settings (⚙)**, **Choose first, then reveal the lesson** hides the recommendation, equity and table
highlight. Choose a practice action inside the panel to reveal the explanation;
these buttons never play an action at the table. Making your own actual table
choice also records that choice. A new decision hides the answer again.

## Opponent assumptions

Open **Opponent assumptions** to inspect or change each active player’s range.
The default uses observed preflop aggression and readable position to select an
explicit opening or re-raise example. With no observed raise, it uses random hands.
It retains that starting range on later streets; it does not pretend to infer
postflop bluff frequencies from a single bet.

Select **Custom range** for hands such as:

```
QQ+, AJs+, AKo, 8c8h, TcJh:0.5
```

- `QQ+`: QQ, KK and AA; `AJs+`: AJs, AQs and AKs.
- `s` means suited, `o` means offsuit, and no suffix includes both.
- `AsKd` is one exact combination. Ranks are written higher first for hand classes.
- Weights are relative, greater than 0 and at most 1. A combination weighted 0.5
  is half as likely as one weighted 1. The last occurrence wins on overlaps.
- Known cards remove impossible combinations. An empty or conflicting range
  produces an error instead of silently reverting to random hands.

**Continues vs our raise** is an optional subset of that player’s range. In a
heads-up pot, the coach checks equity against those assumed callers before offering
a value bet or raise. It no longer treats high equity against random hands as
proof that a value raise is good. Bet sizing is an example, not an optimized size.
Ranges are editable assumptions saved locally; reset a player to the default
selection when you want to stop using your custom read.

## What the numbers mean

| Number | Meaning |
| --- | --- |
| Showdown equity | Expected share of the pot after all remaining board cards, against the displayed ranges |
| Tie | Probability of tying for the best hand; split-pot share is accounted for separately in equity |
| Pot odds | Call amount divided by the pot after your call |
| Equity margin | Showdown equity minus required equity, in percentage points |
| Call EV (model) | Expected chips under the shown assumptions; shown on the river or a heads-up all-in call |
| Draw cards | Unique one-card flush/straight completions, excluding improvements shared entirely by the board |

Draw-completion probabilities describe seeing one of the listed cards, with known
cards removed. They do not model opponents holding those cards, backdoor draws,
higher made hands or opponents improving afterward. They are **not guaranteed
winning outs**. The detail view distinguishes the next card from seeing both turn
and river.

On early streets, showdown equity is only a baseline: a call may not buy all the
remaining cards. The coach says this explicitly and does not present it as realized
call EV. Close simulation results request review in Selective mode; Full Auto uses
the estimated call/fold threshold and labels the uncertainty. Unknown/inconsistent pots,
side pots and potentially uncalled excess also request review rather than
manufacturing a price.

## Hand history and decision review

The coach reads player identities, stacks, current commitments and the dealer
marker from the visible table. When **Log / Ledger → Full Log** is open, it also
reads PokerNow’s public log entries, including hand numbers, streets, bets, raises,
calls, checks, folds, starting stacks and result events. It does not open the log
for you or fetch hidden application state. Open it to supply the available hand
sequence; revisit it if PokerNow’s log view is not updating.

Without a full log, the coach records changes it can observe on the table and marks
the history as partial. Simultaneous wager changes are labelled with unknown action
order. It cannot reconstruct unseen checks or actions that occurred while the tab
was closed. Dead-button positions remain unknown rather than being guessed.

**Decision review** remains available when AUTO is off, after folding, and between
hands. It records manual selections, automated selections and practice choices,
along with the cards, price, ranges, explanation and action sequence known at that
time. Later cards and edits do not rewrite an earlier lesson. A click is shown as a
selection until a table update or log confirms it. Results appear separately in the
hand timeline and do not grade a decision as good merely because it won.

History is saved in `chrome.storage.local`, separately for each table path. The
latest 50 hands and up to 200 decisions are retained (up to 50 decisions and 200
events per hand), with older records pruned if the journal exceeds 4 MiB. There is
no external analytics or AI service.
If browser storage rejects a save, the panel reports it and retains the review in
the current tab instead of claiming it was saved.

## AUTO

Choose the mode in **Settings (⚙)**, then use the header button to start or stop:

- **Selective auto** takes free checks and heads-up river or all-in decisions.
  Early-street and multiway decisions wait for your review.
- **Full Auto** follows the model on every street, including multiway pots. Close
  estimates call above the pot-odds threshold and fold at or below it. It still
  pauses for invalid ranges, unreadable prices, side pots or missing legal controls.

Full Auto uses the same showdown-equity baseline, not a model of future betting.
Value bets and raises still require an explicit continuing range. The mode is
saved locally. Choose-first mode disables automation; starting auto disables
choose-first.

The panel puts the action and short explanation first. Free checks have no routine
lesson. Open **Numbers & deeper reasoning** for calculations and alternatives.

- Escape stops AUTO immediately.
- The turn, legal controls, cards, pot, call amount, stacks, limits and range
  assumptions are checked again before acting.
- A changed decision replaces the pending action and its amount.
- All-in controls are separate from ordinary raise controls and are never used as
  a substitute for Raise.
- Raises include your existing street commitment in the target total. The amount
  must stick after the table’s input handler renders; otherwise it falls back to
  Call/Check and records why.
- A pre-action Fold is not treated as a completed fold.
- Only one selection is made per observed decision turn.

## Install or update

1. Open `chrome://extensions` and enable Developer mode.
2. Load this folder with **Load unpacked**, or reload the existing extension.
3. Refresh your PokerNow tab to load the new content scripts.

Drag the header to move the panel; drag its bottom-right corner to resize it.
Collapse with **–** and hide with **Alt+H**. The journal and longer explanations
scroll inside the panel. **Settings (⚙)** also contains parser diagnostics.

After reloading the extension, an old tab displays “Extension reloaded — refresh
this page” and stops taking actions. Refresh that tab.

## Development and verification

```
npm install
npm test
```

The suite includes an independent 400,000-hand evaluator cross-check, five exhaustive
known matchups, production sampler checks against exact probabilities, weighted
ranges and blockers, split pots, draw completions, advice boundaries, full hand
sequences, persistence, choose-first behavior, parser layouts and action regressions.
Evaluator mismatches now fail the test process.

For a browser preview, serve the repository locally and open
`test/coach-fixture.html`. It is a clearly marked simulated table using the actual
content scripts and equity engine; no buttons affect a real PokerNow game.

```
python3 -m http.server 8765 --bind 127.0.0.1
# Open http://127.0.0.1:8765/test/coach-fixture.html
```

The simulation runs in the extension service worker. `parser.js` reads table/log
markup; `history.js` maintains hands and decision snapshots; `ranges.js` expands
editable models; `advice.js` owns the shared call-price math and lessons;
`overlay.js` presents them; `index.js` coordinates updates, storage and actions.

PokerNow markup can change. Unknown observations remain unknown, and incomplete
history is shown explicitly. This is a model-based learning aid, not a solver.
Check that assistance is permitted at your table.
