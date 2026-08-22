import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = require(process.env.JSDOM_PATH)); }

const src = readFileSync(new URL('../src/content/parser.js', import.meta.url), 'utf8');

function parse(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url: 'https://www.pokernow.com/games/x',
    runScripts: 'outside-only',
  });
  dom.window.eval(src);
  const P = dom.window.PNParser;
  const snap = P.snapshot();
  return {
    hole: snap.hole.map(P.cardToString).join(' '),
    board: snap.board.map(P.cardToString).join(' '),
    opponents: snap.opponents,
  };
}

const seat = (inner, cls = '') => `<div class="table-player ${cls}"><div class="table-player-cards">${inner}</div></div>`;
const glyph = (v, s) => `<div class="card"><div class="value">${v}</div><div class="suit">${s}</div></div>`;

const VARIANTS = [
  {
    name: '"flipped" class means face-UP',
    html: seat(`<div class="card card-1 flipped"><div class="value">A</div><div class="suit">&#9824;</div></div>
                <div class="card card-2 flipped"><div class="value">K</div><div class="suit">&#9827;</div></div>`, 'you-player')
      + `<div class="table-cards">${glyph('10', '&#9829;')}</div>`,
    hole: 'As Kc', board: 'Th',
  },
  {
    name: 'suit as a word class, no glyph text',
    html: seat(`<div class="card"><div class="value">Q</div><div class="suit spade"></div></div>
                <div class="card"><div class="value">J</div><div class="suit heart"></div></div>`, 'you-player'),
    hole: 'Qs Jh', board: '',
  },
  {
    name: 'whole card encoded in the class name',
    html: seat(`<div class="card card-9d"></div><div class="card card-Ts"></div>`, 'you-player'),
    hole: '9d Ts', board: '',
  },
  {
    name: 'card identity in a data attribute',
    html: seat(`<div class="card" data-card="7h"></div><div class="card" data-card="2c"></div>`, 'you-player'),
    hole: '7h 2c', board: '',
  },
  {
    name: 'single text node "A♠"',
    html: seat(`<div class="card">A&#9824;</div><div class="card">10&#9830;</div>`, 'you-player'),
    hole: 'As Td', board: '',
  },
  {
    name: 'face-down opponents are never read as cards',
    html: seat(glyph('A', '&#9824;') + glyph('K', '&#9824;'), 'you-player')
      + seat(`<div class="card card-1"></div><div class="card card-2"></div>`)
      + seat(`<div class="card card-1"></div><div class="card card-2"></div>`),
    hole: 'As Ks', board: '', opponents: 2,
  },
  {
    name: 'board cards found with no .table-cards wrapper',
    html: seat(glyph('A', '&#9824;') + glyph('K', '&#9824;'), 'you-player')
      + `<div class="community">${glyph('2', '&#9829;') + glyph('3', '&#9829;') + glyph('4', '&#9829;')}</div>`,
    hole: 'As Ks', board: '2h 3h 4h',
  },
];

const hero = seat(glyph('A', '&#9824;') + glyph('K', '&#9824;'), 'you-player');
const facedown = '<div class="card card-1"></div><div class="card card-2"></div>';

const OPPONENT_CASES = [
  ['five live opponents', hero + seat(facedown).repeat(5), 5],
  ['folded by class', hero + seat(facedown).repeat(3) + seat(facedown, 'fold').repeat(2), 3],
  ['folded by status text',
    hero + seat(facedown).repeat(2)
    + '<div class="table-player"><div class="table-player-cards">' + facedown
    + '</div><div class="table-player-status">Fold</div></div>', 2],
  ['empty seats ignored', hero + seat(facedown).repeat(2) + seat('').repeat(3), 2],
  ['sitting out ignored', hero + seat(facedown).repeat(2) + seat(facedown, 'sitting-out'), 2],
  ['heads up', hero + seat(facedown), 1],
  ['everyone folded', hero + seat(facedown, 'fold').repeat(4), 0],
  ['showdown: opponent cards face-up are still one opponent',
    hero + seat(glyph('Q', '&#9827;') + glyph('J', '&#9827;')), 1],
];

let ok = true;
for (const [name, html, want] of OPPONENT_CASES) {
  const got = parse(html).opponents;
  const pass = got === want;
  if (!pass) ok = false;
  console.log((pass ? '  ok  ' : ' FAIL ') + ('opponents: ' + name).padEnd(44)
    + 'counted ' + got + (pass ? '' : ' (want ' + want + ')'));
}

for (const v of VARIANTS) {
  const got = parse(v.html);
  const pass = got.hole === v.hole
    && got.board === v.board
    && (v.opponents === undefined || got.opponents === v.opponents);
  if (!pass) ok = false;
  console.log((pass ? '  ok  ' : ' FAIL ') + v.name.padEnd(44)
    + 'hole=[' + got.hole + '] board=[' + got.board + ']'
    + (v.opponents !== undefined ? ' opp=' + got.opponents : ''));
  if (!pass) console.log('        expected hole=[' + v.hole + '] board=[' + v.board + ']');
}
console.log('\n' + (ok ? 'DOM variants: parser handles all layouts' : 'DOM variants: FAILURES'));
process.exit(ok ? 0 : 1);
