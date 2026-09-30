(function (root) {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';
  // Starting points for lessons, not solved ranges or claims about a player.
  const PRESETS = {
    early: '77+,ATs+,KQs,AQo+',
    late: '22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,ATo+,KJo+,QJo',
    open: '55+,A9s+,KTs+,QTs+,JTs,ATo+,KQo',
    reraise: 'TT+,AQs+,AKo',
  };

  function parse(text) {
    if (!String(text || '').trim() || /^random$/i.test(text.trim())) return { combos: null, text: 'Random hands' };
    const out = new Map();
    function add(a, b, weight) {
      if (a === b) throw new Error('A hand cannot contain the same card twice');
      const cards = [a, b].sort((x, y) => x - y);
      out.set(cards.join(','), { cards, weight });
    }
    for (const token of text.trim().split(/[\s,]+/)) {
      const parts = token.split(':');
      const hand = parts[0];
      const weight = parts.length === 1 ? 1 : Number(parts[1]);
      if (parts.length > 2 || !Number.isFinite(weight) || weight <= 0 || weight > 1) {
        throw new Error('Weights must be greater than 0 and at most 1: ' + token);
      }
      const exact = hand.match(/^([2-9TJQKA])([cdhs])([2-9TJQKA])([cdhs])$/i);
      if (exact) {
        add(RANKS.indexOf(exact[1].toUpperCase()) * 4 + SUITS.indexOf(exact[2].toLowerCase()),
          RANKS.indexOf(exact[3].toUpperCase()) * 4 + SUITS.indexOf(exact[4].toLowerCase()), weight);
        continue;
      }
      const m = hand.match(/^([2-9TJQKA])([2-9TJQKA])([so])?(\+)?$/i);
      if (!m) throw new Error('Use hands such as QQ+, AJs, AKo or AsKd:0.5: ' + token);
      const a = RANKS.indexOf(m[1].toUpperCase()), b = RANKS.indexOf(m[2].toUpperCase());
      const suited = (m[3] || '').toLowerCase();
      if (a < b || (a === b && suited)) throw new Error('Write the higher rank first; pairs have no suit suffix: ' + token);
      const pairs = [];
      if (a === b) { for (let r = a; r <= (m[4] ? 12 : a); r++) pairs.push([r, r]); }
      else { for (let r = b; r <= (m[4] ? a - 1 : b); r++) pairs.push([a, r]); }
      for (const [hi, lo] of pairs) for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) {
        if (hi === lo && t <= s) continue;
        if (suited === 's' && s !== t) continue;
        if (suited === 'o' && s === t) continue;
        add(hi * 4 + s, lo * 4 + t, weight);
      }
    }
    return { combos: [...out.values()], text: text.trim() };
  }

  function forPlayers(snap, hand, choices) {
    const events = hand ? hand.events : [];
    const preflop = events.filter(e => e.street === 'preflop' && /^(Bet|Raise)$/.test(e.action));
    return (snap.players || []).filter(p => !p.hero && p.inHand && !p.folded).map(p => {
      const choice = (choices || {})[p.id] || { mode: 'auto' };
      let mode = choice.mode || 'auto';
      let reason = 'No observed preflop raise by this player; using random hands.';
      if (mode === 'auto') {
        const raise = preflop.map(e => e.playerId).lastIndexOf(p.id);
        mode = raise < 0 ? 'random' : raise > 0 ? 'reraise'
          : /^(BTN|CO|SB)$/.test(p.position || '') ? 'late'
            : /^UTG/.test(p.position || '') ? 'early' : 'open';
        if (raise >= 0) reason = p.name + (raise > 0 ? ' re-raised' : ' opened the betting')
          + ' preflop' + (p.position ? ' from ' + p.position : '') + '; this is an assumed starting range.';
      } else reason = 'Range selected by you; it is an assumption, not an observed hand.';
      const text = mode === 'custom' ? choice.text : (PRESETS[mode] || 'random');
      try {
        if (mode === 'custom' && !String(text || '').trim()) throw new Error('Enter a custom range');
        const parsed = parse(text);
        const continuing = choice.continuing && choice.continuing.trim() ? parse(choice.continuing) : null;
        if (parsed.combos && continuing) {
          const allowed = new Set(parsed.combos.map(c => c.cards.join(',')));
          if (!continuing.combos || continuing.combos.some(c => !allowed.has(c.cards.join(',')))) {
            throw new Error('The continuing range must be a subset of the assumed range');
          }
        }
        return { id: p.id, name: p.name, mode, origin: choice.mode || 'auto', reason, ...parsed, continuing };
      } catch (err) { return { id: p.id, name: p.name, mode, reason, error: err.message }; }
    });
  }

  const api = { parse, PRESETS, forPlayers };
  root.PokerRanges = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
