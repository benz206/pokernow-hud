import assert from 'node:assert/strict';
import { boot, TABLE } from './harness.mjs';
const board = '<div class="table-cards"><div class="card">K♣</div><div class="card">8♦</div><div class="card">4♠</div><div class="card">2♥</div><div class="card">9♣</div></div>';
const table = TABLE.replace(/<div class="table-cards">.*?<\/div><\/div>/, board)
  .replace('<div class="card">A♠</div><div class="card">A♥</div>', '<div class="card">K♠</div><div class="card">Q♥</div>')
  .replace('>100</div>', '>150</div>').replace('Call 20', 'Call 50').replace('>20</div>', '>50</div>');
const log = '<div class="log-modal-entries">' + [
  '<p class="content">-- starting hand #12 (id: sample) No Limit Texas Hold\'em --</p>',
  '<p class="content">Your hand is K♠, Q♥</p>',
  '<p class="content"><abbr title="Player ID: alex">Alex</abbr> raises to 6</p>',
  '<p class="content">Flop: [K♣, 8♦, 4♠]</p>',
  '<p class="content"><abbr title="Player ID: alex">Alex</abbr> checks</p>',
  '<p class="content">Turn: [K♣, 8♦, 4♠, 2♥]</p>',
  '<p class="content"><abbr title="Player ID: alex">Alex</abbr> checks</p>',
  '<p class="content">River: [K♣, 8♦, 4♠, 2♥, 9♣]</p>',
  '<p class="content"><abbr title="Player ID: alex">Alex</abbr> bets 50</p>',
].reverse().map(x => '<div class="entry-ctn">' + x + '</div>').join('') + '</div>';
const t = await boot({ html: table + log, stored: { pnhud: { ranges: {} } } });
const d = t.w.document;
assert.match(d.querySelector('.pnhud-explanation').textContent, /Alex bets 50/);
assert.match(d.querySelector('.pnhud-explanation').textContent, /Alex opened the betting/);
assert.equal(t.w.PNParser.snapshot().players[1].id, 'alex');
assert.equal(t.w.PNParser.snapshot().position, 'BTN/SB');
assert.equal(t.w.PNParser.snapshot().effectiveStack, 1000);
const mode = d.querySelector('[aria-label="Alex range"]');
const custom = d.querySelector('[aria-label="Alex custom range"]');
const continues = d.querySelector('[aria-label="Alex continues vs our raise"]');
const apply = d.querySelector('.pnhud-range button');
mode.value = 'custom'; mode.dispatchEvent(new t.w.Event('change')); custom.value = '8c8h,TcJh:0.5'; apply.click(); await t.poll();
assert.equal(d.querySelector('.pnhud-rec-action').textContent, 'Call');
assert.ok(Math.abs(parseFloat(d.querySelector('.pnhud-eqval').textContent) - 100 / 3) < 3);
assert.match(d.querySelector('.pnhud-more').textContent, /25.0% bluffs/);
const initialEq = d.querySelector('.pnhud-eqval').textContent;
custom.value = 'not a range'; apply.click(); await t.poll();
assert.match(d.querySelector('.pnhud-error').textContent, /Use hands/);
assert.equal(d.querySelector('.pnhud-eqval').textContent, initialEq);
custom.value = '8c8h'; apply.click(); await t.poll();
assert.equal(d.querySelector('.pnhud-rec-action').textContent, 'Fold');
assert.equal(d.querySelector('.pnhud-eqval').textContent, '0.0%');
// Capture the choice before the table changes, then verify that a later read does not rewrite it.
d.getElementById('fold').click(); await t.poll(); t.save();
const recorded = t.stored['pnhud-history:/games/test'][0];
assert.equal(recorded.number, 12);
assert.equal(recorded.decisions[0].advice.rangeSummary[0].text, '8c8h');
assert.equal(recorded.decisions[0].snapshot.events.length, 7);
assert.match(d.querySelector('.pnhud-journal').textContent, /Alex bets 50/);
assert.match(d.querySelector('.pnhud-idle').textContent, /You folded/);
t.close();
{
  const t = await boot({ html: TABLE.replace('<div class="table-pot-size">100</div>', '<div class="table-pot-size"><div class="main-value">100</div><p class="add-on"><small>total</small><span>140</span></p></div>') });
  assert.equal(t.w.PNParser.snapshot().pot, 140, 'real total label must not double count the main pot'); t.close();
}
{
  const t = await boot({ html: TABLE.replace('>100</div>', '>150</div>') + '<div class="side-pot">200</div>' });
  assert.equal(t.w.document.querySelector('.pnhud-rec-action').textContent, 'Review'); t.close();
}
console.log('coaching: real log markup, named actions, positions, range editing, changed recommendations and frozen review pass');
