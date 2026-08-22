import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.PokerEval = require('../src/poker/evaluator.js');
const E = globalThis.PokerEval;

// Deliberately naive, structurally different reference: enumerate all 21 five-card
// subsets, rank each with plain sort-based logic, take the max.
function rank5(cards) {
  const rs = cards.map((c) => c >> 2).sort((a, b) => b - a);
  const ss = cards.map((c) => c & 3);
  const flush = ss.every((s) => s === ss[0]);
  const uniq = [...new Set(rs)];
  let straight = false, high = rs[0];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { straight = true; high = uniq[0]; }
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[4] === 0) { straight = true; high = 3; }
  }
  const groups = uniq
    .map((r) => ({ r, n: rs.filter((x) => x === r).length }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const shape = groups.map((g) => g.n).join('');
  const ord = groups.map((g) => g.r);

  let cat, kick;
  if (straight && flush) { cat = 8; kick = [high, 0, 0, 0, 0]; }
  else if (shape === '41') { cat = 7; kick = [ord[0], ord[1], 0, 0, 0]; }
  else if (shape === '32') { cat = 6; kick = [ord[0], ord[1], 0, 0, 0]; }
  else if (flush) { cat = 5; kick = [rs[0], rs[1], rs[2], rs[3], rs[4]]; }
  else if (straight) { cat = 4; kick = [high, 0, 0, 0, 0]; }
  else if (shape === '311') { cat = 3; kick = [ord[0], ord[1], ord[2], 0, 0]; }
  else if (shape === '221') { cat = 2; kick = [ord[0], ord[1], ord[2], 0, 0]; }
  else if (shape === '2111') { cat = 1; kick = [ord[0], ord[1], ord[2], ord[3], 0]; }
  else { cat = 0; kick = [rs[0], rs[1], rs[2], rs[3], rs[4]]; }

  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 16 + kick[i];
  return v;
}

const COMBOS = [];
for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++)
  for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) COMBOS.push([a, b, c, d, e]);

function slowEval7(cards) {
  let best = -1;
  for (const idx of COMBOS) {
    const v = rank5(idx.map((i) => cards[i]));
    if (v > best) best = v;
  }
  return best;
}

let s = 123456789;
const rnd = (n) => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s % n; };

const N = 400000;
const deck = Array.from({ length: 52 }, (_, i) => i);
let scoreMismatch = 0, orderMismatch = 0, catHist = new Array(9).fill(0);
let prevFast = null, prevSlow = null;

for (let t = 0; t < N; t++) {
  for (let i = 0; i < 7; i++) { const j = i + rnd(52 - i); const x = deck[i]; deck[i] = deck[j]; deck[j] = x; }
  const hand = deck.slice(0, 7);
  const fast = E.evaluate(hand, 7);
  const slow = slowEval7(hand);
  if (fast !== slow) { if (scoreMismatch++ < 3) console.log('SCORE DIFF', hand.map(E.cardToString).join(' '), fast, slow); }
  catHist[E.categoryOf(fast)]++;
  if (prevFast !== null) {
    const a = Math.sign(fast - prevFast), b = Math.sign(slow - prevSlow);
    if (a !== b) orderMismatch++;
  }
  prevFast = fast; prevSlow = slow;
}

console.log(`cross-checked ${N.toLocaleString()} random 7-card hands against an independent evaluator`);
console.log('  exact score mismatches:', scoreMismatch);
console.log('  pairwise ordering mismatches:', orderMismatch);
console.log('\ncategory frequencies (sim vs published 7-card odds):');
const pub = [17.4, 43.8, 23.5, 4.83, 4.62, 3.03, 2.60, 0.168, 0.0311];
E.CATEGORY_NAMES.forEach((n, i) => {
  const got = (catHist[i] / N) * 100;
  console.log('  ' + n.padEnd(17), got.toFixed(3).padStart(7) + '%', 'vs', pub[i].toFixed(3).padStart(7) + '%');
});
