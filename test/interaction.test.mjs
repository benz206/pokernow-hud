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
  runtime: { id: 'test-extension', lastError: undefined, sendMessage: (m, cb) => cb(Equity.analyze(m.payload)) },
};
for (const f of ['../src/poker/ranges.js', '../src/poker/history.js', '../src/poker/advice.js', '../src/content/parser.js',
                 '../src/content/overlay.js', '../src/content/index.js']) window.eval(read(f));

await new Promise((r) => setTimeout(r, 400));

const hud = window.document.querySelector('.pnhud');
const head = hud.querySelector('.pnhud-head');
const grip = hud.querySelector('.pnhud-grip');

function pointer(target, type, x, y, buttons = 1) {
  const e = new window.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons,
  });
  target.dispatchEvent(e);
}

// jsdom has no layout: getBoundingClientRect() always reports 0,0. Reflect the
// inline style instead so relative drags (2nd, 3rd...) are measured for real.
hud.getBoundingClientRect = () => ({
  left: parseFloat(hud.style.left) || 0,
  top: parseFloat(hud.style.top) || 0,
  width: 232, height: 300, right: 0, bottom: 0, x: 0, y: 0,
});

const pos = () => hud.style.left + ',' + hud.style.top;
const scale = () => hud.style.getPropertyValue('--pnhud-scale');

const checks = [];
const add = (n, c, d) => checks.push([n, c, d]);

// --- drag ---
pointer(head, 'pointerdown', 100, 100);
pointer(window, 'pointermove', 300, 250);
const afterDrag = pos();
add('panel follows the pointer while held', afterDrag === '200px,150px', afterDrag);

pointer(window, 'pointerup', 300, 250, 0);
pointer(window, 'pointermove', 600, 500);
add('panel STOPS on release (no click-to-drop)', pos() === afterDrag, pos());

// a second drag must still work
pointer(head, 'pointerdown', 200, 150);
pointer(window, 'pointermove', 250, 200);
add('a second drag still works', pos() === '250px,200px', pos());
pointer(window, 'pointerup', 250, 200, 0);

// releasing outside the window (no pointerup seen) must not leave it stuck
pointer(head, 'pointerdown', 250, 200);
pointer(window, 'pointermove', 300, 240);
const beforeLost = pos();
pointer(window, 'pointermove', 400, 300, 0);   // button already released
pointer(window, 'pointermove', 700, 600, 1);   // pointer pressed again elsewhere
add('drag ends when the button is released off-window', pos() !== '700px,600px', pos() + ' (was ' + beforeLost + ')');

// pointercancel must end the drag too
pointer(head, 'pointerdown', 100, 100);
pointer(window, 'pointermove', 150, 150);
const beforeCancel = pos();
pointer(window, 'pointercancel', 150, 150, 0);
pointer(window, 'pointermove', 900, 700);
add('pointercancel ends the drag', pos() === beforeCancel, pos());

// header buttons must not start a drag
const before = pos();
pointer(hud.querySelector('.pnhud-btn'), 'pointerdown', 500, 500);
pointer(window, 'pointermove', 550, 550);
add('clicking a header button does not drag', pos() === before, pos());
pointer(window, 'pointerup', 550, 550, 0);

// --- resize ---
pointer(grip, 'pointerdown', 100, 100);
pointer(window, 'pointermove', 216, 100);
const grew = parseFloat(scale());
add('grip drag scales the panel up', Math.abs(grew - 1.5) < 0.01, String(grew));

pointer(window, 'pointerup', 216, 100, 0);
pointer(window, 'pointermove', 500, 100);
add('resize STOPS on release', Math.abs(parseFloat(scale()) - grew) < 1e-9, scale());

pointer(grip, 'pointerdown', 100, 100);
pointer(window, 'pointermove', -400, 100);
add('scale clamps at the lower bound', parseFloat(scale()) >= 0.7, scale());
pointer(window, 'pointerup', -400, 100, 0);

// --- opponent count is display-only ---
add('opponent count is shown', /^vs \d+ opponents?$/.test(hud.querySelector('.pnhud-opp').textContent),
  hud.querySelector('.pnhud-opp').textContent);
add('no controls to change the opponent count',
  hud.querySelectorAll('.pnhud-step').length === 0 && !/auto/i.test(hud.querySelector('.pnhud-foot').textContent),
  hud.querySelector('.pnhud-foot').textContent.trim());

let ok = true;
for (const [n, c, d] of checks) {
  if (!c) ok = false;
  console.log((c ? '  ok  ' : ' FAIL ') + n.padEnd(48) + String(d));
}
console.log('\n' + (ok ? 'interaction: drag, resize and opponent display all correct' : 'interaction: FAILURES'));
process.exit(ok ? 0 : 1);
