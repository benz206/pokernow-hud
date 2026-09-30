(function (root) {
  'use strict';

  const pct = x => (x * 100).toFixed(1) + '%';
  const chips = x => Number(x.toFixed(1));

  function potOdds(ctx) {
    if (!Number.isFinite(ctx.pot) || !Number.isFinite(ctx.toCall) || ctx.toCall <= 0
      || ctx.pot < ctx.toCall || ctx.sidePots || ctx.uncalledExcess || (Number.isFinite(ctx.stack) && ctx.toCall > ctx.stack)) return null;
    return ctx.toCall / (ctx.pot + ctx.toCall);
  }

  function sizing(pot, toCall, invested) {
    if (!Number.isFinite(pot) || pot <= 0) return null;
    const call = toCall || 0;
    return Math.round((invested || 0) + call + 0.66 * (pot + call));
  }

  function recommend(result, ctx) {
    const equity = typeof result === 'number' ? result : result.equity;
    const stderr = typeof result === 'number' ? 0 : result.stderr || 0;
    const yourTurn = !!ctx.yourTurn;
    const street = ctx.street || ({ 0: 'preflop', 3: 'flop', 4: 'turn', 5: 'river' }[(ctx.board || []).length]);
    const finalCall = street === 'river' || !!ctx.closesAction;
    const ranges = ctx.ranges || [];
    const events = ctx.events || [];
    const aggressor = events.filter(e => e.playerId !== ctx.heroId && e.street === street && /^(Bet|Raise|Wager)$/.test(e.action)).slice(-1)[0];
    const facts = [];
    if (aggressor) facts.push((aggressor.inferred ? 'From table changes: ' : '') + aggressor.text);
    else facts.push(ctx.toCall > 0 ? 'You face ' + ctx.toCall + ' to call; the bettor was not observed.'
      : ctx.canCheck ? 'You can check without paying.' : 'Waiting for a readable decision.');
    if (ctx.position) facts.push('Your position: ' + ctx.position + '.');
    if (Number.isFinite(ctx.effectiveStack)) facts.push('Effective remaining stack: ' + ctx.effectiveStack + ' chips.');
    const assumptions = ranges.map(r => r.name + ': ' + (r.text || r.error) + '. ' + r.reason);
    if (!assumptions.length) assumptions.push('Opponents have random hands; no betting range has been established.');
    if (ranges.some(r => r.continuing)) assumptions.push('Continuing ranges describe hands assumed to call our bet or raise; their frequencies are not observed.');
    const need = potOdds(ctx);
    const margin = need === null ? null : equity - need;
    const ev = need === null || !finalCall ? null : equity * (ctx.pot + ctx.toCall) - ctx.toCall;
    const caveats = [];
    if (!finalCall) caveats.push('Equity runs to the river. Calling now may not buy the remaining cards; future bets and position can change the decision.');
    if (ctx.opponents > 1) caveats.push('Multiway pot: other players can still act. Side-pot eligibility and future raises are not modeled.');
    if (ctx.partial) caveats.push('History is partial. Open Log / Ledger → Full Log to read the available action sequence.');
    if (ctx.sidePots) caveats.push('Side pots detected: a single pot price cannot represent which chips you can win.');
    if (ctx.uncalledExcess) caveats.push('The opponent committed more than your available stack. Uncalled excess may be included in the displayed pot; verify the amount you can win.');
    if (typeof result !== 'number' && result.continuing && result.continuing.error) caveats.push(result.continuing.error);
    const advice = { action: 'Review', tone: 'neutral', detail: '', yourTurn, autoEligible: false,
      equity, need, margin, ev, facts, assumptions, caveats, reasons: [], alternatives: [], lesson: '',
      rangeSummary: ranges.map(r => ({ id: r.id, name: r.name, text: r.text, reason: r.reason,
        continuing: r.continuing ? r.continuing.text : null })) };
    for (const r of ranges) if (r.origin === 'auto' && r.mode !== 'random') {
      advice.reasons.push(r.reason + ' Equity and the recommendation use ' + r.text + '; edit that assumption if your read differs.');
    }
    if (!Number.isFinite(equity) || ctx.opponents === 0) {
      advice.detail = ctx.opponents === 0 ? 'No active opponents' : 'Equity unavailable'; return advice;
    }
    if (ctx.toCall > 0) {
      if (need === null) {
        advice.detail = 'A reliable call price is unavailable';
        advice.reasons.push('Check the pot, call amount and side pots before using pot odds.');
        return advice;
      }
      advice.reasons.push('Call ' + ctx.toCall + ' into ' + ctx.pot + ': ' + ctx.toCall + ' ÷ (' + ctx.pot + ' + ' + ctx.toCall + ') = ' + pct(need) + ' required equity.');
      advice.reasons.push('Estimated equity against the displayed assumptions: ' + pct(equity)
        + (stderr ? ' (simulation uncertainty about ±' + (200 * stderr).toFixed(1) + ' percentage points).' : '.'));
      const close = Math.abs(margin) <= 2 * stderr;
      if (close) advice.reasons.push('The equity margin is within simulation uncertainty; range uncertainty can be larger.');
      if (close && ctx.autoMode !== 'full') {
        advice.detail = 'Too close for a firm recommendation';
      } else {
        advice.action = margin > 0 ? 'Call' : 'Fold';
        advice.tone = margin > 0 ? 'good' : 'bad';
        advice.detail = (finalCall ? 'under this range assumption' : 'showdown baseline; future bets matter');
        if (close) advice.detail = 'close estimate; Full Auto uses the model threshold';
      }
      advice.alternatives.push('The call changes to a fold if equity against the betting range falls below ' + pct(need) + '.');
      if (ev !== null) advice.reasons.push('Call EV under this model: ' + pct(equity) + ' of ' + (ctx.pot + ctx.toCall)
        + ' − ' + ctx.toCall + ' = ' + (ev >= 0 ? '+' : '') + chips(ev) + ' chips. No rake or further betting assumed.');
      if (street === 'river') advice.lesson = 'River bluff-catching: if you beat every bluff and lose to every value hand (no ties), their betting range must contain more than '
        + pct(need) + ' bluffs for calling to profit. Bet size alone does not tell us their bluff frequency.';
    } else if (ctx.canCheck) {
      advice.action = 'Check';
    } else {
      advice.detail = 'Waiting for legal actions and a readable call amount'; return advice;
    }
    const continuing = typeof result === 'number' ? null : result.continuing;
    let size = sizing(ctx.pot, ctx.toCall, ctx.heroBet);
    if (size !== null && Number.isFinite(ctx.raiseMin)) size = Math.max(size, ctx.raiseMin);
    const withinStack = size !== null && (!Number.isFinite(ctx.raiseMax) || size <= ctx.raiseMax)
      && (!Number.isFinite(ctx.stack) || size - (ctx.heroBet || 0) <= ctx.stack);
    if (ctx.opponents === 1 && ctx.canRaise && !ctx.sidePots && !ctx.closesAction && continuing && !continuing.error
      && continuing.equity - 2 * (continuing.stderr || 0) > .5 && withinStack) {
      advice.action = ctx.toCall > 0 ? 'Raise' : 'Bet'; advice.amount = size; advice.tone = 'good';
      advice.detail = 'value candidate against your continuing range';
      advice.reasons.push('Against the hands you assume will call, equity is ' + pct(continuing.equity)
        + '. That supports a value bet under this model; it does not prove this size is optimal.');
      advice.reasons.push('Sizing example: about two-thirds of the pot after calling, entered as a total street commitment of ' + size + '.');
      advice.alternatives.push('Prefer calling or checking if worse hands fold and the continuing range leaves you with 50% equity or less.');
    } else if (ctx.canRaise) {
      advice.alternatives.push('To assess a value bet, enter the hands you think would call in “Continues vs our raise.”');
    }
    if (!advice.lesson) advice.lesson = 'A value bet aims to be called by worse hands. A bluff aims to fold better hands; strong raw equity alone is not a reason to raise.';
    const risk = withinStack && ctx.canRaise ? size - (ctx.heroBet || 0) : null;
    if (risk) advice.alternatives.push('Pure-bluff sizing example: ' + size + ' total risks ' + risk + ' more to win ' + ctx.pot + '. With no showdown equity it needs '
      + pct(risk / (ctx.pot + risk)) + ' folds to break even. We have not measured that fold frequency.');
    if (advice.action === 'Raise' || advice.action === 'Bet') {
      advice.summary = 'The hands you assume will call leave us with ' + pct(continuing.equity)
        + ' equity. That makes ' + advice.action.toLowerCase() + ' a value candidate under your model.';
    } else if (need !== null && advice.action !== 'Review') {
      advice.summary = (aggressor ? aggressor.name + '’s action' : 'This price') + ' requires ' + pct(need)
        + ' equity. Your assumed ranges give us ' + pct(equity) + ', so the '
        + (finalCall ? 'model suggests ' : 'showdown baseline suggests ') + advice.action.toLowerCase() + '.';
    } else if (advice.action === 'Check') {
      advice.reasons = []; advice.alternatives = []; advice.lesson = '';
    }
    advice.autoEligible = yourTurn && !ctx.sidePots && (advice.action === 'Check'
      || ((ctx.autoMode === 'full' || (finalCall && ctx.opponents === 1)) && advice.action !== 'Review'));
    if (ctx.practice) advice.autoEligible = false;
    return advice;
  }

  const api = { recommend, sizing, potOdds };
  root.PokerAdvice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
