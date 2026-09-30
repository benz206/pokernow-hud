import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../src/poker/history.js');
const R = require('../src/poker/ranges.js');
const E = require('../src/poker/evaluator.js');
const A = require('../src/poker/advice.js');
const cards = s => s.split(' ').map(E.cardFromString);
const player = (id, extra = {}) => ({ id, name: id === 'hero' ? 'You' : 'Alex', hero: id === 'hero', inHand: true, folded: false, bet: 0, stack: 1000, position: id === 'hero' ? 'BB' : 'BTN', ...extra });
const snap = (extra = {}) => ({ hole: cards('Ks Qh'), board: [], folded: false, street: 'preflop', dealer: 2,
  players: [player('hero'), player('alex')], heroId: 'hero', pot: 3, toCall: 0, log: [], ...extra });
const row = (text, people = []) => ({ text, people, at: '12:30' });
const alex = { id: 'alex', name: 'Alex' }, hero = { id: 'hero', name: 'You' };
const logs = [row("-- starting hand #12 (id: example) No Limit Texas Hold'em (dealer: Alex) --"),
  row('Player stacks: #1 You (1,000) | #2 Alex (1,000)', [hero, alex]), row('Your hand is K♠, Q♥'),
  row('Alex posts a small blind of 1', [alex]), row('You posts a big blind of 2', [hero]),
  row('Alex raises to 6', [alex]), row('You calls 4', [hero]), row('Flop: [K♣, 8♦, 4♠]'),
  row('You checks', [hero]), row('Alex bets 4', [alex]), row('You calls 4', [hero]),
  row('Turn: [K♣, 8♦, 4♠, 2♥]'), row('You checks', [hero]), row('Alex checks', [alex]),
  row('River: [K♣, 8♦, 4♠, 2♥, 9♣]'), row('You checks', [hero]), row('Alex bets 50', [alex])];
const parsed = H.parseLog(logs);
assert.equal(parsed.number, 12); assert.deepEqual(parsed.hole, cards('Ks Qh'));
assert.equal(parsed.stacks[0].stack, 1000);
assert.deepEqual(parsed.events.filter(e => e.action === 'Deal').map(e => e.street), ['flop', 'turn', 'river']);
assert.equal(parsed.events.at(-1).playerId, 'alex'); assert.equal(parsed.events.at(-1).action, 'Bet');
const history = H.create();
history.observe(snap());
const raised = snap({ players: [player('hero', { bet: 2 }), player('alex', { bet: 6 })] });
history.observe(raised);
assert.equal(history.current.events.filter(e => e.action === 'Wager').length, 2, 'do not invent order when multiple bets change');
const river = snap({ board: cards('Kc 8d 4s 2h 9c'), street: 'river', pot: 150, toCall: 50, log: logs });
history.observe(river);
assert.equal(history.current.number, 12);
assert.equal(history.current.players[0].startingStack, 1000);
assert.equal(history.current.partial, false);
const length = history.current.events.length, revision = history.revision;
history.observe(river); assert.equal(history.current.events.length, length); assert.equal(history.revision, revision);
assert.equal(history.current.events.filter(e => e.action === 'Deal').length, 3);
const range = R.forPlayers(river, history.current, {});
assert.equal(range[0].mode, 'late');
const advice = A.recommend({ equity: .4, stderr: 0 }, { ...river, opponents: 1, yourTurn: true, canCall: true,
  events: history.current.events, ranges: range });
assert.equal(advice.facts[0], 'Alex bets 50');
assert.match(advice.reasons[0], /Alex opened the betting/);
const decision = history.record(river, advice, 'Call', { kind: 'manual' });
const recordedAssumption = decision.advice.assumptions[0];
river.pot = 500; advice.assumptions[0] = 'changed';
assert.equal(decision.snapshot.pot, 150); assert.equal(decision.advice.assumptions[0], recordedAssumption);
const recordedEvent = decision.snapshot.events[0].text;
history.current.events[0].text = 'later enrichment';
assert.equal(decision.snapshot.events[0].text, recordedEvent, 'later log enrichment cannot rewrite decision context');
history.observe({ ...river, log: [...logs, row('You calls 50', [hero]), row('Alex collected 200 from pot', [alex]), row('-- ending hand #12 --')] });
assert.equal(decision.confirmed, true); assert.equal(history.current.finished, true);
const beforeEndPoll = history.revision;
history.observe({ ...river, log: [...logs, row('You calls 50', [hero]), row('Alex collected 200 from pot', [alex]), row('-- ending hand #12 --')] });
assert.equal(history.revision, beforeEndPoll);
const saved = JSON.parse(JSON.stringify(history.hands));
const next = snap({ log: [row('-- starting hand #13 --'), row('Your hand is K♠, Q♥')] });
history.observe(next);
assert.equal(history.hands.length, 2, 'same hole cards in consecutive hands still get a new hand');
assert.equal(history.current.number, 13);
assert.equal(saved[0].decisions[0].snapshot.pot, 150);
const fresh = H.create(saved); fresh.observe(river);
assert.equal(fresh.current.decisions.length, 1, 'reload preserves decision history');
const oldNumber = history.current.number;
history.observe(snap({ log: logs })); assert.equal(history.current.number, oldNumber, 'browsing old logs cannot replace the current hand');
const reraised = { events: [{ playerId: 'alex', street: 'preflop', action: 'Raise' }, { playerId: 'hero', street: 'preflop', action: 'Raise' }, { playerId: 'alex', street: 'preflop', action: 'Raise' }] };
assert.equal(R.forPlayers(snap(), reraised, {})[0].mode, 'reraise');
const bad = R.forPlayers(snap(), null, { alex: { mode: 'custom', text: 'AA', continuing: 'KK' } });
assert.match(bad[0].error, /subset/);
const bounded = H.create();
for (let n = 1; n <= 55; n++) {
  const next = snap({ log: [row('-- starting hand #' + n + ' --'), row('Your hand is K♠, Q♥')] });
  bounded.observe(next);
  for (let i = 0; i < 5; i++) bounded.record(next, { action: 'Check' }, 'Check', { kind: 'practice' });
}
assert.equal(bounded.hands.length, 50);
assert.equal(bounded.hands.reduce((n, h) => n + h.decisions.length, 0), 200);
const allInHistory = H.create();
allInHistory.observe(snap());
const allInChoice = allInHistory.record(snap(), { action: 'Review' }, 'All-in', { kind: 'manual', amount: 1000 });
allInHistory.observe(snap({ players: [player('hero', { bet: 1000, stack: 0, allIn: true }), player('alex')] }));
assert.equal(allInChoice.confirmed, true);
console.log('history: complete hand, streets, identities, stacks, deduplication, ranges, decisions and rollover pass');
