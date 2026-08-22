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

    const head = el('div', 'pnhud-head');
    const title = el('div', 'pnhud-title', 'Odds');
    const autoBtn = el('button', 'pnhud-btn', 'AUTO');
    autoBtn.title = 'Auto-play: click the recommended Fold / Check / Call for me';
    const dbg = el('button', 'pnhud-btn', '⌕');
    dbg.title = 'Dump parser debug info to console';
    const collapse = el('button', 'pnhud-btn', '–');
    collapse.title = 'Collapse';
    head.append(title, autoBtn, dbg, collapse);

    const autobar = el('div', 'pnhud-autobar');
    autobar.append(el('span', 'pnhud-autodot'), el('span', null, 'Auto-playing'));

    const body = el('div', 'pnhud-body');
    const idle = el('div', 'pnhud-idle', 'Waiting for your cards…');

    const content = el('div');
    const cards = el('div', 'pnhud-cards');

    const equity = el('div', 'pnhud-equity');
    const eqval = el('div', 'pnhud-eqval', '–');
    const eqlabel = el('div', 'pnhud-eqlabel', 'equity');
    equity.append(eqval, eqlabel);

    const bar = el('div', 'pnhud-bar');
    const fill = el('div', 'pnhud-bar-fill');
    const mark = el('div', 'pnhud-bar-mark');
    mark.style.display = 'none';
    bar.append(fill, mark);

    const rec = el('div', 'pnhud-rec neutral');
    const recAction = el('div', 'pnhud-rec-action', '–');
    const recDetail = el('div', 'pnhud-rec-detail', '');
    rec.title = 'Chip-EV suggestion from raw equity and pot odds only — it knows nothing about position, ranges or implied odds';
    rec.append(recAction, recDetail);

    const rows = {};
    const rowBox = el('div');
    const ROWS = [
      ['hand', 'Hand', 'Your best five-card hand right now'],
      ['pot', 'Pot', 'Pot size read from the table'],
      ['outs', 'Outs', 'Cards that turn a currently-losing hand into a winning one'],
      ['odds', 'Pot odds', 'Equity you need to break even on the call'],
      ['call', 'Call EV', 'Your equity minus the equity the pot odds require'],
    ];
    for (const [key, label, tip] of ROWS) {
      const r = el('div', 'pnhud-row');
      r.title = tip;
      const v = el('div', 'pnhud-v', '–');
      r.append(el('div', 'pnhud-k', label), v);
      rows[key] = { row: r, value: v };
      rowBox.append(r);
    }

    const foot = el('div', 'pnhud-foot');
    const oppLabel = el('span', 'pnhud-opp', 'vs 2 opponents');
    oppLabel.title = 'Seats still holding cards, detected from the table';
    foot.append(oppLabel);

    const log = el('div', 'pnhud-log');
    const logList = el('div');
    const logEmpty = el('div', 'pnhud-log-empty', 'No actions taken yet.');
    log.append(el('div', 'pnhud-log-title', 'Recent auto actions'), logEmpty, logList);

    content.append(cards, equity, bar, rec, rowBox, foot, log);
    body.append(idle, content);

    const grip = el('div', 'pnhud-grip');
    grip.title = 'Drag to resize';
    rootEl.append(head, autobar, body, grip);

    autoBtn.addEventListener('click', () => handlers.onAuto(!rootEl.classList.contains('pnhud-auto')));
    dbg.addEventListener('click', handlers.onDebug);
    collapse.addEventListener('click', () => {
      const now = rootEl.classList.toggle('pnhud-collapsed');
      collapse.textContent = now ? '+' : '–';
      handlers.onCollapse(now);
    });
    let scale = 1;
    function setScale(v) {
      scale = clamp(v, 0.7, 2.5);
      rootEl.style.setProperty('--pnhud-scale', String(scale));
      return scale;
    }

    makeDraggable(rootEl, head, handlers.onMove);
    makeResizable(rootEl, grip, () => scale, setScale, () => handlers.onResize(scale));

    const ui = {
      root: rootEl,
      setScale,
      setAuto(on) {
        rootEl.classList.toggle('pnhud-auto', !!on);
        autoBtn.classList.toggle('pnhud-btn-on', !!on);
      },
      pushLog(entry) {
        logEmpty.style.display = 'none';
        const row = el('div', 'pnhud-log-row');
        row.append(
          el('div', 'pnhud-log-act ' + (entry.tone || 'neutral'), entry.action),
          el('div', 'pnhud-log-why', entry.why),
        );
        logList.prepend(row);
        while (logList.children.length > 5) logList.lastChild.remove();
      },
      showIdle(msg) {
        idle.textContent = msg;
        idle.style.display = '';
        content.style.display = 'none';
      },
      render(snap, result, advice) {
        idle.style.display = 'none';
        content.style.display = '';

        cards.textContent = '';
        for (const c of snap.hole) cards.append(cardChip(c));
        if (snap.board.length) {
          cards.append(el('span', 'pnhud-sep', '·'));
          for (const c of snap.board) cards.append(cardChip(c));
        }

        const eq = result.win + result.tie;
        eqval.textContent = (eq * 100).toFixed(1) + '%';
        eqval.style.color = eq >= 0.55 ? '#4ade80' : eq >= 0.35 ? '#fbbf24' : '#f87171';
        eqlabel.textContent = result.tie > 0.005
          ? 'win ' + (result.win * 100).toFixed(1) + '% · tie ' + (result.tie * 100).toFixed(1) + '%'
          : 'equity';
        fill.style.width = (eq * 100).toFixed(1) + '%';
        fill.style.background = eq >= 0.55
          ? 'linear-gradient(90deg,#22c55e,#4ade80)'
          : eq >= 0.35 ? 'linear-gradient(90deg,#d97706,#fbbf24)'
            : 'linear-gradient(90deg,#dc2626,#f87171)';

        setRow(rows.hand, result.handName, !!result.handName);
        rows.pot.value.className = 'pnhud-v' + (snap.pot === null ? ' bad' : '');
        setRow(rows.pot, snap.pot === null ? 'not found' : String(snap.pot), true);
        setRow(
          rows.outs,
          result.outs ? result.outs.count + (result.outs.count === 1 ? ' card' : ' cards') : null,
          !!result.outs,
        );

        const need = potOddsNeeded(snap);
        if (need === null) {
          setRow(rows.odds, null, false);
          setRow(rows.call, null, false);
          mark.style.display = 'none';
        } else {
          setRow(rows.odds, 'need ' + (need * 100).toFixed(1) + '%', true);
          const edge = eq - need;
          rows.call.value.className = 'pnhud-v ' + (edge >= 0 ? 'good' : 'bad');
          setRow(rows.call, (edge >= 0 ? '+' : '') + (edge * 100).toFixed(1) + '%', true);
          mark.style.display = '';
          mark.style.left = (need * 100).toFixed(1) + '%';
        }

        rec.className = 'pnhud-rec ' + advice.tone + (advice.yourTurn ? '' : ' waiting');
        recAction.textContent = advice.action + (advice.amount ? ' ' + advice.amount : '');
        recDetail.textContent = advice.yourTurn ? advice.detail : 'not your turn';

        const n = snap.opponents;
        oppLabel.textContent = 'vs ' + n + (n === 1 ? ' opponent' : ' opponents');
      },
    };

    return ui;

    function setRow(r, text, show) {
      r.row.style.display = show ? '' : 'none';
      if (show) r.value.textContent = text;
    }
  }

  function cardChip(c) {
    const suit = SUITS[c & 3];
    const n = el('span', 'pnhud-card' + (suit === 'h' || suit === 'd' ? ' red' : ''));
    n.textContent = (RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2]) + SUIT_GLYPH[suit];
    return n;
  }

  function potOddsNeeded(snap) {
    if (snap.pot === null || snap.toCall === null || snap.toCall <= 0) return null;
    return snap.toCall / (snap.pot + snap.toCall);
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
