(function (root) {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';

  const CATEGORY_NAMES = [
    'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
    'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
  ];

  function makeCard(rank, suit) {
    return (rank << 2) | suit;
  }

  function cardFromString(str) {
    const s = String(str).trim();
    if (s.length < 2) return -1;
    const r = RANKS.indexOf(s.slice(0, -1).toUpperCase().replace('10', 'T'));
    const u = SUITS.indexOf(s.slice(-1).toLowerCase());
    if (r < 0 || u < 0) return -1;
    return makeCard(r, u);
  }

  function cardToString(card) {
    return RANKS[card >> 2] + SUITS[card & 3];
  }

  const WHEEL = (1 << 12) | 0b1111;

  function straightHigh(mask) {
    for (let h = 12; h >= 4; h--) {
      if (((mask >> (h - 4)) & 0b11111) === 0b11111) return h;
    }
    return (mask & WHEEL) === WHEEL ? 3 : -1;
  }

  function pack(category, ranks) {
    let v = category;
    for (let i = 0; i < 5; i++) v = v * 16 + (ranks[i] > 0 ? ranks[i] : 0);
    return v;
  }

  const rankCount = new Int8Array(13);
  const suitCount = new Int8Array(4);
  const suitMask = new Int16Array(4);

  function evaluate(cards, count) {
    const n = count === undefined ? cards.length : count;
    rankCount.fill(0);
    suitCount.fill(0);
    suitMask.fill(0);
    let rankMask = 0;

    for (let i = 0; i < n; i++) {
      const c = cards[i];
      const r = c >> 2;
      const s = c & 3;
      rankCount[r]++;
      suitCount[s]++;
      suitMask[s] |= 1 << r;
      rankMask |= 1 << r;
    }

    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;

    if (flushSuit >= 0) {
      const fm = suitMask[flushSuit];
      const sf = straightHigh(fm);
      if (sf >= 0) return pack(8, [sf, 0, 0, 0, 0]);
      const rs = [];
      for (let r = 12; r >= 0 && rs.length < 5; r--) if (fm & (1 << r)) rs.push(r);
      return pack(5, rs);
    }

    let quad = -1, trip1 = -1, trip2 = -1, pair1 = -1, pair2 = -1;
    for (let r = 12; r >= 0; r--) {
      const c = rankCount[r];
      if (c === 4) { if (quad < 0) quad = r; }
      else if (c === 3) { if (trip1 < 0) trip1 = r; else if (trip2 < 0) trip2 = r; }
      else if (c === 2) { if (pair1 < 0) pair1 = r; else if (pair2 < 0) pair2 = r; }
    }

    if (quad >= 0) {
      let k = -1;
      for (let r = 12; r >= 0; r--) if (r !== quad && rankCount[r] > 0) { k = r; break; }
      return pack(7, [quad, k, 0, 0, 0]);
    }

    if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
      const p = trip2 > pair1 ? trip2 : pair1;
      return pack(6, [trip1, p, 0, 0, 0]);
    }

    const st = straightHigh(rankMask);
    if (st >= 0) return pack(4, [st, 0, 0, 0, 0]);

    if (trip1 >= 0) {
      const ks = [];
      for (let r = 12; r >= 0 && ks.length < 2; r--) if (r !== trip1 && rankCount[r] > 0) ks.push(r);
      return pack(3, [trip1, ks[0], ks[1], 0, 0]);
    }

    if (pair2 >= 0) {
      let k = -1;
      for (let r = 12; r >= 0; r--) if (r !== pair1 && r !== pair2 && rankCount[r] > 0) { k = r; break; }
      return pack(2, [pair1, pair2, k, 0, 0]);
    }

    if (pair1 >= 0) {
      const ks = [];
      for (let r = 12; r >= 0 && ks.length < 3; r--) if (r !== pair1 && rankCount[r] > 0) ks.push(r);
      return pack(1, [pair1, ks[0], ks[1], ks[2], 0]);
    }

    const ks = [];
    for (let r = 12; r >= 0 && ks.length < 5; r--) if (rankCount[r] > 0) ks.push(r);
    return pack(0, ks);
  }

  function categoryOf(score) {
    return Math.floor(score / 1048576);
  }

  function describe(score) {
    const cat = categoryOf(score);
    const top = Math.floor(score / 65536) % 16;
    const second = Math.floor(score / 4096) % 16;
    const name = (r) => RANKS[r];
    switch (cat) {
      case 8: return top === 12 ? 'Royal Flush' : name(top) + '-high Straight Flush';
      case 7: return 'Quad ' + name(top) + 's';
      case 6: return name(top) + 's full of ' + name(second) + 's';
      case 5: return name(top) + '-high Flush';
      case 4: return name(top) + '-high Straight';
      case 3: return 'Trip ' + name(top) + 's';
      case 2: return 'Two Pair, ' + name(top) + 's & ' + name(second) + 's';
      case 1: return 'Pair of ' + name(top) + 's';
      default: return name(top) + '-high';
    }
  }

  const api = {
    RANKS, SUITS, CATEGORY_NAMES,
    makeCard, cardFromString, cardToString,
    evaluate, categoryOf, describe,
  };

  root.PokerEval = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
