(function (root) {
  'use strict';

  const E = root.PokerEval || (typeof require !== 'undefined' ? require('./evaluator.js') : null);

  const deck = new Int8Array(52);
  const heroHand = new Int8Array(7);
  const oppHand = new Int8Array(7);
  let seed = 0x2f6e2b1 >>> 0;

  function rnd(n) {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed % n;
  }

  function outsFor(hole, board) {
    if (board.length !== 3 && board.length !== 4) return null;

    const known = new Uint8Array(52);
    for (const c of hole) known[c] = 1;
    for (const c of board) known[c] = 1;
    const unseen = [];
    for (let c = 0; c < 52; c++) if (!known[c]) unseen.push(c);

    const heroNow = [...hole, ...board];
    const heroScore = E.evaluate(heroNow, heroNow.length);

    const villains = [];
    const probe = [0, 0, ...board];
    const SAMPLES = 400;
    for (let attempt = 0; attempt < SAMPLES * 40 && villains.length < SAMPLES; attempt++) {
      const i = rnd(unseen.length);
      let j = rnd(unseen.length);
      if (i === j) continue;
      probe[0] = unseen[i];
      probe[1] = unseen[j];
      if (E.evaluate(probe, probe.length) > heroScore) villains.push([probe[0], probe[1]]);
    }
    if (villains.length < 20) return { count: 0, cards: [], ahead: true };

    const heroBuf = [...hole, ...board, 0];
    const villBuf = [0, 0, ...board, 0];
    let count = 0;
    const cards = [];

    for (const c of unseen) {
      heroBuf[heroBuf.length - 1] = c;
      villBuf[villBuf.length - 1] = c;
      const hs = E.evaluate(heroBuf, heroBuf.length);
      let wins = 0, n = 0;
      for (const v of villains) {
        if (v[0] === c || v[1] === c) continue;
        villBuf[0] = v[0];
        villBuf[1] = v[1];
        const vs = E.evaluate(villBuf, villBuf.length);
        if (hs > vs) wins++; else if (hs === vs) wins += 0.5;
        n++;
      }
      if (n > 0 && wins / n > 0.5) { count++; cards.push(E.cardToString(c)); }
    }

    return { count, cards, ahead: false };
  }

  function simulate(hole, board, opponents, iterations) {
    const nOpp = Math.max(0, opponents | 0);
    const iters = Math.max(200, iterations | 0);

    if (nOpp === 0) return { win: 1, tie: 0, lose: 0, iterations: 0 };

    const known = new Uint8Array(52);
    for (const c of hole) known[c] = 1;
    for (const c of board) known[c] = 1;

    let deckSize = 0;
    for (let c = 0; c < 52; c++) if (!known[c]) deck[deckSize++] = c;

    const needBoard = 5 - board.length;
    const draws = needBoard + nOpp * 2;
    if (draws > deckSize) return { win: 0, tie: 0, lose: 0, iterations: 0, error: 'not enough cards' };

    heroHand[0] = hole[0];
    heroHand[1] = hole[1];
    for (let i = 0; i < board.length; i++) heroHand[2 + i] = board[i];

    let win = 0, tie = 0, lose = 0;

    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < draws; i++) {
        const j = i + rnd(deckSize - i);
        const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }

      for (let i = 0; i < needBoard; i++) heroHand[2 + board.length + i] = deck[i];
      const heroScore = E.evaluate(heroHand, 7);

      let best = -1, tied = 0;
      for (let o = 0; o < nOpp; o++) {
        const base = needBoard + o * 2;
        oppHand[0] = deck[base];
        oppHand[1] = deck[base + 1];
        for (let i = 0; i < 5; i++) oppHand[2 + i] = heroHand[2 + i];
        const s = E.evaluate(oppHand, 7);
        if (s > best) { best = s; tied = 1; } else if (s === best) tied++;
      }

      if (heroScore > best) win++;
      else if (heroScore === best) tie += 1 / (tied + 1);
      else lose++;
    }

    return { win: win / iters, tie: tie / iters, lose: lose / iters, iterations: iters };
  }

  function analyze(req) {
    const hole = req.hole;
    const board = req.board || [];
    if (!hole || hole.length !== 2) return { error: 'need 2 hole cards' };
    if (board.length > 5) return { error: 'too many board cards' };

    const seen = new Set([...hole, ...board]);
    if (seen.size !== hole.length + board.length) return { error: 'duplicate cards' };

    const iterations = req.iterations || (board.length === 0 ? 12000 : board.length < 5 ? 9000 : 6000);
    const t0 = Date.now();
    const eq = simulate(hole, board, req.opponents, iterations);

    return {
      ...eq,
      handName: board.length >= 3 ? E.describe(E.evaluate([...hole, ...board], 2 + board.length)) : null,
      outs: outsFor(hole, board),
      ms: Date.now() - t0,
    };
  }

  const api = { simulate, analyze, outsFor };
  root.PokerEquity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
