(function () {
  'use strict';

  const parser = window.PNParser;
  const settings = { left: null, top: null, collapsed: false, hidden: false, scale: 1, auto: false, autoMode: 'selective', practice: false, ranges: {} };
  const historyKey = 'pnhud-history:' + location.pathname;
  let history, ui, mounted = false, dead = false, pending = false;
  let observer, poll, timer, saveTimer, autoTimer;
  let lastRun = 0, lastError = '', savedRevision = -1;
  let lastKey = '', lastDecision = '', lastResult = null, currentView = null;
  let highlighted = null, foldedHand = '', autoKey = '', autoGeneration = 0, committedTurn = '';
  let turnNumber = 0, previousTurn = null, automatic = false, automaticNote = '';
  const BUTTON_FOR = { Fold: 'fold', Check: 'check', Call: 'call', Bet: 'raise', Raise: 'raise' };

  function contextAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }
  function clearHighlight() {
    if (highlighted) highlighted.classList.remove('pnhud-suggest');
    highlighted = null;
  }
  function cancelAuto() {
    clearTimeout(autoTimer); autoTimer = null; autoKey = ''; autoGeneration++;
  }
  function markDead() {
    if (dead) return;
    dead = true; cancelAuto(); clearHighlight(); clearTimeout(timer); clearTimeout(saveTimer);
    if (poll) clearInterval(poll);
    if (observer) observer.disconnect();
    if (ui) ui.showIdle('Extension reloaded — refresh this page');
  }
  function report(where, err) {
    cancelAuto(); clearHighlight();
    const line = where + ': ' + (err && err.message ? err.message : String(err));
    if (line !== lastError) console.error('[PokerNow HUD] ' + line, err);
    lastError = line;
    if (ui) ui.showIdle('Error in ' + line + ' — see console');
  }
  function storeHistory() {
    if (!history || history.revision === savedRevision) return;
    if (!contextAlive()) { markDead(); return; }
    savedRevision = history.revision;
    chrome.storage.local.set({ [historyKey]: history.hands }, () => {
      const error = chrome.runtime.lastError;
      if (error) savedRevision = -1;
      ui.setStorageError(error ? 'Review could not be saved: ' + error.message + '. This tab still holds the current review.' : '');
    });
  }
  function refreshHistory() {
    if (history.revision === savedRevision) return;
    ui.renderHistory(history.hands);
    clearTimeout(saveTimer); saveTimer = setTimeout(storeHistory, 250);
  }
  function save() {
    if (!contextAlive()) { markDead(); return; }
    try { chrome.storage.local.set({ pnhud: settings }); } catch (_) { markDead(); }
  }
  function snapshot() {
    const snap = parser.snapshot();
    const hand = history.observe(snap);
    snap.handId = hand ? hand.id : '';
    snap.events = hand ? hand.events : [];
    snap.partial = !hand || hand.partial;
    snap.ranges = window.PokerRanges.forPlayers(snap, hand, settings.ranges);
    snap.rangeChoices = settings.ranges;
    snap.practice = settings.practice;
    snap.autoMode = settings.autoMode;
    if (snap.canCheck && snap.toCall === null) snap.toCall = 0;
    if (!previousTurn || (snap.yourTurn && !previousTurn.yourTurn) || snap.handId !== previousTurn.handId
      || snap.street !== previousTurn.street || snap.toCall !== previousTurn.toCall) turnNumber++;
    previousTurn = { yourTurn: snap.yourTurn, handId: snap.handId, street: snap.street, toCall: snap.toCall };
    snap.turnId = snap.handId + ':' + turnNumber;
    return snap;
  }
  function equityKey(snap) {
    return snap.key + '|' + JSON.stringify(snap.ranges.map(r => [r.id, r.text, r.error, r.continuing && r.continuing.text]));
  }
  function decisionKey(snap) {
    return JSON.stringify([equityKey(snap), snap.handId, snap.turnId, snap.pot, snap.toCall, snap.yourTurn,
      snap.canCheck, snap.canCall, snap.canRaise, snap.canFold, snap.folded, snap.raiseMin, snap.raiseMax,
      snap.heroBet, snap.stack, snap.sidePots, snap.uncalledExcess, snap.closesAction, snap.practice, snap.autoMode,
      snap.players.map(p => [p.id, p.bet, p.stack, p.folded, p.allIn, p.position]),
      snap.events.map(e => e.id)]);
  }
  function heroIsOut(snap) { return snap.folded || (foldedHand && foldedHand === snap.handId); }
  function adviceFor(snap, result) { return window.PokerAdvice.recommend(result, snap); }
  function analyze(snap) {
    return new Promise(resolve => {
      if (!contextAlive()) { markDead(); resolve(null); return; }
      try {
        chrome.runtime.sendMessage({ type: 'analyze', payload: {
          hole: snap.hole, board: snap.board, opponents: snap.opponents,
          ranges: snap.ranges.map(r => r.combos),
          continuing: snap.ranges.length === 1 && snap.ranges[0].continuing ? snap.ranges[0].continuing.combos : undefined,
        } }, res => resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : res));
      } catch (_) { markDead(); resolve(null); }
    });
  }
  function highlight(advice) {
    clearHighlight();
    if (!advice.yourTurn || settings.practice) return;
    const button = parser.actionButtons()[BUTTON_FOR[advice.action]];
    if (button) { highlighted = button; button.classList.add('pnhud-suggest'); }
  }
  async function performAction(advice, expected, generation) {
    let action = advice.action;
    let fallback = false;
    if (action === 'Bet' || action === 'Raise') {
      const input = parser.raiseInput();
      const bounds = input ? parser.inputBounds(input) : {};
      const want = advice.amount;
      const allowed = Number.isFinite(want) && want > 0 && input
        && (bounds.min == null || want >= bounds.min) && (bounds.max == null || want <= bounds.max);
      const applied = allowed ? parser.setInputValue(input, want) : null;
      // Allow the table's input handler to render before inspecting the live controls again.
      await new Promise(resolve => setTimeout(resolve, 0));
      const liveInput = parser.raiseInput();
      if (applied !== want || !liveInput || Number(liveInput.value) !== want) {
        action = action === 'Bet' ? 'Check' : 'Call'; fallback = true;
      }
    }
    if (dead || !settings.auto || generation !== autoGeneration) return;
    const fresh = snapshot();
    if (decisionKey(fresh) !== expected || !fresh.yourTurn || heroIsOut(fresh)) { schedule(); return; }
    const button = parser.actionButtons()[BUTTON_FOR[action]];
    if (!button) return;
    committedTurn = fresh.turnId;
    automatic = true;
    automaticNote = fallback ? 'could not set the raise amount safely; used ' + action : '';
    try { button.click(); } finally { automatic = false; automaticNote = ''; }
    clearHighlight();
  }
  function maybeAuto(snap, advice) {
    if (!settings.auto || !advice.autoEligible || heroIsOut(snap)) { cancelAuto(); return; }
    if (committedTurn === snap.turnId) return;
    const expected = decisionKey(snap);
    const key = expected + '|' + advice.action + '|' + advice.amount;
    if (autoKey === key) return;
    cancelAuto(); autoKey = key;
    const generation = autoGeneration;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      performAction(advice, expected, generation).catch(err => report('action', err));
    }, 700 + Math.random() * 1200);
  }
  function present(snap, result) {
    const advice = adviceFor(snap, result);
    const key = decisionKey(snap);
    currentView = { snap, result, advice, key };
    lastDecision = key;
    ui.render(snap, result, advice);
    highlight(advice); maybeAuto(snap, advice);
  }
  function defer() { clearTimeout(timer); timer = setTimeout(tick, 180); }
  function schedule() { if (Date.now() - lastRun > 700) tick(); else defer(); }
  async function tick() {
    try { await runTick(); } catch (err) { pending = false; report('tick', err); }
  }
  async function runTick() {
    if (dead) return;
    if (!contextAlive()) { markDead(); return; }
    lastRun = Date.now();
    if (!mounted) {
      if (!parser.tableDetected()) return;
      document.body.appendChild(ui.root); applySettings(); mounted = true;
    }
    const snap = snapshot(); refreshHistory();
    if (snap.hole.length !== 2 || heroIsOut(snap) || snap.opponents == null || snap.street === 'dealing') {
      clearHighlight(); cancelAuto(); currentView = null;
      if (snap.hole.length !== 2) { lastKey = ''; lastResult = null; foldedHand = ''; }
      ui.showIdle(heroIsOut(snap) ? 'You folded — review your decisions below'
        : snap.street === 'dealing' ? 'Waiting for the complete board…'
          : snap.opponents == null ? 'Opponent count unavailable'
            : 'Waiting for your cards…');
      return;
    }
    const rangeError = snap.ranges.find(r => r.error);
    if (rangeError) {
      clearHighlight(); cancelAuto(); currentView = null;
      ui.showIdle(rangeError.name + ': ' + rangeError.error); ui.renderRanges(snap); return;
    }
    const key = equityKey(snap);
    if (key === lastKey && lastResult) {
      if (decisionKey(snap) !== lastDecision) present(snap, lastResult);
      return;
    }
    clearHighlight(); cancelAuto(); currentView = null;
    if (pending) { defer(); return; }
    pending = true;
    const result = await analyze(snap);
    pending = false;
    if (dead) return;
    const fresh = snapshot(); refreshHistory();
    if (equityKey(fresh) !== key || heroIsOut(fresh) || fresh.hole.length !== 2) { defer(); return; }
    if (!result || result.error) { ui.showIdle('Analysis: ' + ((result && result.error) || 'no response')); ui.renderRanges(fresh); return; }
    lastKey = key; lastResult = result; present(fresh, result);
  }
  function stopAuto() {
    settings.auto = false; ui.setAuto(false); cancelAuto(); save();
  }
  function applySettings() {
    ui.setScale(settings.scale); ui.setAutoMode(settings.autoMode); ui.setAuto(settings.auto); ui.setPractice(settings.practice);
    if (settings.left !== null) {
      ui.root.style.left = settings.left + 'px'; ui.root.style.top = settings.top + 'px'; ui.root.style.right = 'auto';
    }
    if (settings.collapsed) {
      ui.root.classList.add('pnhud-collapsed');
      ui.root.querySelector('.pnhud-collapse').textContent = '+';
    }
    ui.root.hidden = settings.hidden;
  }
  function boot(saved) {
    history = window.PNHistory.create(saved);
    ui = window.PNOverlay.create({
      onDebug: () => parser.debug(),
      onAuto: on => {
        settings.auto = on;
        if (on && settings.practice) { settings.practice = false; ui.setPractice(false); }
        ui.setAuto(on); cancelAuto(); lastDecision = ''; tick(); save();
      },
      onPractice: on => {
        settings.practice = on; ui.setPractice(on);
        if (on) stopAuto();
        lastDecision = ''; tick(); save();
      },
      onAutoMode: mode => {
        settings.autoMode = mode; ui.setAutoMode(mode);
        cancelAuto(); lastDecision = ''; tick(); save();
      },
      onGuess: action => {
        const fresh = snapshot();
        if (!currentView || currentView.key !== decisionKey(fresh)) { tick(); return; }
        history.record(fresh, currentView.advice, action, { kind: 'practice' });
        refreshHistory(); ui.reveal(currentView.advice, action);
      },
      onRange: (id, choice) => {
        settings.ranges[id] = choice; cancelAuto(); lastDecision = ''; tick(); save();
      },
      onCollapse: collapsed => { settings.collapsed = collapsed; save(); },
      onMove: pos => { settings.left = pos.left; settings.top = pos.top; save(); },
      onResize: scale => { settings.scale = scale; save(); },
    });
    ui.renderHistory(history.hands); ui.showIdle('Waiting for your cards…');
    observer = new MutationObserver(records => {
      if (records.some(r => !(r.target.closest && r.target.closest('.pnhud')) && !(r.target.parentElement && r.target.parentElement.closest('.pnhud')))) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-disabled', 'hidden', 'style', 'min', 'max'] });
    poll = setInterval(tick, 2000);
    document.addEventListener('click', e => {
      const node = e.target && e.target.closest ? e.target.closest('button, [class*="action-button"], [role="button"]') : null;
      if (!node || node.closest('.pnhud')) return;
      const buttons = parser.actionButtons();
      const kind = Object.keys(buttons).find(k => buttons[k] === node);
      if (!kind) return;
      const snap = snapshot();
      if (!snap.yourTurn || heroIsOut(snap)) return;
      const action = kind === 'raise' ? (snap.toCall > 0 ? 'Raise' : 'Bet') : kind === 'allin' ? 'All-in' : kind[0].toUpperCase() + kind.slice(1);
      const matching = currentView && currentView.key === decisionKey(snap);
      let advice = matching ? currentView.advice : { action: 'Review', detail: 'No current analysis at decision time',
        facts: [], assumptions: [], reasons: [], alternatives: [], caveats: ['The table changed before analysis completed.'], rangeSummary: [] };
      if (automaticNote) advice = { ...advice, detail: advice.detail + ' — ' + automaticNote };
      const input = kind === 'raise' ? parser.raiseInput() : null;
      const value = input ? Number(input.value) : kind === 'call' ? snap.toCall : kind === 'allin' ? snap.stack : null;
      history.record(snap, advice, action, { kind: automatic ? 'auto' : 'manual', amount: value });
      committedTurn = snap.turnId;
      if (kind === 'fold') foldedHand = snap.handId;
      cancelAuto(); clearHighlight(); refreshHistory();
      if (settings.practice && matching) ui.reveal(advice, action);
      schedule();
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && settings.auto) stopAuto();
      else if (e.altKey && /h/i.test(e.key)) { settings.hidden = !settings.hidden; ui.root.hidden = settings.hidden; save(); }
    });
    window.addEventListener('pagehide', storeHistory);
    window.pnhudDebug = () => parser.debug();
    tick();
  }
  chrome.storage.local.get(['pnhud', historyKey], data => {
    if (data && data.pnhud) Object.assign(settings, data.pnhud);
    settings.ranges = settings.ranges || {};
    const start = () => { try { boot(data && data[historyKey]); } catch (err) { report('boot', err); } };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  });
})();
