import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = require(process.env.JSDOM_PATH)); }

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const dom = new JSDOM(`<!doctype html><body>${read('./fixture.html')}</body>`, {
  url: 'https://www.pokernow.com/games/abc',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const { window } = dom;

globalThis.PokerEval = require('../src/poker/evaluator.js');
const Equity = require('../src/poker/equity.js');

const stored = {};
window.chrome = {
  storage: { local: { get: (_k, cb) => cb(stored), set: (v) => Object.assign(stored, v) } },
  runtime: {
    id: 'test-extension',
    lastError: undefined,
    sendMessage: (msg, cb) => cb(Equity.analyze(msg.payload)),
  },
};

const style = window.document.createElement('style');
style.textContent = read('../src/content/overlay.css');
window.document.head.appendChild(style);

for (const f of ['../src/poker/ranges.js', '../src/poker/history.js', '../src/poker/advice.js', '../src/content/parser.js', '../src/content/overlay.js', '../src/content/index.js']) {
  window.eval(read(f));
}

await new Promise((r) => setTimeout(r, 400));

const hud = window.document.querySelector('.pnhud');
const text = (sel) => { const n = hud && hud.querySelector(sel); return n ? n.textContent.trim() : null; };

const rows = {};
for (const r of hud ? hud.querySelectorAll('.pnhud-row') : []) {
  if (r.hidden) continue;
  rows[r.querySelector('.pnhud-k').textContent] = r.querySelector('.pnhud-v').textContent;
}

const checks = [];
const add = (name, cond, detail) => checks.push([name, cond, detail]);

add('overlay element mounted into the page', !!hud, hud ? 'present' : 'MISSING');
add('overlay is position:fixed (true overlay)', hud && window.getComputedStyle(hud).position === 'fixed',
  hud ? window.getComputedStyle(hud).position : 'n/a');
add('hole + board cards rendered', text('.pnhud-cards') === 'A♥K♥·10♥J♥2♠', text('.pnhud-cards'));

const eqText = text('.pnhud-eqval') || '';
const eqNum = parseFloat(eqText);
add('equity headline shown and plausible', /%$/.test(eqText) && eqNum > 55 && eqNum < 75, eqText);
add('equity bar width tracks equity',
  hud && hud.querySelector('.pnhud-bar-fill').style.width === eqNum.toFixed(1) + '%',
  hud && hud.querySelector('.pnhud-bar-fill').style.width);
add('pot-odds marker positioned at 20%',
  hud && parseFloat(hud.querySelector('.pnhud-bar-mark').style.left) === 20,
  hud && hud.querySelector('.pnhud-bar-mark').style.left);
add('Hand row', rows.Hand === 'A-high', rows.Hand);
add('Draw completion row', rows['Draw cards'] === '12 completion cards', rows['Draw cards']);
add('Pot odds row (60 to call into 240)', rows['Pot odds'] === 'need 20.0%', rows['Pot odds']);
add('Equity margin uses percentage points', /^\+.* pp$/.test(rows['Equity margin'] || ''), rows['Equity margin']);
add('Flop does not claim realized Call EV', rows['Call EV (model)'] === undefined, rows['Call EV (model)']);
add('recommendation banner shown', !!hud.querySelector('.pnhud-rec-action'),
  text('.pnhud-rec-action') + ' / ' + text('.pnhud-rec-detail'));
add('recommends CALL when equity beats pot odds', text('.pnhud-rec-action') === 'Call',
  text('.pnhud-rec-action'));
add('recommendation is styled as good', hud.querySelector('.pnhud-rec').className.includes('good'),
  hud.querySelector('.pnhud-rec').className);
add('opponent count from DOM (carol folded)', text('.pnhud-opp') === 'vs 2 opponents',
  text('.pnhud-opp'));

// Regression: PokerNow animates constantly. A pure debounce would starve and
// the HUD would never refresh. Hammer the DOM while dealing the turn card.
const noise = setInterval(() => {
  const n = window.document.querySelector('.table-player-stack');
  if (n) n.textContent = String(1500 + (Date.now() % 7));
}, 25);

const board = window.document.querySelector('.table-cards');
const turn = window.document.createElement('div');
turn.className = 'card-container turn';
turn.innerHTML = '<div class="card card-4"><div class="value">Q</div><div class="suit">\u2665</div></div>';
board.appendChild(turn);

await new Promise((r) => setTimeout(r, 1500));
clearInterval(noise);

add('HUD refreshes despite constant DOM churn',
  text('.pnhud-cards') === 'A\u2665K\u2665\u00b710\u2665J\u26652\u2660Q\u2665',
  text('.pnhud-cards'));
add('equity updates after hitting the royal flush',
  parseFloat(text('.pnhud-eqval')) > 99,
  text('.pnhud-eqval'));
add('no value raise without a continuing range', text('.pnhud-rec-action') === 'Call',
  text('.pnhud-rec-action') + ' / ' + text('.pnhud-rec-detail'));

// Scaling: every size inside the panel must be relative, or resizing breaks.
const css = read('../src/content/overlay.css');
const SIZE_PROP = /^(font-size|padding|padding-\w+|margin|margin-\w+|width|height|gap|line-height|border-radius|top|bottom|left|right)$/;
const offenders = [];
for (const rule of css.split('}')) {
  const sel = rule.split('{')[0].trim();
  const body = rule.split('{')[1];
  if (!body) continue;
  const isRoot = sel === '.pnhud';
  for (const decl of body.split(';')) {
    const [rawProp, rawVal] = decl.split(':');
    if (!rawProp || !rawVal) continue;
    const prop = rawProp.trim();
    const val = rawVal.trim();
    if (!SIZE_PROP.test(prop)) continue;
    if (!/\dpx/.test(val)) continue;
    // the panel's own base font-size and its viewport anchoring are meant to be px
    if (isRoot && (prop === 'font-size' || prop === 'top' || prop === 'right')) continue;
    offenders.push(sel + ' { ' + prop + ': ' + val + ' }');
  }
}
add('all panel sizes are scale-relative', offenders.length === 0,
  offenders.length ? offenders.join(' | ') : 'no absolute px sizes');
add('base font-size is driven by --pnhud-scale',
  /font-size:\s*calc\(12px\s*\*\s*var\(--pnhud-scale\)\)/.test(css), 'ok');

add('made hand recognised on the turn',
  (() => { for (const r of hud.querySelectorAll('.pnhud-row')) {
    if (r.querySelector('.pnhud-k').textContent === 'Hand') return r.querySelector('.pnhud-v').textContent;
  } return null; })() === 'Royal Flush',
  (() => { for (const r of hud.querySelectorAll('.pnhud-row')) {
    if (r.querySelector('.pnhud-k').textContent === 'Hand') return r.querySelector('.pnhud-v').textContent;
  } return null; })());

let ok = true;
for (const [name, cond, detail] of checks) {
  if (!cond) ok = false;
  console.log((cond ? '  ok  ' : ' FAIL ') + name.padEnd(42) + String(detail));
}
console.log('\n' + (ok ? 'end-to-end: overlay renders correctly on a simulated table' : 'end-to-end: FAILURES'));
process.exit(ok ? 0 : 1);
