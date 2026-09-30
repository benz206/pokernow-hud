import assert from 'node:assert/strict';
import { boot, TABLE, flush } from './harness.mjs';
{
  const t = await boot({ html: TABLE.replace('<button id="raise">', '<button id="allin">All-in</button><button id="raise">') });
  assert.equal(t.w.PNParser.actionButtons().allin.id, 'allin');
  assert.equal(t.w.PNParser.actionButtons().raise.id, 'raise');
  t.w.document.querySelector('.pnhud-btn').click(); await t.poll(); await t.fire();
  assert.deepEqual(t.clicks, ['raise']); t.close();
}
{
  const t = await boot(); const d = t.w.document;
  d.querySelector('.pnhud-btn').click(); await t.poll();
  d.querySelector('.table-pot-size').textContent = '200'; await t.poll();
  assert.equal(d.querySelector('.pnhud-rec-action').textContent, 'Raise 165');
  await t.fire(); assert.equal(d.querySelector('.raise-amount').value, '165');
  await t.poll(); await t.fire(); assert.deepEqual(t.clicks, ['raise']); t.close();
}
{
  const t = await boot({ html: TABLE.replace('id="opp" class="table-player', 'id="opp" class="decision-current table-player') });
  const d = t.w.document;
  assert.equal(d.querySelector('.pnhud-rec-detail').textContent, 'not your turn');
  d.querySelector('.pnhud-btn').click(); await t.poll(); assert.equal(t.timers.size, 0);
  d.getElementById('opp').classList.remove('decision-current'); d.getElementById('hero').classList.add('decision-current');
  await t.poll(); assert.notEqual(d.querySelector('.pnhud-rec-detail').textContent, 'not your turn');
  await t.fire(); assert.deepEqual(t.clicks, ['raise']); t.close();
}
{
  const t = await boot({ html: TABLE + '<div class="pre-action-ctn"><button id="prefold">Fold</button></div>' });
  t.w.document.getElementById('prefold').click(); await t.poll();
  assert.equal(t.w.document.querySelector('.pnhud-idle').hidden, true);
  t.save(); assert.equal(t.stored['pnhud-history:/games/test'][0].decisions.length, 0); t.close();
}
{
  const t = await boot({ html: TABLE.replace('>100</div>', '>0</div>') });
  // The live parser can recover the 20 in front of Alex, so make all pot signals inconsistent.
  t.w.document.querySelector('.table-pot-size').textContent = '5'; await t.poll();
  assert.equal(t.w.document.querySelector('.pnhud-rec-action').textContent, 'Review');
  assert.match(t.w.document.querySelector('.pnhud-body').textContent, /Pot oddsunavailable/); t.close();
}
{
  const t = await boot({ html: TABLE.replace('<button id="call">', '<button hidden id="hidden-call">Call 900</button><button id="call">') });
  assert.equal(t.w.PNParser.snapshot().toCall, 20); t.close();
}
{
  const t = await boot(); const d = t.w.document;
  d.querySelector('.pnhud-btn').click(); await t.poll();
  d.getElementById('opp').classList.add('decision-current'); await t.fire();
  assert.deepEqual(t.clicks, []); t.close();
}
{
  let respond;
  const t = await boot({ analyze: (_, cb) => { respond = cb; } });
  t.w.document.querySelector('.table-cards .card').textContent = '2♣';
  respond({ equity: 1, tie: 0, stderr: 0, handName: 'OLD RESULT' }); await flush();
  assert.doesNotMatch(t.w.document.querySelector('.pnhud').textContent, /OLD RESULT/); t.close();
}
{
  const t = await boot(); const d = t.w.document;
  d.getElementById('call').click(); await t.poll(); t.save();
  const hand = t.stored['pnhud-history:/games/test'][0];
  assert.equal(hand.decisions.length, 1); assert.equal(hand.decisions[0].kind, 'manual');
  assert.equal(hand.decisions[0].snapshot.pot, 100); assert.equal(hand.decisions[0].advice.action, 'Raise');
  assert.equal(d.querySelector('.pnhud-journal').hidden, false);
  t.close();
  const restored = await boot({ stored: t.stored });
  assert.match(restored.w.document.querySelector('.pnhud-journal').textContent, /manual: Call/); restored.close();
}
{
  const t = await boot(); const d = t.w.document;
  d.querySelector('.pnhud-practice-label input').click(); await t.poll();
  assert.ok(d.querySelector('.pnhud').classList.contains('pnhud-blind'));
  assert.equal(t.w.getComputedStyle(d.querySelector('.pnhud-equity')).display, 'none');
  assert.equal(d.querySelectorAll('.pnhud-suggest').length, 0);
  [...d.querySelectorAll('.pnhud-guess button')].find(b => b.textContent === 'Call').click();
  assert.ok(!d.querySelector('.pnhud').classList.contains('pnhud-blind'));
  assert.deepEqual(t.clicks, []); t.save();
  assert.equal(t.stored['pnhud-history:/games/test'][0].decisions[0].kind, 'practice');
  d.querySelector('.table-pot-size').textContent = '200'; await t.poll();
  assert.ok(d.querySelector('.pnhud').classList.contains('pnhud-blind')); t.close();
}
{
  const t = await boot();
  t.w.chrome.storage.local.set = (_data, cb) => {
    t.w.chrome.runtime.lastError = { message: 'QUOTA_BYTES exceeded' };
    if (cb) cb();
    delete t.w.chrome.runtime.lastError;
  };
  t.w.document.getElementById('call').click(); t.save();
  assert.match(t.w.document.querySelector('.pnhud-body').textContent, /Review could not be saved.*QUOTA_BYTES/);
  assert.match(t.w.document.querySelector('.pnhud-journal').textContent, /manual: Call/); t.close();
}
{
  const html = TABLE.replace('<button id="call">Call 20</button><button id="raise">Raise</button>', '<button id="allin">All-in</button>');
  const t = await boot({ html }); const d = t.w.document;
  assert.equal(t.w.PNParser.snapshot().yourTurn, true);
  assert.equal(d.querySelector('.pnhud-rec-action').textContent, 'Review');
  d.querySelector('.pnhud-btn').click(); await t.poll(); await t.fire(); assert.deepEqual(t.clicks, []);
  d.getElementById('allin').click();
  d.querySelector('#hero .table-player-bet-value').textContent = '1000';
  d.querySelector('#hero .table-player-stack').textContent = 'All In';
  await t.poll(); t.save();
  const decision = t.stored['pnhud-history:/games/test'][0].decisions[0];
  assert.equal(decision.action, 'All-in'); assert.equal(decision.amount, 1000); assert.equal(decision.confirmed, true); t.close();
}
{
  const html = TABLE.replace(/<div class="table-cards">.*?<\/div><\/div>/, '<div class="table-cards"></div>');
  const t = await boot({ html, analyze: (_, cb) => cb({ equity: .4, tie: 0, stderr: .01, handName: 'Pair' }) });
  const d = t.w.document;
  const settings = d.querySelector('.pnhud-settings');
  assert.equal(settings.hidden, true);
  assert.ok(settings.contains(d.querySelector('.pnhud-practice-label')));
  d.querySelector('[aria-label="Settings"]').click(); assert.equal(settings.hidden, false);
  d.querySelector('.pnhud-btn').click(); await t.poll();
  assert.equal(t.timers.size, 0, 'selective auto waits preflop');
  const mode = d.querySelector('[aria-label="Auto mode"]');
  const select = async value => { mode.value = value; mode.dispatchEvent(new t.w.Event('change')); await t.poll(); };
  await select('full'); assert.equal(t.timers.size, 1);
  assert.equal(t.stored.pnhud.autoMode, 'full');
  await select('selective'); await t.fire(); assert.deepEqual(t.clicks, [], 'mode change cancels queued action');
  await select('full');
  d.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape' }));
  await t.fire(); assert.deepEqual(t.clicks, [], 'Escape stops Full Auto');
  d.querySelector('.pnhud-btn').click(); await t.poll(); await t.fire();
  assert.deepEqual(t.clicks, ['call']);
  await t.poll(); await t.fire(); assert.deepEqual(t.clicks, ['call'], 'one action per turn');
  t.save(); assert.equal(t.stored['pnhud-history:/games/test'][0].decisions[0].kind, 'auto');
  t.close();
  const restored = await boot({ html, stored: t.stored });
  assert.equal(restored.w.document.querySelector('[aria-label="Auto mode"]').value, 'full'); restored.close();
}
{
  const t = await boot({ html: TABLE.replace('<button id="call">Call 20</button>', '<button id="check">Check</button>'),
    stored: { pnhud: { ranges: {} } } });
  assert.equal(t.w.document.querySelector('.pnhud-rec-action').textContent, 'Check');
  assert.equal(t.w.document.querySelector('.pnhud-coach').hidden, true);
  assert.equal(t.w.document.querySelector('.pnhud-explanation').textContent, ''); t.close();
}
for (const equity of [.4, .1, 20 / 120 + .001]) {
  const opponent = TABLE.match(/<div id="opp".*?<\/div><\/div>/)[0]
    .replace('id="opp"', 'id="third"').replace('player-2', 'player-3').replaceAll('alex', 'sam').replace('Alex', 'Sam');
  const t = await boot({ html: TABLE + opponent, stored: { pnhud: { auto: true, autoMode: 'full', ranges: {} } },
    analyze: (_, cb) => cb({ equity, tie: 0, stderr: .01, handName: 'Pair' }) });
  assert.equal(t.w.PNParser.snapshot().opponents, 2);
  await t.fire(); assert.deepEqual(t.clicks, [equity > 20 / 120 ? 'call' : 'fold']); t.close();
}
console.log('regressions: actions, sizing, turns, queued folds, prices, async results, journal, storage errors, settings, Full Auto and quiet checks pass');
