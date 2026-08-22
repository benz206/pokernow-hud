import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { recommend } = require('../src/poker/advice.js');

const T = { canCheck: false, canCall: true, canRaise: true };
const cases = [
  ['clearly beaten, big bet',      0.15, { pot: 100, toCall: 100, ...T }, 'Fold'],
  ['drawing, price too steep',     0.20, { pot: 100, toCall: 100, ...T }, 'Fold'],
  ['drawing, cheap price',         0.30, { pot: 300, toCall: 50, ...T },  'Call'],
  ['right on the pot-odds line',   0.335, { pot: 100, toCall: 50, ...T }, 'Call'],
  ['strong hand facing a bet',     0.82, { pot: 100, toCall: 40, ...T },  'Raise'],
  ['strong but no raise available',0.82, { pot: 100, toCall: 40, canCall: true }, 'Call'],
  ['no bet, monster',              0.80, { pot: 100, toCall: 0, canCheck: true, canRaise: true }, 'Bet'],
  ['no bet, medium',               0.50, { pot: 100, toCall: 0, canCheck: true, canRaise: true }, 'Check'],
  ['no bet, weak',                 0.20, { pot: 100, toCall: 0, canCheck: true, canRaise: true }, 'Check'],
  ['facing bet, pot unknown',      0.70, { pot: null, toCall: 50, ...T },  'Call'],
  ['facing bet, pot unknown, weak',0.10, { pot: null, toCall: 50, ...T },  'Fold'],
];

let ok = true;
for (const [name, eq, ctx, want] of cases) {
  const r = recommend(eq, ctx);
  const pass = r.action === want;
  if (!pass) ok = false;
  console.log((pass ? '  ok  ' : ' FAIL ') + name.padEnd(32)
    + (r.action + ' — ' + r.detail).padEnd(38) + (pass ? '' : '(want ' + want + ')'));
}

// The pot-odds boundary must be monotone: more equity never turns Call into Fold.
let prev = 0, monotone = true;
const RANK = { Fold: 0, Check: 1, Call: 2, Bet: 3, Raise: 3 };
for (let e = 0; e <= 1.0001; e += 0.01) {
  const r = RANK[recommend(e, { pot: 100, toCall: 50, ...T }).action];
  if (r < prev) monotone = false;
  prev = r;
}
console.log((monotone ? '  ok  ' : ' FAIL ') + 'advice is monotone in equity');
if (!monotone) ok = false;

console.log('\n' + (ok ? 'advice: all cases pass' : 'advice: FAILURES'));
process.exit(ok ? 0 : 1);
