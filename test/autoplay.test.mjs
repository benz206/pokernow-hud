import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = require(process.env.JSDOM_PATH)); }

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

const TABLE = `
<div class="table-cards"><div class="card">A♣</div><div class="card">A♦</div><div class="card">9♠</div><div class="card">8♥</div><div class="card">7♦</div></div>
<div class="table-player you-player"><div class="table-player-cards">
  <div class="card"><div class="value">A</div><div class="suit">&#9824;</div></div>
  <div class="card"><div class="value">A</div><div class="suit">&#9829;</div></div>
</div></div>
<div class="table-player"><div class="table-player-cards">
  <div class="card card-1"></div><div class="card card-2"></div>
</div></div>
<div class="table-pot-size"><span class="main-value">100</span></div>
<div class="game-decisions-ctn">
  <button class="action-button" id="b-fold">Fold</button>
  <button class="action-button" id="b-call">Call 20</button>
  <button class="action-button" id="b-raise">Raise</button>
  <div class="raise-controller-form">
    <input type="number" class="raise-amount" id="i-raise" min="40" max="1000" value="40">
  </div>
</div>
<div class="chat-container"><input type="text" id="i-chat" placeholder="Type a message"></div>`;

async function boot(html) {
  const dom = new JSDOM(`<!doctype html><body>${html || TABLE}</body>`, {
    url: 'https://www.pokernow.com/games/abc',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  globalThis.PokerEval = require('../src/poker/evaluator.js');
  const Equity = require('../src/poker/equity.js');
  const stored = {pnhud: {ranges: {'seat:2': {mode: 'random', continuing: 'KK'}}}};
  window.chrome = {
    storage: { local: { get: (_k, cb) => cb(stored), set: (v) => Object.assign(stored, v) } },
    runtime: { id: 'test-extension', lastError: undefined, sendMessage: (m, cb) => cb(Equity.analyze(m.payload)) },
  };
  for (const f of ['../src/poker/ranges.js', '../src/poker/history.js', '../src/poker/advice.js', '../src/content/parser.js',
                   '../src/content/overlay.js', '../src/content/index.js']) window.eval(read(f));

  const clicks = [];
  const inputEvents = [];
  for (const id of ['b-fold', 'b-call', 'b-raise']) {
    window.document.getElementById(id).addEventListener('click', () => clicks.push(id));
  }
  window.document.getElementById('i-raise').addEventListener('input', (e) => inputEvents.push(e.target.value));
  window.document.getElementById('i-chat').addEventListener('input', () => inputEvents.push('CHAT'));

  await new Promise((r) => setTimeout(r, 500));
  return { window, clicks, inputEvents, dom };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const add = (n, c, d) => checks.push([n, c, d]);

// --- 1. auto OFF must never touch the table ---
{
  const { window, clicks } = await boot();
  await wait(2600);
  add('auto OFF: nothing is ever clicked', clicks.length === 0, JSON.stringify(clicks));
  const hud = window.document.querySelector('.pnhud');
  add('auto OFF: recommendation still shown',
    hud.querySelector('.pnhud-rec-action').textContent.startsWith('Raise'),
    hud.querySelector('.pnhud-rec-action').textContent);
  add('auto OFF: recommended button is highlighted',
    window.document.getElementById('b-raise').classList.contains('pnhud-suggest'), 'highlighted');
}

// --- 2. auto ON sizes the raise and commits it, exactly once ---
{
  const { window, clicks, inputEvents } = await boot();
  window.document.querySelector('.pnhud-btn').click();      // AUTO toggle
  await wait(3000);
  add('auto ON: pressed Raise', clicks.includes('b-raise'), JSON.stringify(clicks));
  add('auto ON: never pressed Fold or Call',
    !clicks.includes('b-fold') && !clicks.includes('b-call'), JSON.stringify(clicks));
  add('auto ON: raise amount is 2/3 pot (99)',
    window.document.getElementById('i-raise').value === '99',
    window.document.getElementById('i-raise').value);
  add('auto ON: fired a React-visible input event', inputEvents.includes('99'), JSON.stringify(inputEvents));
  add('auto ON: never typed into chat', !inputEvents.includes('CHAT'), JSON.stringify(inputEvents));

  await wait(2500);
  add('auto ON: acts once per spot, never loops',
    clicks.filter((c) => c === 'b-raise').length === 1, clicks.length + ' total clicks');

  add('auto ON: panel shows the auto banner',
    window.document.querySelector('.pnhud').classList.contains('pnhud-auto'), 'banner on');
  add('auto ON: decision logged',
    /Raise/.test(window.document.querySelector('.pnhud-log-act')?.textContent || ''),
    window.document.querySelector('.pnhud-log-row')?.textContent);
}

// --- 3. if the amount will not stick, it must NOT raise ---
{
  const { window, clicks } = await boot();
  const input = window.document.getElementById('i-raise');
  // Simulate a box that refuses our value and keeps a large pre-filled one.
  Object.defineProperty(input, 'value', { get: () => '1000', set: () => {}, configurable: true });
  window.document.querySelector('.pnhud-btn').click();
  await wait(3000);
  add('unstickable amount: refuses to press Raise', !clicks.includes('b-raise'), JSON.stringify(clicks));
  add('unstickable amount: falls back to Call', clicks.includes('b-call'), JSON.stringify(clicks));
  add('unstickable amount: fallback is logged',
    /could not set/i.test(window.document.querySelector('.pnhud-log-why')?.textContent || ''),
    window.document.querySelector('.pnhud-log-why')?.textContent);
}

// --- 4. Escape is a hard stop ---
{
  const { window, clicks } = await boot();
  window.document.querySelector('.pnhud-btn').click();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(3000);
  add('Escape stops auto before it acts', clicks.length === 0, JSON.stringify(clicks));
  add('Escape clears the auto banner',
    !window.document.querySelector('.pnhud').classList.contains('pnhud-auto'), 'banner off');
}

// --- 5. folding mid-hand stops auto dead, even with buttons still on screen ---
{
  const { window, clicks } = await boot();
  window.document.querySelector('.pnhud-btn').click();          // AUTO on
  window.document.getElementById('b-fold').click();             // player folds manually
  await wait(3200);
  add('after folding: no further action taken',
    clicks.filter((c) => c !== 'b-fold').length === 0, JSON.stringify(clicks));
  add('after folding: panel says we are out',
    /folded/i.test(window.document.querySelector('.pnhud-idle').textContent),
    window.document.querySelector('.pnhud-idle').textContent);
  add('after folding: highlight is cleared',
    !window.document.getElementById('b-raise').classList.contains('pnhud-suggest'), 'cleared');
}

// --- 6. a seat already marked folded never plays ---
{
  const folded = TABLE.replace('table-player you-player', 'table-player you-player fold');
  const { window, clicks } = await boot(folded);
  window.document.querySelector('.pnhud-btn').click();
  await wait(3200);
  add('seat marked folded: never acts', clicks.length === 0, JSON.stringify(clicks));
  add('seat marked folded: shows sitting-out state',
    /folded/i.test(window.document.querySelector('.pnhud-idle').textContent),
    window.document.querySelector('.pnhud-idle').textContent);
}

// --- 7. reloading the extension must not spray errors from orphaned scripts ---
{
  const { window, clicks } = await boot();
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));
  const original = console.error;
  console.error = (...a) => errors.push(a.join(' '));

  // Simulate the extension being reloaded underneath a live page.
  window.chrome.runtime.id = undefined;
  window.chrome.runtime.sendMessage = () => { throw new Error('Extension context invalidated.'); };
  window.chrome.storage.local.set = () => { throw new Error('Extension context invalidated.'); };
  window.document.querySelector('.pnhud-btn').click();   // provokes save() + tick()

  await wait(2600);
  console.error = original;

  add('orphaned script: no errors thrown',
    errors.filter((m) => /invalidated/i.test(m)).length === 0, JSON.stringify(errors.slice(0, 2)));
  add('orphaned script: tells you to refresh',
    /refresh this page/i.test(window.document.querySelector('.pnhud-idle').textContent),
    window.document.querySelector('.pnhud-idle').textContent);
  add('orphaned script: takes no table actions', clicks.length === 0, JSON.stringify(clicks));
}

// --- 8. never act while another seat is the one to act (the early-fold bug) ---
{
  const other = TABLE.replace('<div class="table-player"><div class="table-player-cards">',
                              '<div class="table-player decision-current"><div class="table-player-cards">');
  const { window, clicks } = await boot(other);
  window.document.querySelector('.pnhud-btn').click();
  await wait(3200);
  add('another seat acting: takes no action', clicks.length === 0, JSON.stringify(clicks));
  add('another seat acting: says not your turn',
    /not your turn/i.test(window.document.querySelector('.pnhud-rec-detail').textContent),
    window.document.querySelector('.pnhud-rec-detail').textContent);
}

// --- 9. pre-action controls must never be pressed ---
{
  const pre = TABLE.replace('class="game-decisions-ctn"', 'class="pre-action-ctn"');
  const { window, clicks } = await boot(pre);
  window.document.querySelector('.pnhud-btn').click();
  await wait(3200);
  add('pre-action controls: never pressed', clicks.length === 0, JSON.stringify(clicks));
}

// --- 10. if the turn passes mid-delay, abort instead of acting late ---
{
  const { window, clicks } = await boot();
  window.document.querySelector('.pnhud-btn').click();
  await wait(250);
  window.document.querySelectorAll('.table-player')[1].classList.add('decision-current');
  await wait(3200);
  add('turn passes during the delay: aborts', clicks.length === 0, JSON.stringify(clicks));
}

let ok = true;
for (const [n, c, d] of checks) {
  if (!c) ok = false;
  console.log((c ? '  ok  ' : ' FAIL ') + n.padEnd(50) + String(d));
}
console.log('\n' + (ok ? 'autoplay: all safety and behaviour checks pass' : 'autoplay: FAILURES'));
process.exit(ok ? 0 : 1);
