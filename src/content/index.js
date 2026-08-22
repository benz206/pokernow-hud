(function () {
  'use strict';

  const parser = window.PNParser;
  const settings = { left: null, top: null, collapsed: false, hidden: false, scale: 1, auto: false };

  let ui = null;
  let mounted = false;
  let lastKey = '';
  let lastPotKey = '';
  let lastResult = null;
  let pending = false;
  let timer = null;
  let lastRun = 0;

  let lastError = '';
  let dead = false;
  let observer = null;
  let poll = null;

  // Reloading the extension orphans this script: chrome.runtime.id goes undefined
  // and every chrome.* call throws "Extension context invalidated". Shut down
  // cleanly instead of throwing on every tick.
  function contextAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (err) {
      return false;
    }
  }

  function markDead() {
    if (dead) return;
    dead = true;
    cancelAuto();
    clearHighlight();
    clearTimeout(timer);
    if (poll) clearInterval(poll);
    if (observer) observer.disconnect();
    if (ui) ui.showIdle('Extension reloaded — refresh this page');
  }

  function report(where, err) {
    const msg = (err && err.message) ? err.message : String(err);
    const line = where + ': ' + msg;
    if (line === lastError) return;
    lastError = line;
    console.error('[PokerNow HUD] ' + line, err);
    if (ui) ui.showIdle('Error in ' + line + ' — see console');
  }

  function analyze(payload) {
    return new Promise((resolve) => {
      if (!contextAlive()) { markDead(); resolve(null); return; }
      try {
        chrome.runtime.sendMessage({ type: 'analyze', payload }, (res) => {
          if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
          else resolve(res);
        });
      } catch (err) {
        markDead();
        resolve(null);
      }
    });
  }

  const AUTO_MIN_DELAY = 700;
  const AUTO_MAX_DELAY = 1900;

  const BUTTON_FOR = { Fold: 'fold', Check: 'check', Call: 'call', Bet: 'raise', Raise: 'raise' };

  let foldedHand = '';
  let highlighted = null;
  let autoTimer = null;
  let autoCommitted = '';

  function clearHighlight() {
    if (highlighted) {
      highlighted.classList.remove('pnhud-suggest');
      highlighted = null;
    }
  }

  function highlight(advice) {
    clearHighlight();
    if (!advice || !advice.yourTurn) return;
    const btn = parser.actionButtons()[BUTTON_FOR[advice.action]];
    if (btn) {
      btn.classList.add('pnhud-suggest');
      highlighted = btn;
    }
  }

  // Never press Raise unless the amount box verifiably holds what we intended: a
  // stale pre-filled value (often all-in) would otherwise commit the whole stack.
  function applyRaiseAmount(amount) {
    if (!amount || amount <= 0) return null;
    const input = parser.raiseInput();
    if (!input) return null;

    const bounds = parser.inputBounds(input);
    let want = amount;
    if (bounds.min !== null && want < bounds.min) want = bounds.min;
    if (bounds.max !== null && want > bounds.max) want = bounds.max;

    const applied = parser.setInputValue(input, want);
    if (applied === null) return null;
    return Math.abs(applied - want) <= Math.max(1, want * 0.02) ? applied : null;
  }

  function performAction(advice) {
    const btns = parser.actionButtons();
    const action = advice.action;

    if (action === 'Bet' || action === 'Raise') {
      const sized = applyRaiseAmount(advice.amount);
      if (sized !== null && btns.raise) {
        btns.raise.click();
        return { action: action, tone: advice.tone, why: advice.detail + ' — to ' + sized };
      }
      const fallback = action === 'Bet' ? btns.check : btns.call;
      if (!fallback) return null;
      fallback.click();
      return {
        action: action === 'Bet' ? 'Check' : 'Call',
        tone: 'neutral',
        why: 'could not set the raise amount safely',
      };
    }

    const btn = btns[BUTTON_FOR[action]];
    if (!btn) return null;
    btn.click();
    return { action: action, tone: advice.tone, why: advice.detail };
  }

  function handId(snap) {
    return snap.hole.join(',');
  }

  // Two independent signals: the seat is marked folded in the DOM, or we saw the
  // Fold button pressed during this hand (ours or the player's own click).
  function heroIsOut(snap) {
    return snap.folded || (foldedHand !== '' && foldedHand === handId(snap));
  }

  function cancelAuto() {
    clearTimeout(autoTimer);
    autoTimer = null;
    autoCommitted = '';
  }

  function stopAuto() {
    settings.auto = false;
    ui.setAuto(false);
    cancelAuto();
    save();
  }

  function maybeAuto(snap, advice) {
    if (!settings.auto || !advice.yourTurn) { cancelAuto(); return; }

    const spot = snap.key + '|' + snap.toCall + '|' + advice.action;
    if (spot === autoCommitted) return;
    cancelAuto();
    autoCommitted = spot;

    autoTimer = setTimeout(() => {
      autoTimer = null;
      if (!settings.auto) return;

      // Re-confirm at fire time: the turn may have passed during the delay.
      const fresh = parser.snapshot();
      if (fresh.key !== snap.key || fresh.toCall !== snap.toCall) return;
      if (!fresh.yourTurn || heroIsOut(fresh)) return;

      const outcome = performAction(advice);
      if (!outcome) return;
      ui.pushLog(outcome);
      clearHighlight();
    }, AUTO_MIN_DELAY + Math.random() * (AUTO_MAX_DELAY - AUTO_MIN_DELAY));
  }

  function adviceFor(snap, result) {
    if (!window.PokerAdvice) throw new Error('advice.js did not load');
    return window.PokerAdvice.recommend(result.win + result.tie, snap);
  }

  function save() {
    if (!contextAlive()) { markDead(); return; }
    try {
      chrome.storage.local.set({ pnhud: settings });
    } catch (err) {
      markDead();
    }
  }

  function applySettings() {
    ui.setScale(settings.scale);
    ui.setAuto(settings.auto);
    if (settings.left !== null) {
      ui.root.style.left = settings.left + 'px';
      ui.root.style.top = settings.top + 'px';
      ui.root.style.right = 'auto';
    }
    if (settings.collapsed) {
      ui.root.classList.add('pnhud-collapsed');
      const toggle = ui.root.querySelector('.pnhud-head .pnhud-btn:last-child');
      if (toggle) toggle.textContent = '+';
    }
    ui.root.hidden = settings.hidden;
  }

  function defer() {
    clearTimeout(timer);
    timer = setTimeout(tick, 180);
  }

  function schedule() {
    if (Date.now() - lastRun > 700) tick();
    else defer();
  }

  async function tick() {
    try {
      await runTick();
    } catch (err) {
      pending = false;
      report('tick', err);
    }
  }

  async function runTick() {
    if (dead) return;
    if (!contextAlive()) { markDead(); return; }
    if (pending) { defer(); return; }
    lastRun = Date.now();

    if (!mounted) {
      if (!parser.tableDetected()) return;
      document.body.appendChild(ui.root);
      applySettings();
      mounted = true;
    }

    const snap = parser.snapshot();
    if (snap.opponents === null || snap.opponents === undefined) snap.opponents = 1;

    if (snap.hole.length !== 2) {
      lastKey = '';
      lastResult = null;
      foldedHand = '';
      clearHighlight();
      cancelAuto();
      ui.showIdle(parser.cardCount() > 0
        ? 'Cards on table but unreadable — click ⌕ to copy a debug dump'
        : 'Waiting for your cards…');
      return;
    }

    if (heroIsOut(snap)) {
      lastKey = '';
      lastResult = null;
      clearHighlight();
      cancelAuto();
      ui.showIdle('You folded — sitting out until the next hand');
      return;
    }

    const key = snap.key;
    const potKey = [snap.pot, snap.toCall, snap.canCheck, snap.canCall, snap.canRaise].join('/');

    if (key === lastKey) {
      if (potKey !== lastPotKey && lastResult) {
        lastPotKey = potKey;
        const cached = adviceFor(snap, lastResult);
        ui.render(snap, lastResult, cached);
        highlight(cached);
        maybeAuto(snap, cached);
      }
      return;
    }

    pending = true;
    const result = await analyze({ hole: snap.hole, board: snap.board, opponents: snap.opponents });
    pending = false;

    if (dead) return;
    if (!result || result.error) {
      ui.showIdle('Error: ' + ((result && result.error) || 'no response'));
      return;
    }

    lastKey = key;
    lastPotKey = potKey;
    lastResult = result;
    const advice = adviceFor(snap, result);
    ui.render(snap, result, advice);
    highlight(advice);
    maybeAuto(snap, advice);
  }

  function boot() {
    ui = window.PNOverlay.create({
      onDebug: () => parser.debug(),
      onAuto: (on) => {
        settings.auto = on;
        ui.setAuto(on);
        if (!on) cancelAuto();
        else { lastKey = ''; tick(); }
        save();
      },
      onCollapse: (collapsed) => { settings.collapsed = collapsed; save(); },
      onMove: (pos) => { settings.left = pos.left; settings.top = pos.top; save(); },
      onResize: (scale) => { settings.scale = scale; save(); },
    });

    ui.showIdle('Waiting for your cards…');

    observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    poll = setInterval(tick, 2000);

    document.addEventListener('click', (e) => {
      const node = e.target;
      if (!node || !node.closest) return;
      const btn = node.closest('button, [class*="action-button"], [role="button"]');
      if (!btn || btn.closest('.pnhud')) return;
      if (!/^fold\b/i.test(String(btn.textContent || '').trim())) return;
      foldedHand = handId(parser.snapshot()) || 'out';
      cancelAuto();
      clearHighlight();
      schedule();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settings.auto) {
        stopAuto();
        return;
      }
      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        settings.hidden = !settings.hidden;
        ui.root.hidden = settings.hidden;
        save();
      }
    });

    window.pnhudDebug = () => parser.debug();
    tick();
  }

  function missingDependency() {
    if (!window.PNParser) return 'parser.js';
    if (!window.PNOverlay) return 'overlay.js';
    if (!window.PokerAdvice) return 'advice.js';
    return null;
  }

  window.addEventListener('error', (e) => {
    if (e.filename && e.filename.indexOf('chrome-extension://') === 0) {
      console.error('[PokerNow HUD] uncaught', e.filename.split('/').pop() + ':' + e.lineno, e.message);
    }
  });
  window.addEventListener('unhandledrejection', (e) => report('async', e.reason));

  chrome.storage.local.get('pnhud', (data) => {
    const missing = missingDependency();
    if (missing) {
      console.error('[PokerNow HUD] ' + missing + ' did not load — check the manifest and reload the extension');
      return;
    }
    if (data && data.pnhud) Object.assign(settings, data.pnhud);
    const start = () => { try { boot(); } catch (err) { report('boot', err); } };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  });
})();
