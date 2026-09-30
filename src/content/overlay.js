(function (root) {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUIT_GLYPH = { c: '♣', d: '♦', h: '♥', s: '♠' };
  const SUITS = 'cdhs';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function create(handlers) {
    const rootEl = el('div', 'pnhud');
    rootEl.setAttribute('aria-label', 'Poker coach');
    const head = el('div', 'pnhud-head');
    const title = el('div', 'pnhud-title', 'Poker coach');
    const autoBtn = el('button', 'pnhud-btn', 'AUTO');
    autoBtn.title = 'Automatically take eligible actions; Escape stops';
    const settingsBtn = el('button', 'pnhud-btn', '⚙'); settingsBtn.setAttribute('aria-label', 'Settings');
    settingsBtn.setAttribute('aria-expanded', 'false');
    const dbg = el('button', 'pnhud-control', 'Copy parser diagnostics');
    const collapse = el('button', 'pnhud-btn pnhud-collapse', '–'); collapse.title = 'Collapse';
    head.append(title, autoBtn, settingsBtn, collapse);
    const autobar = el('div', 'pnhud-autobar', 'Auto enabled — waiting for an eligible decision');
    const body = el('div', 'pnhud-body');
    const idle = el('div', 'pnhud-idle', 'Waiting for your cards…');
    const practiceLabel = el('label', 'pnhud-practice-label');
    const practice = el('input'); practice.type = 'checkbox';
    practiceLabel.append(practice, document.createTextNode(' Choose first, then reveal the lesson'));
    const settingsPanel = el('div', 'pnhud-settings'); settingsPanel.hidden = true;
    settingsPanel.append(el('strong', null, 'Settings'));
    const autoMode = el('select'); autoMode.setAttribute('aria-label', 'Auto mode');
    for (const [value, label] of [['selective', 'Selective auto'], ['full', 'Full Auto · every street']]) {
      const option = el('option', null, label); option.value = value; autoMode.append(option);
    }
    const modeLabel = el('label', 'pnhud-field'); modeLabel.append(document.createTextNode('Auto mode'), autoMode);
    const modeHelp = el('p', 'pnhud-note');
    settingsPanel.append(modeLabel, modeHelp, practiceLabel, dbg);
    const content = el('div');
    const cards = el('div', 'pnhud-cards');
    const context = el('div', 'pnhud-context');
    const equity = el('div', 'pnhud-equity pnhud-answer');
    const eqval = el('div', 'pnhud-eqval', '–');
    const eqlabel = el('div', 'pnhud-eqlabel', 'showdown equity');
    equity.append(eqval, eqlabel);
    const bar = el('div', 'pnhud-bar pnhud-answer');
    const fill = el('div', 'pnhud-bar-fill'), mark = el('div', 'pnhud-bar-mark');
    bar.append(fill, mark);
    const rec = el('div', 'pnhud-rec neutral pnhud-answer');
    const recAction = el('div', 'pnhud-rec-action', '–'), recDetail = el('div', 'pnhud-rec-detail');
    rec.append(recAction, recDetail);
    const guessBox = el('div', 'pnhud-guess');
    guessBox.append(el('p', null, 'What would you do? This records a practice choice; it does not play a table action.'));
    const guesses = {};
    for (const action of ['Fold', 'Check', 'Call', 'Bet', 'Raise']) {
      const b = el('button', 'pnhud-control', action);
      b.addEventListener('click', () => handlers.onGuess(action)); guesses[action] = b; guessBox.append(b);
    }
    const feedback = el('div', 'pnhud-feedback');
    const rows = {}, rowBox = el('div');
    for (const [key, label, tip] of [
      ['hand', 'Hand', 'Your best five-card hand right now'],
      ['pot', 'Pot', 'Current total, including outstanding bets'],
      ['draws', 'Draw cards', 'Flush or straight completion cards, not guaranteed winning outs'],
      ['odds', 'Pot odds', 'Required equity for this call, assuming you can win the whole pot'],
      ['margin', 'Equity margin', 'Showdown equity minus the call threshold, in percentage points'],
      ['ev', 'Call EV (model)', 'Expected chips with no further betting or rake, against the displayed assumptions'],
    ]) {
      const row = el('div', 'pnhud-row' + (['hand', 'pot', 'odds'].includes(key) ? '' : ' pnhud-answer'));
      row.title = tip;
      const value = el('div', 'pnhud-v', '–'); row.append(el('div', 'pnhud-k', label), value);
      rows[key] = { row, value }; rowBox.append(row);
    }
    const coach = el('div', 'pnhud-coach pnhud-answer');
    const explanation = el('div', 'pnhud-explanation');
    const more = el('details', 'pnhud-more'); more.append(el('summary', null, 'Numbers & deeper reasoning'));
    const moreBody = el('div', 'pnhud-answer'); more.append(rowBox, moreBody); coach.append(explanation);
    const foot = el('div', 'pnhud-foot');
    const oppLabel = el('span', 'pnhud-opp'); foot.append(oppLabel);
    content.append(cards, context, rec, guessBox, feedback, coach, equity, bar, more, foot);
    const rangeBox = el('details', 'pnhud-ranges');
    rangeBox.append(el('summary', null, 'Opponent assumptions'));
    rangeBox.append(el('p', 'pnhud-note', 'These are editable models, not claims about hidden cards. Weights run from 0 to 1; overlapping hands use the last weight. “+” adds higher pairs or kickers.'));
    const rangeList = el('div'); rangeBox.append(rangeList);
    const editors = new Map();
    const journal = el('details', 'pnhud-journal');
    const journalTitle = el('summary', null, 'Decision review');
    const journalBody = el('div'); journal.append(journalTitle, journalBody);
    const storageStatus = el('div', 'pnhud-error'); storageStatus.setAttribute('role', 'status'); storageStatus.hidden = true;
    body.append(settingsPanel, idle, content, rangeBox, storageStatus, journal);
    const grip = el('div', 'pnhud-grip'); grip.title = 'Drag to resize';
    rootEl.append(head, autobar, body, grip);
    let scale = 1, practiceOn = false, revealed = '', spot = '';
    autoBtn.addEventListener('click', () => handlers.onAuto(!rootEl.classList.contains('pnhud-auto')));
    settingsBtn.addEventListener('click', () => {
      settingsPanel.hidden = !settingsPanel.hidden;
      settingsBtn.setAttribute('aria-expanded', String(!settingsPanel.hidden));
    });
    autoMode.addEventListener('change', () => handlers.onAutoMode(autoMode.value));
    practice.addEventListener('change', () => handlers.onPractice(practice.checked));
    dbg.addEventListener('click', handlers.onDebug);
    collapse.addEventListener('click', () => {
      const collapsed = rootEl.classList.toggle('pnhud-collapsed'); collapse.textContent = collapsed ? '+' : '–'; handlers.onCollapse(collapsed);
    });
    function setScale(v) { scale = clamp(v, .7, 2.5); rootEl.style.setProperty('--pnhud-scale', String(scale)); return scale; }
    makeDraggable(rootEl, head, handlers.onMove);
    makeResizable(rootEl, grip, () => scale, setScale, () => handlers.onResize(scale));
    function section(parent, label, texts) {
      if (!texts || !texts.length) return;
      parent.append(el('strong', 'pnhud-section-label', label));
      for (const text of texts) parent.append(el('p', null, text));
    }
    function setRow(key, text) { rows[key].row.hidden = text == null; if (text != null) rows[key].value.textContent = text; }
    function learningVisibility() {
      rootEl.classList.toggle('pnhud-blind', practiceOn && revealed !== spot);
      guessBox.hidden = !practiceOn || revealed === spot;
    }
    function renderRanges(snap) {
      const ids = new Set(snap.ranges.map(r => r.id));
      for (const [id, editor] of editors) if (!ids.has(id)) { editor.root.remove(); editors.delete(id); }
      rangeBox.hidden = !snap.ranges.length;
      for (const r of snap.ranges) {
        let editor = editors.get(r.id);
        if (!editor) {
          const box = el('div', 'pnhud-range');
          const name = el('strong', null, r.name), detail = el('p', 'pnhud-note');
          const mode = el('select'); mode.setAttribute('aria-label', r.name + ' range');
          for (const [value, label] of [['auto', 'From observed preflop action'], ['random', 'Random hands'], ['early', 'Early opening example'], ['late', 'Late opening example'], ['open', 'Opening example'], ['reraise', 'Re-raise example'], ['custom', 'Custom range']]) {
            const option = el('option', null, label); option.value = value; mode.append(option);
          }
          const custom = el('input'); custom.type = 'text'; custom.placeholder = 'QQ+, AKs, AsKd:0.5'; custom.setAttribute('aria-label', r.name + ' custom range');
          const continues = el('input'); continues.type = 'text'; continues.placeholder = 'Optional: KQ, AK, 88'; continues.setAttribute('aria-label', r.name + ' continues vs our raise');
          const continueLabel = el('label', 'pnhud-field'); continueLabel.append(document.createTextNode('Continues vs our raise (heads-up)'), continues);
          const apply = el('button', 'pnhud-control', 'Apply assumptions');
          const error = el('div', 'pnhud-error'); error.setAttribute('role', 'status');
          apply.addEventListener('click', () => {
            try {
              if (mode.value === 'custom' && !custom.value.trim()) throw new Error('Enter a custom range');
              if (mode.value === 'custom') window.PokerRanges.parse(custom.value);
              if (continues.value.trim()) window.PokerRanges.parse(continues.value);
              error.textContent = ''; handlers.onRange(r.id, { mode: mode.value, text: custom.value, continuing: continues.value });
            } catch (err) { error.textContent = err.message; }
          });
          mode.addEventListener('change', () => { custom.hidden = mode.value !== 'custom'; });
          box.append(name, detail, mode, custom, continueLabel, apply, error); rangeList.append(box);
          editor = { root: box, name, detail, mode, custom, continues, error }; editors.set(r.id, editor);
          const choice = snap.rangeChoices && snap.rangeChoices[r.id];
          mode.value = choice ? choice.mode : 'auto'; custom.value = choice ? choice.text || '' : '';
          continues.value = choice ? choice.continuing || '' : ''; custom.hidden = mode.value !== 'custom';
        }
        editor.name.textContent = r.name;
        const known = [...snap.hole, ...snap.board];
        const count = r.combos ? r.combos.filter(c => c.cards.every(x => !known.includes(x))).length : null;
        editor.detail.textContent = (r.text || 'Invalid range') + (count === null ? '' : ' · ' + count + ' unblocked combinations') + '. ' + r.reason;
        editor.error.textContent = r.error || '';
      }
    }
    const ui = {
      root: rootEl, setScale, renderRanges,
      setStorageError(message) { storageStatus.hidden = !message; storageStatus.textContent = message; },
      setAuto(on) {
        rootEl.classList.toggle('pnhud-auto', !!on); autoBtn.classList.toggle('pnhud-btn-on', !!on);
        autoBtn.setAttribute('aria-pressed', String(!!on));
        autoBtn.textContent = on ? 'Stop auto' : autoMode.value === 'full' ? 'Full Auto' : 'AUTO';
      },
      setAutoMode(mode) {
        autoMode.value = mode === 'full' ? 'full' : 'selective';
        modeHelp.textContent = autoMode.value === 'full'
          ? 'Plays the model on every street, including multiway pots. Close estimates use the call/fold threshold. Unreadable prices and side pots still pause. Escape stops.'
          : 'Checks freely; plays heads-up river and all-in decisions. Other spots wait for you. Escape stops.';
        ui.setAuto(rootEl.classList.contains('pnhud-auto'));
      },
      setPractice(on) { practiceOn = !!on; practice.checked = practiceOn; revealed = ''; learningVisibility(); },
      reveal(advice, action) {
        revealed = spot; learningVisibility();
        feedback.textContent = 'You chose ' + action + '. ' + (advice.action === 'Review' ? 'This spot needs more information.'
          : action === advice.action ? 'That matches the displayed model. Read why below.' : 'The model suggests ' + advice.action + '. Compare its assumptions with your read; a difference is not proof of a mistake.');
      },
      showIdle(msg) { idle.textContent = msg; idle.hidden = false; content.hidden = true; },
      render(snap, result, advice) {
        idle.hidden = true; content.hidden = false;
        const nextSpot = snap.handId + '|' + snap.turnId + '|' + snap.pot + '|' + snap.toCall + '|' + JSON.stringify(advice.rangeSummary);
        if (nextSpot !== spot) { spot = nextSpot; feedback.textContent = ''; }
        learningVisibility();
        cards.textContent = '';
        for (const c of snap.hole) cards.append(cardChip(c));
        if (snap.board.length) { cards.append(el('span', 'pnhud-sep', '·')); for (const c of snap.board) cards.append(cardChip(c)); }
        context.textContent = (snap.street || '') + (snap.position ? ' · ' + snap.position : '') + (snap.effectiveStack != null ? ' · effective stack ' + snap.effectiveStack : '');
        const eq = result.equity;
        eqval.textContent = (eq * 100).toFixed(1) + '%';
        eqval.style.color = advice.tone === 'bad' ? '#f87171' : advice.tone === 'good' ? '#4ade80' : '#cdd9ee';
        fill.style.background = advice.tone === 'bad' ? '#f87171' : advice.tone === 'good' ? '#4ade80' : '#94a3b8';
        eqlabel.textContent = 'equity ' + (snap.ranges.some(r => r.combos) ? 'vs assumed ranges' : 'vs random hands');
        equity.title = 'Showdown equity · tie ' + (result.tie * 100).toFixed(1) + '%';
        fill.style.width = (eq * 100).toFixed(1) + '%';
        setRow('hand', result.handName);
        setRow('pot', snap.pot == null ? 'not found' : String(snap.pot));
        setRow('draws', result.draws ? result.draws.count + ' completion cards' : null);
        setRow('odds', advice.need === null ? (snap.toCall > 0 ? 'unavailable' : null) : 'need ' + (advice.need * 100).toFixed(1) + '%');
        setRow('margin', advice.margin === null ? null : (advice.margin >= 0 ? '+' : '') + (advice.margin * 100).toFixed(1) + ' pp');
        setRow('ev', advice.ev === null ? null : (advice.ev >= 0 ? '+' : '') + advice.ev.toFixed(1) + ' chips');
        mark.hidden = advice.need === null; if (advice.need !== null) mark.style.left = (advice.need * 100).toFixed(1) + '%';
        rec.className = 'pnhud-rec pnhud-answer ' + advice.tone + (advice.yourTurn ? '' : ' waiting');
        recAction.textContent = advice.action + (advice.amount ? ' ' + advice.amount : '');
        recDetail.textContent = advice.yourTurn ? advice.detail : 'not your turn';
        explanation.textContent = '';
        const routineCheck = advice.action === 'Check';
        coach.hidden = routineCheck;
        if (!routineCheck) {
          section(explanation, 'At the table', advice.facts.slice(0, 1));
          section(explanation, 'Our read', [advice.summary || advice.detail,
            ...advice.reasons.filter(r => r.includes('edit that assumption'))].filter(Boolean));
        }
        moreBody.textContent = '';
        section(moreBody, 'Calculation & reasoning', advice.reasons);
        section(moreBody, 'Assumptions', advice.assumptions);
        section(moreBody, 'Alternatives & what changes this', advice.alternatives);
        section(moreBody, 'Lesson', [advice.lesson].filter(Boolean));
        if (result.draws) section(moreBody, 'Draw completion', [
          result.draws.cards.length ? result.draws.cards.join(', ') : 'No one-card flush or straight completion.',
          (result.draws.nextCard * 100).toFixed(1) + '% to see a listed card next' + (snap.board.length === 3 ? '; ' + (result.draws.byRiver * 100).toFixed(1) + '% by the river if you see both cards. These are card-removal-only estimates.' : '. These are card-removal-only estimates.'),
          result.draws.note,
        ]);
        section(moreBody, 'Limits of this decision', advice.caveats);
        oppLabel.textContent = 'vs ' + snap.opponents + (snap.opponents === 1 ? ' opponent' : ' opponents');
        autobar.textContent = (snap.autoMode === 'full' ? 'Full Auto' : 'Selective auto') + (advice.autoEligible
          ? ' · playing this turn · Esc to stop' : advice.yourTurn ? ' · paused for review' : ' · waiting for your turn');
        for (const [action, b] of Object.entries(guesses)) b.disabled = !snap.yourTurn || !(action === 'Fold' ? snap.canFold : action === 'Check' ? snap.canCheck : action === 'Call' ? snap.canCall : snap.canRaise && ((action === 'Raise') === (snap.toCall > 0)));
        renderRanges(snap);
      },
      renderHistory(hands) {
        const open = new Set([...journalBody.querySelectorAll('details[open]')].map(e => e.dataset.id));
        journalBody.textContent = '';
        const count = hands.reduce((n, h) => n + h.decisions.length, 0);
        journalTitle.textContent = 'Decision review (' + count + ')';
        if (!hands.length) journalBody.append(el('p', 'pnhud-note', 'Your manual decisions and practice choices will appear here. Saved locally for this table.'));
        for (const hand of hands) {
          const item = el('details', 'pnhud-hand-review'); item.dataset.id = hand.id; item.open = open.has(hand.id);
          item.append(el('summary', null, (hand.number != null ? 'Hand #' + hand.number : 'Observed hand') + ' · ' + hand.decisions.length + ' decisions' + (hand.ended || hand.finished ? ' · ended' : ' · in progress')));
          item.append(el('p', 'pnhud-note', (hand.partial ? 'Partial history. ' : '') + 'Review the information available at the decision; winning or losing does not grade the choice.'));
          for (const d of hand.decisions.slice().reverse()) {
            const row = el('details', 'pnhud-log-row'); row.dataset.id = d.id; row.open = open.has(d.id);
            row.append(el('summary', 'pnhud-log-act', d.kind + ': ' + d.action + (d.amount != null ? ' ' + d.amount : '') + ' · ' + d.snapshot.street));
            row.append(el('p', 'pnhud-note', d.kind === 'practice' ? 'Practice only; no table action.' : d.confirmed ? 'Confirmed by a table update or game log.' : 'Selected; table acceptance not yet observed.'));
            row.append(el('p', null, 'Cards: ' + d.snapshot.hole.map(cardText).join(' ') + ' · Board: ' + d.snapshot.board.map(cardText).join(' ')
              + ' · Pot ' + d.snapshot.pot + ' · Call ' + d.snapshot.toCall));
            row.append(el('p', 'pnhud-log-why', 'At the time: ' + d.advice.action + ' — ' + d.advice.detail));
            section(row, 'Observed at the decision', d.advice.facts);
            section(row, 'Assumptions at the decision', d.advice.assumptions);
            section(row, 'Reasoning', d.advice.reasons);
            section(row, 'What could change the answer', d.advice.alternatives);
            section(row, 'Limitations', d.advice.caveats);
            section(row, 'Action sequence known at the time', (d.snapshot.events || []).map(e => e.street + ': ' + e.text + (e.inferred ? ' [inferred]' : '')));
            item.append(row);
          }
          const timeline = el('details'); timeline.dataset.id = hand.id + ':timeline'; timeline.open = open.has(timeline.dataset.id);
          timeline.append(el('summary', null, 'Action timeline (' + hand.events.length + ')'));
          for (const e of hand.events) timeline.append(el('p', 'pnhud-note', e.street + ' · ' + e.text + ' [' + (e.inferred ? 'inferred from table' : e.source) + ']'));
          item.append(timeline); journalBody.append(item);
        }
      },
    };
    return ui;
  }

  function cardText(c) { return RANKS[c >> 2] + SUIT_GLYPH[SUITS[c & 3]]; }

  function cardChip(c) {
    const suit = SUITS[c & 3];
    const n = el('span', 'pnhud-card' + (suit === 'h' || suit === 'd' ? ' red' : ''));
    n.textContent = (RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2]) + SUIT_GLYPH[suit];
    return n;
  }

  // Listen on the window, not the handle: with handle-bound listeners the pointerup
  // is missed as soon as the cursor leaves the header, which leaves the panel stuck
  // to the mouse until the next click. Capture phase so the page cannot swallow them.
  function trackDrag(onStart, onMove, onEnd) {
    return (e) => {
      if (e.button !== 0) return;
      onStart(e);
      e.preventDefault();
      e.stopPropagation();

      const move = (ev) => {
        if (ev.buttons === 0) { finish(); return; }
        onMove(ev);
        ev.preventDefault();
      };
      const finish = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', finish, true);
        window.removeEventListener('pointercancel', finish, true);
        window.removeEventListener('blur', finish, true);
        if (onEnd) onEnd();
      };

      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', finish, true);
      window.addEventListener('pointercancel', finish, true);
      window.addEventListener('blur', finish, true);
    };
  }

  function makeDraggable(node, handle, onMove) {
    let sx = 0, sy = 0, ox = 0, oy = 0;

    const startDrag = trackDrag(
      (e) => {
        const r = node.getBoundingClientRect();
        ox = r.left; oy = r.top;
        sx = e.clientX; sy = e.clientY;
        node.style.right = 'auto';
        node.style.left = ox + 'px';
        node.style.top = oy + 'px';
      },
      (e) => {
        node.style.left = clamp(ox + e.clientX - sx, 0, window.innerWidth - node.offsetWidth) + 'px';
        node.style.top = clamp(oy + e.clientY - sy, 0, window.innerHeight - 40) + 'px';
      },
      () => onMove({ left: parseFloat(node.style.left), top: parseFloat(node.style.top) }),
    );

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pnhud-btn')) return;
      startDrag(e);
    });
  }

  function makeResizable(node, grip, getScale, setScale, onDone) {
    let startX = 0, startW = 0, startScale = 1;

    grip.addEventListener('pointerdown', trackDrag(
      (e) => {
        startX = e.clientX;
        startW = node.offsetWidth || 232;
        startScale = getScale();
      },
      (e) => setScale(startScale * ((startW + (e.clientX - startX)) / startW)),
      onDone,
    ));
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  root.PNOverlay = { create };
})(typeof window !== 'undefined' ? window : globalThis);
