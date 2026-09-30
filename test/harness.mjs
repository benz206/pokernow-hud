import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch { ({ JSDOM } = require(process.env.JSDOM_PATH)); }
const Q = require('../src/poker/equity.js');
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
export const TABLE = `<div class="table-cards"><div class="card">A♣</div><div class="card">A♦</div><div class="card">9♠</div><div class="card">8♥</div><div class="card">7♦</div></div>
<div class="dealer-button-ctn dealer-position-1"></div>
<div id="hero" class="table-player table-player-1 you-player"><div class="card">A♠</div><div class="card">A♥</div><div class="table-player-name"><a href="/players/hero">You</a></div><div class="table-player-stack">1000</div><div class="table-player-bet-value">0</div></div>
<div id="opp" class="table-player table-player-2"><div class="card"></div><div class="card"></div><div class="table-player-name"><a href="/players/alex">Alex</a></div><div class="table-player-stack">1000</div><div class="table-player-bet-value">20</div></div>
<div class="table-pot-size">100</div><div class="game-decisions-ctn"><button id="fold">Fold</button><button id="call">Call 20</button><button id="raise">Raise</button><input class="raise-amount" type="number" min="40" max="1000" value="40"></div>`;
export const flush = () => new Promise(r => setTimeout(r, 10));
export async function boot({ html = TABLE, stored = { pnhud: { ranges: { alex: { mode: 'random', continuing: 'KK' } } } }, analyze } = {}) {
  const dom = new JSDOM(html, { url: 'https://www.pokernow.com/games/test', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, timers = new Map(), clicks = [];
  let timerId = -1, poll;
  const timeout = w.setTimeout.bind(w), clear = w.clearTimeout.bind(w);
  w.setTimeout = (fn, ms) => { if (ms >= 700) { timers.set(timerId, fn); return timerId--; } return timeout(fn, ms); };
  w.clearTimeout = id => { if (id < 0) timers.delete(id); else clear(id); };
  w.setInterval = fn => { poll = fn; return 1; }; w.clearInterval = () => {};
  w.MutationObserver = class { observe() {} disconnect() {} };
  const clone = x => JSON.parse(JSON.stringify(x));
  w.chrome = { runtime: { id: 'test', sendMessage: (m, cb) => analyze ? analyze(m.payload, cb) : cb(Q.analyze(m.payload)) },
    storage: { local: { get: (_keys, cb) => cb(clone(stored)), set: value => Object.assign(stored, clone(value)) } } };
  const style = w.document.createElement('style'); style.textContent = read('../src/content/overlay.css'); w.document.head.append(style);
  for (const f of JSON.parse(read('../manifest.json')).content_scripts[0].js) w.eval(read('../' + f));
  w.document.addEventListener('click', e => { if (e.target.id && !e.target.closest('.pnhud')) clicks.push(e.target.id); });
  await flush();
  return { w, dom, stored, clicks, timers,
    poll: async () => { await poll(); await flush(); },
    fire: async () => { const queued = [...timers.entries()]; timers.clear(); for (const [, fn] of queued) fn(); await flush(); },
    save: () => w.dispatchEvent(new w.Event('pagehide')),
    close: () => w.close(),
  };
}
