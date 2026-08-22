(function (root) {
  'use strict';

  const pct = (x) => (x * 100).toFixed(0) + '%';

  // Raise/bet to two-thirds of the pot as it would stand after calling.
  function sizing(pot, toCall) {
    if (pot === null || pot === undefined || pot <= 0) return null;
    const call = toCall || 0;
    return Math.round(call + 0.66 * (pot + call));
  }

  function recommend(equity, ctx) {
    const pot = ctx.pot;
    const toCall = ctx.toCall;
    const facingBet = toCall !== null && toCall !== undefined && toCall > 0;
    const yourTurn = ctx.yourTurn !== undefined
      ? !!ctx.yourTurn
      : !!(ctx.canCheck || ctx.canCall || ctx.canRaise);

    if (facingBet && pot !== null && pot !== undefined) {
      // You cannot be facing a bet into a pot of nothing: whatever was wagered is
      // already in there. Floor the pot at the bet so a low reading cannot produce
      // a nonsensical "you need 100% equity".
      const effectivePot = Math.max(pot, toCall);
      const need = toCall / (effectivePot + toCall);
      const edge = equity - need;
      if (edge < -0.02) {
        return { action: 'Fold', tone: 'bad', detail: 'need ' + pct(need) + ', have ' + pct(equity), yourTurn };
      }
      if (edge < 0.03) {
        return { action: 'Call', tone: 'neutral', detail: 'marginal, ' + pct(need) + ' needed', yourTurn };
      }
      if (equity >= 0.68 && ctx.canRaise) {
        return { action: 'Raise', tone: 'good', detail: 'for value', amount: sizing(pot, toCall), yourTurn };
      }
      return { action: 'Call', tone: 'good', detail: '+' + pct(edge) + ' over pot odds', yourTurn };
    }

    if (facingBet) {
      if (equity >= 0.6) return { action: 'Call', tone: 'good', detail: 'pot size unknown', yourTurn };
      if (equity >= 0.35) return { action: 'Call', tone: 'neutral', detail: 'pot size unknown', yourTurn };
      return { action: 'Fold', tone: 'bad', detail: 'pot size unknown', yourTurn };
    }

    if (equity >= 0.68 && ctx.canRaise) {
      return { action: 'Bet', tone: 'good', detail: 'for value', amount: sizing(pot, 0), yourTurn };
    }
    if (equity >= 0.45) return { action: 'Check', tone: 'neutral', detail: 'ahead of the field', yourTurn };
    return { action: 'Check', tone: 'neutral', detail: 'fold to a bet', yourTurn };
  }

  const api = { recommend, sizing };
  root.PokerAdvice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
