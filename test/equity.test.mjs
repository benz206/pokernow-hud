import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../src/poker/evaluator.js');
const Q = require('../src/poker/equity.js');
const R = require('../src/poker/ranges.js');
const cards = s => s.split(' ').map(E.cardFromString);
const run = (hole, board, n = 1, ranges) => Q.analyze({ hole: cards(hole), board: board ? cards(board) : [], opponents: n, ranges, iterations: 25000 });
assert.equal(R.parse('AA').combos.length, 6);
assert.equal(R.parse('AKs').combos.length, 4);
assert.equal(R.parse('AKo').combos.length, 12);
assert.equal(R.parse('TT+').combos.length, 30);
assert.equal(R.parse('AJs+').combos.length, 12);
assert.equal(R.parse('AA,AsAh:0.5').combos.length, 6);
for (const text of ['AA:0', 'AA:2', 'AA:no', 'AsAs', 'KAo', 'QQs', 'junk']) assert.throws(() => R.parse(text));
for (const n of [1, 2, 5]) {
  const r = run('2c 3d', 'Ts Js Qs Ks As', n);
  assert.equal(r.tie, 1);
  assert.ok(Math.abs(r.equity - 1 / (n + 1)) < 1e-10);
  assert.equal(r.win + r.tie + r.lose, 1);
}
const aa = run('As Ah', '', 1, [R.parse('Ks Kh'.replace(' ', '')).combos]);
assert.ok(Math.abs(aa.win - .823648) < .015, JSON.stringify(aa));
assert.ok(Math.abs(aa.tie - .005436) < .005);
// Independent exhaustive river calculation vs every legal random opponent hand.
const hole = cards('Ks Qh'), board = cards('Kc 8d 4s 2h 9c');
const unseen = Array.from({ length: 52 }, (_, c) => c).filter(c => ![...hole, ...board].includes(c));
let share = 0, count = 0;
const score = E.evaluate([...hole, ...board]);
for (let i = 0; i < unseen.length; i++) for (let j = i + 1; j < unseen.length; j++) {
  const other = E.evaluate([unseen[i], unseen[j], ...board]);
  share += score > other ? 1 : score === other ? .5 : 0; count++;
}
assert.ok(Math.abs(run('Ks Qh', 'Kc 8d 4s 2h 9c').equity - share / count) < .015);
const weighted = run('Ks Qh', 'Kc 8d 4s 2h 9c', 1, [R.parse('8c8h,TcJh:0.5').combos]);
assert.ok(Math.abs(weighted.equity - 1 / 3) < .015);
assert.equal(run('Ks Qh', 'Kc 8d 4s 2h 9c', 1, [R.parse('8c8h').combos]).equity, 0);
assert.match(run('Ks Qh', 'Kc 8d 4s 2h 9c', 1, [R.parse('KsKh').combos]).error, /blockers/);
assert.match(run('Ks Qh', 'Kc 8d 4s 2h 9c', 2, [R.parse('8c8h').combos, R.parse('8c8h').combos]).error, /conflict/);
assert.match(Q.analyze({ hole: [0, 1], board: [2, 3], opponents: 1 }).error, /incomplete/);
const draw = Q.drawsFor(cards('Ah Kh'), cards('Th Jh 2s'));
assert.equal(draw.count, 12);
assert.equal(draw.flush.length, 9);
assert.ok(!draw.cards.includes('As'));
assert.equal(draw.nextCard, 12 / 47);
assert.ok(Math.abs(draw.byRiver - (1 - 35 * 34 / (47 * 46))) < 1e-12);
assert.equal(Q.drawsFor(cards('2c 3d'), cards('Ts Js Qs Ks')).count, 0);
assert.ok(Q.analyze({ hole: cards('As Ah'), board: cards('Ac Ad 9s 8h 7d'), opponents: 1, continuing: null }).continuing.equity === 1,
  'explicit random continuing range is supported');
console.log('equity: ranges, blockers, weights, ties, draws and production sampler cross-checks pass');
