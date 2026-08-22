import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = require(process.env.JSDOM_PATH)); }

const src = readFileSync(new URL('../src/content/parser.js', import.meta.url), 'utf8');

function parse(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url: 'https://www.pokernow.com/games/x', runScripts: 'outside-only',
  });
  dom.window.eval(src);
  return dom.window.PNParser;
}

const HERO = `<div class="table-player you-player"><div class="table-player-cards">
  <div class="card"><div class="value">A</div><div class="suit">&#9824;</div></div>
  <div class="card"><div class="value">K</div><div class="suit">&#9824;</div></div>
</div></div>`;

const POT_CASES = [
  ['main value plus add-on are summed',
    '<div class="table-pot-size"><div class="add-on">40</div><div class="main-value">100</div></div>', 140],
  ['comma grouping',
    '<div class="table-pot-size"><div class="main-value">1,200</div></div>', 1200],
  ['main pot plus side pot',
    '<div class="table-pot-size"><div class="main-value">100</div><div class="side-pot">50</div></div>', 150],
  ['labelled text',
    '<div class="table-pot-size">Pot: 350</div>', 350],
  ['pot reads 0 but chips are in front of players',
    '<div class="table-pot-size"><div class="main-value">0</div></div>'
    + '<div class="table-player-bet-value">10</div><div class="table-player-bet-value">20</div>', 30],
  ['genuinely empty pot stays 0',
    '<div class="table-pot-size"><div class="main-value">0</div></div>', 0],
  ['no pot element, bets only',
    '<div class="table-player-bet-value">25</div><div class="table-player-bet-value">25</div>', 50],
  ['nothing at all is null',
    '<div class="table-cards"></div>', null],
];

const checks = [];
const add = (n, c, d) => checks.push([n, c, d]);

for (const [name, html, want] of POT_CASES) {
  const got = parse(HERO + html).snapshot().pot;
  add('pot: ' + name, got === want, got + (got === want ? '' : ' (want ' + want + ')'));
}

const FOLD_CASES = [
  ['live hero is not folded', HERO, false],
  ['seat marked folded', HERO.replace('you-player', 'you-player fold'), true],
  ['seat marked folded (past tense)', HERO.replace('you-player', 'you-player folded'), true],
  ['cards marked folded', HERO.replace('class="card"', 'class="card folded"'), true],
  ['sitting out', HERO.replace('you-player', 'you-player sitting-out'), true],
];

for (const [name, html, want] of FOLD_CASES) {
  const got = parse(html).snapshot().folded;
  add('fold: ' + name, got === want, String(got));
}

// "player" must not be mistaken for a fold, and the pot must not swallow stack sizes
const tricky = parse(HERO + '<div class="table-player-stack">1500</div>'
  + '<div class="table-pot-size"><div class="main-value">80</div></div>').snapshot();
add('fold: normal markup is not a false positive', tricky.folded === false, String(tricky.folded));
add('pot: player stacks are not counted as pot', tricky.pot === 80, String(tricky.pot));

// --- turn detection: the reason a bot folds before the action reaches it ---
const SEAT = (cls) => `<div class="table-player ${cls}"><div class="table-player-cards">
  <div class="card card-1"></div><div class="card card-2"></div></div></div>`;
const LIVE = `<div class="game-decisions-ctn">
  <button>Fold</button><button>Call 20</button><button>Raise</button></div>`;
const PRE = `<div class="pre-action-ctn">
  <button>Fold</button><button>Check/Fold</button><button>Call Any</button></div>`;

const TURN_CASES = [
  ['only pre-action controls on screen', HERO + SEAT('') + PRE, false, false],
  ['live buttons, table marks nobody', HERO + SEAT('') + LIVE, true, true],
  ['live buttons, hero is the acting seat',
    HERO.replace('you-player', 'you-player decision-current') + SEAT('') + LIVE, true, true],
  ['live buttons, someone else is acting', HERO + SEAT('decision-current') + LIVE, true, false],
  ['live buttons, opponent has the countdown',
    HERO + '<div class="table-player"><div class="decision-timer"></div></div>' + LIVE, true, false],
  ['buttons disabled by class', HERO + SEAT('')
    + '<div class="game-decisions-ctn"><button class="disabled">Fold</button>'
    + '<button class="disabled">Call 20</button></div>', false, false],
];

for (const [name, html, wantCall, wantTurn] of TURN_CASES) {
  const snap = parse(html).snapshot();
  add('turn: ' + name + ' (call)', snap.canCall === wantCall, String(snap.canCall));
  add('turn: ' + name + ' (yourTurn)', snap.yourTurn === wantTurn, String(snap.yourTurn));
}

const LABELS = [
  ['Fold', 'fold'], ['Check', 'check'], ['Call 20', 'call'], ['Bet 100', 'raise'],
  ['Check/Fold', null], ['Fold/Check', null], ['Call Any', null], ['Fold to Any Bet', null],
];
const P = parse(HERO);
for (const [text, want] of LABELS) {
  const got = P.classifyAction(text);
  add('label: "' + text + '"', got === want, String(got));
}

let ok = true;
for (const [n, c, d] of checks) {
  if (!c) ok = false;
  console.log((c ? '  ok  ' : ' FAIL ') + n.padEnd(52) + String(d));
}
console.log('\n' + (ok ? 'state: pot and fold detection correct' : 'state: FAILURES'));
process.exit(ok ? 0 : 1);
