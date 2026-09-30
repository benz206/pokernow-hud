import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recommend, potOdds, sizing } = require('../src/poker/advice.js');
const ctx = { pot: 150, toCall: 50, canCall: true, canRaise: true, canFold: true, yourTurn: true,
  opponents: 1, board: [0, 1, 2, 3, 4], street: 'river', heroId: 'hero', ranges: [], events: [] };
const result = equity => ({ equity, tie: 0, stderr: 0, continuing: null });
assert.equal(potOdds(ctx), .25);
for (const spot of [{ pot: null }, { pot: 0 }, { pot: 20 }, { sidePots: true }, { uncalledExcess: true }, { stack: 20 }]) assert.equal(potOdds({ ...ctx, ...spot }), null);
assert.equal(recommend(result(.24), ctx).action, 'Fold');
assert.equal(recommend(result(.26), ctx).action, 'Call');
assert.equal(recommend(result(.9), ctx).action, 'Call', 'high random equity does not imply value raise');
assert.equal(recommend(result(.32), { ...ctx, pot: 100 }).action, 'Fold', 'no tolerance permitting a known losing call');
assert.equal(recommend({ ...result(.25), stderr: .01 }, ctx).action, 'Review');
assert.equal(recommend(result(.5), { ...ctx, pot: null }).action, 'Review');
assert.equal(recommend(result(.9), { ...ctx, canCheck: true, toCall: 0 }).action, 'Check');
const check = recommend(result(.1), { ...ctx, canCheck: true, toCall: 0 });
assert.equal(check.detail, '');
assert.equal(check.lesson, '');
assert.deepEqual(check.reasons, []);
assert.equal(recommend(result(.9), { ...ctx, toCall: null }).action, 'Review');
const value = recommend({ ...result(.8), continuing: result(.7) }, ctx);
assert.equal(value.action, 'Raise');
assert.equal(value.amount, 182);
assert.equal(value.autoEligible, true);
assert.equal(recommend({ ...result(.9), continuing: result(.2) }, ctx).action, 'Call');
assert.equal(recommend({ ...result(.9), continuing: result(.8) }, { ...ctx, opponents: 2 }).action, 'Call');
assert.equal(recommend({ ...result(.9), continuing: result(.8) }, { ...ctx, raiseMax: 100 }).action, 'Call');
assert.equal(sizing(150, 50, 20), 202, 'raise-to includes hero chips already committed');
assert.equal(recommend(result(.4), { ...ctx, street: 'flop', board: [0, 1, 2] }).ev, null);
assert.equal(recommend(result(.4), { ...ctx, street: 'flop', board: [0, 1, 2] }).autoEligible, false);
assert.equal(recommend(result(.4), { ...ctx, street: 'flop', closesAction: true }).ev, 30);
assert.ok(Math.abs(recommend(result(1 / 3), ctx).ev - (200 / 3 - 50)) < 1e-10);
assert.equal(recommend(result(.8), { ...ctx, practice: true }).autoEligible, false);
for (const street of ['preflop', 'flop', 'turn', 'river']) {
  for (const opponents of [1, 3]) {
    const full = { ...ctx, street, opponents, autoMode: 'full' };
    assert.equal(recommend(result(.4), full).autoEligible, true);
    assert.equal(recommend(result(.1), full).action, 'Fold');
    assert.equal(recommend(result(.1), full).autoEligible, true);
    for (const invalid of [{ sidePots: true }, { pot: null }, { uncalledExcess: true }, { practice: true }, { yourTurn: false }]) {
      assert.equal(recommend(result(.4), { ...full, ...invalid }).autoEligible, false);
    }
  }
}
assert.equal(recommend({ ...result(.251), stderr: .01 }, { ...ctx, autoMode: 'full' }).action, 'Call');
assert.equal(recommend({ ...result(.249), stderr: .01 }, { ...ctx, autoMode: 'full' }).action, 'Fold');
const observed = recommend(result(.4), { ...ctx, events: [{ playerId: 'alex', street: 'river', action: 'Bet', text: 'Alex bets 50' }],
  ranges: [{ id: 'alex', name: 'Alex', text: '88,JT', reason: 'Selected by you' }] });
assert.match(observed.facts[0], /Alex bets 50/);
assert.match(observed.assumptions[0], /Selected by you/);
assert.match(observed.lesson, /25.0% bluffs/);
assert.ok(observed.alternatives.some(s => /25.0%/.test(s)));
console.log('advice: price, EV, uncertainty, value ranges, legal amounts and lessons pass');
