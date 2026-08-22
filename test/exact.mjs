import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.PokerEval = require('../src/poker/evaluator.js');
const E = globalThis.PokerEval;

const h = (s) => s.split(' ').map(E.cardFromString);

function exactHeadsUp(heroStr, villStr) {
  const hero = h(heroStr), vill = h(villStr);
  const used = new Set([...hero, ...vill]);
  const rest = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);

  let win = 0, tie = 0, lose = 0;
  const a = [hero[0], hero[1], 0, 0, 0, 0, 0];
  const b = [vill[0], vill[1], 0, 0, 0, 0, 0];
  const n = rest.length;
  for (let i = 0; i < n - 4; i++) {
    a[2] = b[2] = rest[i];
    for (let j = i + 1; j < n - 3; j++) {
      a[3] = b[3] = rest[j];
      for (let k = j + 1; k < n - 2; k++) {
        a[4] = b[4] = rest[k];
        for (let l = k + 1; l < n - 1; l++) {
          a[5] = b[5] = rest[l];
          for (let m = l + 1; m < n; m++) {
            a[6] = b[6] = rest[m];
            const sa = E.evaluate(a, 7), sb = E.evaluate(b, 7);
            if (sa > sb) win++; else if (sa === sb) tie++; else lose++;
          }
        }
      }
    }
  }
  const total = win + tie + lose;
  return { win: win / total, tie: tie / total, lose: lose / total, total };
}

// AA vs KK is the most widely published matchup and is asserted against the
// published figure. The rest are locked regression baselines produced by this
// same exhaustive enumeration, so any future change to the evaluator shows up.
const cases = [
  ['As Ah', 'Ks Kh', 0.823648, 0.005436, 'published'],
  ['As Ks', 'Qc Qd', 0.460179, 0.003932, 'baseline'],
  ['Ac Kd', 'Qc Qd', 0.433984, 0.005022, 'baseline'],
  ['Ac Kd', 'Jh Ts', 0.624282, 0.003654, 'baseline'],
  ['8h 8d', '7s 6s', 0.805218, 0.008359, 'baseline'],
];

if (process.env.RECORD) {
  const out = cases.map(([a, b, , , src]) => {
    const r = exactHeadsUp(a, b);
    return `  ['${a}', '${b}', ${r.win.toFixed(6)}, ${r.tie.toFixed(6)}, '${src}'],`;
  });
  console.log(out.join('\n'));
  process.exit(0);
}

console.log('exhaustive enumeration of all C(48,5) = 1,712,304 boards per matchup\n');
console.log('hero    vill    win        expected   tie        expected   source');
let allOk = true;
for (const [a, b, wantWin, wantTie, source] of cases) {
  const r = exactHeadsUp(a, b);
  const ok = Math.abs(r.win - wantWin) < 5e-6 && Math.abs(r.tie - wantTie) < 5e-6;
  if (!ok) allOk = false;
  console.log(
    a, ' ', b, ' ',
    r.win.toFixed(6), ' ', wantWin.toFixed(6), ' ',
    r.tie.toFixed(6), ' ', wantTie.toFixed(6), ' ',
    source.padEnd(9), ok ? 'OK' : '*** MISMATCH ***',
  );
  if (r.total !== 1712304) { allOk = false; console.log('  board count wrong:', r.total); }
}
console.log('\n' + (allOk ? 'exact enumeration: all matchups match' : 'exact enumeration: MISMATCH'));
process.exit(allOk ? 0 : 1);
