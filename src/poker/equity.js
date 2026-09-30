(function (root) {
  'use strict';

  const E = root.PokerEval || (typeof require !== 'undefined' ? require('./evaluator.js') : null);
  let seed = 0x2f6e2b1 >>> 0;
  function rnd() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }

  function validate(hole, board, opponents) {
    if (!Array.isArray(hole) || hole.length !== 2) return 'need 2 hole cards';
    if (!Array.isArray(board) || ![0, 3, 4, 5].includes(board.length)) return 'incomplete board';
    if (![...hole, ...board].every(c => Number.isInteger(c) && c >= 0 && c < 52)) return 'invalid card';
    if (new Set([...hole, ...board]).size !== hole.length + board.length) return 'duplicate cards';
    if (!Number.isInteger(opponents) || opponents < 0 || opponents > 9) return 'invalid opponent count';
    return null;
  }

  function simulate(hole, board, opponents, iterations, ranges) {
    const error = validate(hole, board, opponents);
    if (error) return { error };
    if (opponents === 0) return { win: 1, tie: 0, tieShare: 0, equity: 1, lose: 0, iterations: 0, stderr: 0 };
    const iters = Math.max(200, Math.min(100000, iterations || 9000));
    const known = new Set([...hole, ...board]);
    const prepared = [];
    for (let o = 0; o < opponents; o++) {
      if (!ranges || ranges[o] == null) { prepared.push(null); continue; }
      let total = 0;
      const combos = [];
      for (const item of ranges[o]) {
        const c = item.cards;
        if (!c || c.length !== 2 || c[0] === c[1] || !c.every(x => Number.isInteger(x) && x >= 0 && x < 52)
          || !Number.isFinite(item.weight) || item.weight <= 0) return { error: 'invalid range combination' };
        if (c.some(x => known.has(x))) continue;
        total += item.weight;
        combos.push({ cards: c, cumulative: total });
      }
      if (!combos.length) return { error: 'An assumed range has no combinations after card blockers' };
      prepared.push({ combos, total });
    }
    const deck = new Int8Array(52), used = new Uint8Array(52);
    const hands = Array.from({ length: opponents }, () => new Int8Array(7));
    const hero = new Int8Array(7);
    hero.set(hole); hero.set(board, 2);
    let win = 0, tie = 0, tieShare = 0, lose = 0, squares = 0, completed = 0;
    // Reject the whole joint sample on collisions, preserving relative range weights.
    for (let attempt = 0; completed < iters && attempt < iters * 100; attempt++) {
      used.fill(0); for (const c of known) used[c] = 1;
      let conflict = false;
      for (let o = 0; o < opponents; o++) {
        const range = prepared[o];
        if (!range) continue;
        const pick = rnd() * range.total;
        let lo = 0, hi = range.combos.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (pick < range.combos[mid].cumulative) hi = mid; else lo = mid + 1; }
        const c = range.combos[lo].cards;
        if (used[c[0]] || used[c[1]]) { conflict = true; break; }
        hands[o][0] = c[0]; hands[o][1] = c[1]; used[c[0]] = used[c[1]] = 1;
      }
      if (conflict) continue;
      let size = 0;
      for (let c = 0; c < 52; c++) if (!used[c]) deck[size++] = c;
      let cursor = 0;
      function draw() {
        const j = cursor + Math.floor(rnd() * (size - cursor));
        const c = deck[j]; deck[j] = deck[cursor]; deck[cursor++] = c; return c;
      }
      for (let o = 0; o < opponents; o++) if (!prepared[o]) { hands[o][0] = draw(); hands[o][1] = draw(); }
      for (let i = board.length; i < 5; i++) hero[2 + i] = draw();
      const score = E.evaluate(hero, 7);
      let best = -1, tied = 0;
      for (const hand of hands) {
        for (let i = 2; i < 7; i++) hand[i] = hero[i];
        const s = E.evaluate(hand, 7);
        if (s > best) { best = s; tied = 1; } else if (s === best) tied++;
      }
      let share = 0;
      if (score > best) { win++; share = 1; }
      else if (score === best) { tie++; share = 1 / (tied + 1); tieShare += share; }
      else lose++;
      squares += share * share; completed++;
    }
    if (completed < iters) return { error: 'Assumed ranges conflict or overlap too much to sample reliably' };
    const equity = (win + tieShare) / iters;
    return { win: win / iters, tie: tie / iters, tieShare: tieShare / iters, equity,
      lose: lose / iters, iterations: iters, stderr: Math.sqrt(Math.max(0, squares / iters - equity * equity) / iters) };
  }

  function drawsFor(hole, board) {
    if (board.length !== 3 && board.length !== 4) return null;
    const all = [...hole, ...board], known = new Set(all);
    const now = E.categoryOf(E.evaluate(all));
    const flush = [], straight = [];
    for (let c = 0; c < 52; c++) {
      if (known.has(c)) continue;
      const next = [...all, c], score = E.evaluate(next), cat = E.categoryOf(score);
      // A draw shared entirely by the board is not a private improvement.
      if (board.length === 4 && E.evaluate([...board, c]) === score) continue;
      if (now < 5 && (cat === 5 || cat === 8)) flush.push(c);
      if (now < 4 && (cat === 4 || cat === 8)) straight.push(c);
    }
    const cards = [...new Set([...flush, ...straight])].sort((a, b) => a - b);
    const n = 52 - known.size, count = cards.length;
    return { count, cards: cards.map(E.cardToString), flush: flush.map(E.cardToString), straight: straight.map(E.cardToString),
      nextCard: count / n, byRiver: board.length === 3 ? 1 - (n - count) * (n - count - 1) / (n * (n - 1)) : count / n,
      note: 'Completion cards, not guaranteed winning outs. Opponents may hold these cards, have a stronger hand, or improve later.' };
  }

  function analyze(req) {
    const hole = req.hole, board = req.board || [];
    const error = validate(hole, board, req.opponents);
    if (error) return { error };
    const t0 = Date.now();
    const iterations = req.iterations || (board.length === 0 ? 12000 : board.length < 5 ? 9000 : 6000);
    const eq = simulate(hole, board, req.opponents, iterations, req.ranges);
    if (eq.error) return eq;
    let continuing = null;
    if (req.opponents === 1 && req.continuing !== undefined) continuing = simulate(hole, board, 1, iterations, [req.continuing]);
    return { ...eq, continuing, handName: board.length >= 3 ? E.describe(E.evaluate([...hole, ...board])) : null,
      draws: drawsFor(hole, board), ms: Date.now() - t0 };
  }

  const api = { simulate, analyze, drawsFor };
  root.PokerEquity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
