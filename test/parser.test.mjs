import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = require(process.env.JSDOM_PATH)); }
const html = readFileSync(new URL('./fixture.html', import.meta.url), 'utf8');
const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: 'https://www.pokernow.club/games/abc' });

globalThis.window = dom.window;
globalThis.document = dom.window.document;

const src = readFileSync(new URL('../src/content/parser.js', import.meta.url), 'utf8');
new Function('window', 'document', src)(dom.window, dom.window.document);
const P = dom.window.PNParser;

globalThis.PokerEval = require('../src/poker/evaluator.js');
const Q = require('../src/poker/equity.js');

const snap = P.snapshot();
const s = (arr) => arr.map(P.cardToString).join(' ');

const checks = [
  ['hole cards', s(snap.hole), 'Ah Kh'],
  ['board cards', s(snap.board), 'Th Jh 2s'],
  ['active opponents (carol folded)', String(snap.opponents), '2'],
  ['pot', String(snap.pot), '240'],
  ['amount to call', String(snap.toCall), '60'],
];

let ok = true;
for (const [name, got, want] of checks) {
  const pass = got === want;
  if (!pass) ok = false;
  console.log((pass ? '  ok  ' : ' FAIL ') + name.padEnd(34) + got.padEnd(12) + (pass ? '' : '(want ' + want + ')'));
}

const r = Q.analyze({ hole: snap.hole, board: snap.board, opponents: snap.opponents });
console.log('\n  equity vs 2 opponents:', (r.equity * 100).toFixed(1) + '%');
console.log('  made hand:            ', r.handName);
console.log('  draw cards:                 ', r.draws.count, '->', r.draws.cards.join(' '));
console.log('  compute time:         ', r.ms + 'ms');
console.log('  pot odds needed:      ', ((snap.toCall / (snap.pot + snap.toCall)) * 100).toFixed(1) + '%');

// AhKh on Th Jh 2s: royal/flush/straight draws. Sanity: must be a big favourite.
const eq = r.equity;
if (eq < 0.6 || eq > 0.85) { ok = false; console.log('\n FAIL equity out of sane range for a monster draw'); }
if (r.handName !== 'A-high') { ok = false; console.log('\n FAIL expected A-high made hand, got ' + r.handName); }

console.log('\n' + (ok ? 'parser + integration: all checks pass' : 'parser + integration: FAILURES'));

if (!ok) process.exitCode = 1;
dom.window.close();
