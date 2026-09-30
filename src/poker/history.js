(function (root) {
  'use strict';

  const copy = value => JSON.parse(JSON.stringify(value));
  const sameCards = (a, b) => a.length === b.length && a.every(c => b.includes(c));
  const amount = text => Number(text.replace(/,/g, ''));
  function cardsIn(text) {
    const ranks = '23456789TJQKA', suits = 'cdhs', glyphs = '♣♦♥♠';
    return [...text.matchAll(/(10|[2-9TJQKA])([♣♦♥♠cdhs])/gi)].map(m =>
      ranks.indexOf(m[1].toUpperCase().replace('10', 'T')) * 4 + (suits.includes(m[2].toLowerCase()) ? suits.indexOf(m[2].toLowerCase()) : glyphs.indexOf(m[2])));
  }

  function parseLog(entries) {
    let hand = null, street = 'preflop';
    for (const row of entries || []) {
      const text = row.text;
      const start = text.match(/starting hand #(\d+)/i);
      if (start) { hand = { number: Number(start[1]), hole: [], events: [], stacks: [], complete: false }; street = 'preflop'; continue; }
      if (!hand) continue;
      if (/^Your hand is /i.test(text)) { hand.hole = cardsIn(text); continue; }
      if (/^Player stacks:/i.test(text)) {
        const values = [...text.matchAll(/#\d+\s+.*?\(([\d,.]+)\)/g)];
        hand.stacks = (row.people || []).map((p, i) => ({ ...p, stack: values[i] ? amount(values[i][1]) : null }));
        continue;
      }
      const dealt = text.match(/^(Flop|Turn|River):/i);
      if (dealt) {
        street = dealt[1].toLowerCase();
        hand.events.push({ street, action: 'Deal', board: cardsIn(text), text, source: 'log', at: row.at }); continue;
      }
      if (/ending hand|end of hand/i.test(text)) hand.complete = true;
      const player = (row.people || [])[0];
      if (!player || !text.startsWith(player.name)) continue;
      const tail = text.slice(player.name.length).trim();
      let action = null, chips = null;
      const wager = tail.match(/^(bets|raises to|calls|posts a small blind of|posts a big blind of|posts an ante of)\s+([\d,.]+)/i);
      if (wager) {
        action = /^bets/i.test(wager[1]) ? 'Bet' : /^raises/i.test(wager[1]) ? 'Raise'
          : /^calls/i.test(wager[1]) ? 'Call' : /small blind/i.test(wager[1]) ? 'SB'
            : /big blind/i.test(wager[1]) ? 'BB' : 'Ante';
        chips = amount(wager[2]);
      } else if (/^checks\b/i.test(tail)) action = 'Check';
      else if (/^folds\b/i.test(tail)) action = 'Fold';
      else if (/^collected\b/i.test(tail)) action = 'Collect';
      else if (/^shows\b/i.test(tail)) action = 'Show';
      if (action) hand.events.push({ playerId: player.id, name: player.name, action, amount: chips,
        allIn: /all in/i.test(tail), street, text, source: 'log', at: row.at });
    }
    if (hand) hand.events.forEach((e, i) => { e.id = 'log:' + hand.number + ':' + i; });
    return hand;
  }

  function create(saved) {
    const hands = Array.isArray(saved) ? copy(saved).slice(0, 50) : [];
    let current = null, previous = null, sequence = 0, revision = 0;
    function add(event) {
      current.events.push({ id: 'observed:' + (++sequence), ...event });
      revision++;
    }
    function observe(snap) {
      const log = parseLog(snap.log);
      const matchesLog = log && log.hole.length === 2 && sameCards(log.hole, snap.hole);
      const usableLog = matchesLog && (!current || current.number == null || log.number >= current.number) ? log : null;
      if (snap.hole.length !== 2) {
        if (current && !current.ended) { current.ended = true; revision++; }
        previous = copy(snap); return current;
      }
      const newHand = !current || current.ended || !sameCards(current.hole, snap.hole)
        || (previous && previous.board.length > snap.board.length && snap.board.length === 0)
        || (previous && previous.folded && !snap.folded && snap.board.length === 0)
        || (previous && previous.dealer !== snap.dealer && snap.board.length === 0)
        || (usableLog && current.number != null && usableLog.number > current.number);
      if (newHand) {
        if (current) current.ended = true;
        const resumable = !current && hands[0] && !hands[0].ended && sameCards(hands[0].hole, snap.hole)
          && (!usableLog || hands[0].number === usableLog.number);
        current = resumable ? hands[0] : { id: Date.now() + ':' + (++sequence), number: null, hole: snap.hole.slice(),
          board: snap.board.slice(), players: copy(snap.players || []), events: [], decisions: [],
          partial: true, ended: false, startedAt: new Date().toISOString() };
        if (!resumable) hands.unshift(current);
        hands.splice(50); previous = null; revision++;
      }
      if (usableLog && !usableLog.complete) {
        current.number = usableLog.number;
        current.partial = false;
        for (const stack of usableLog.stacks) {
          const p = current.players.find(p => p.id === stack.id);
          if (p) p.startingStack = stack.stack;
        }
      }
      if (usableLog && (current.number === usableLog.number || current.number == null)) {
        current.number = usableLog.number;
        for (const event of usableLog.events) {
          if (current.events.some(e => e.id === event.id)) continue;
          const inferred = current.events.findIndex(e => e.source !== 'log' && e.street === event.street
            && e.playerId === event.playerId && (e.action === event.action || e.action === 'Wager')
            && (e.amount === event.amount || event.action === 'Call'));
          if (inferred >= 0) current.events.splice(inferred, 1);
          current.events.push(copy(event)); revision++;
          const decision = current.decisions.find(d => d.kind !== 'practice' && !d.confirmed
            && d.snapshot.heroId === event.playerId && d.snapshot.street === event.street
            && (d.action === event.action || (d.action === 'All-in' && event.allIn)));
          if (decision) { decision.confirmed = true; revision++; }
        }
        if (usableLog.complete && !current.finished) { current.finished = true; revision++; }
      }
      if (previous) {
        if (!sameCards(previous.board, snap.board) && !current.events.some(e => e.action === 'Deal' && e.street === snap.street)) {
          add({ action: 'Deal', street: snap.street, board: snap.board.slice(), source: 'table', text: snap.street + ' dealt' });
        }
        if (previous.street === snap.street) {
          const changes = (snap.players || []).filter(p => {
            const old = previous.players.find(o => o.id === p.id);
            return old && p.bet > old.bet;
          });
          const maxBet = Math.max(0, ...previous.players.map(p => p.bet || 0));
          for (const p of snap.players || []) {
            const old = previous.players.find(o => o.id === p.id);
            if (!old) continue;
            let action = null;
            if (p.folded && !old.folded) action = 'Fold';
            else if (changes.includes(p)) action = changes.length > 1 ? 'Wager' : p.bet > maxBet ? (maxBet > 0 ? 'Raise' : 'Bet') : 'Call';
            else if (/^check\b/i.test(p.status) && p.status !== old.status) action = 'Check';
            if (!action) continue;
            if (usableLog && usableLog.events.some(e => e.playerId === p.id && e.street === snap.street && e.action === action && (e.amount === p.bet || action === 'Fold' || action === 'Check' || action === 'Call'))) continue;
            add({ playerId: p.id, name: p.name, action, amount: action === 'Fold' || action === 'Check' ? null : p.bet,
              street: snap.street, source: 'table', inferred: /^(Bet|Raise|Call|Wager)$/.test(action),
              text: p.name + (action === 'Wager' ? ' now has ' + p.bet + ' committed; action order unknown'
                : ' ' + action.toLowerCase() + (p.bet && !/^(Fold|Check)$/.test(action) ? ' (street total ' + p.bet + ')' : '')) });
            const decision = current.decisions.find(d => d.kind !== 'practice' && !d.confirmed && d.snapshot.heroId === p.id
              && d.snapshot.street === snap.street && (d.action === action || action === 'Wager'
                || (d.action === 'All-in' && p.bet > old.bet && (p.allIn || p.stack === 0))));
            if (decision) decision.confirmed = true;
          }
        }
      }
      current.board = snap.board.slice();
      current.players = (snap.players || []).map(p => ({ ...p, startingStack: (current.players.find(o => o.id === p.id) || {}).startingStack }));
      const streets = ['preflop', 'flop', 'turn', 'river'];
      current.events.sort((a, b) => streets.indexOf(a.street) - streets.indexOf(b.street)
        || (a.source === 'log' && b.source !== 'log' ? -1 : a.source !== 'log' && b.source === 'log' ? 1 : 0)
        || Number(a.id.split(':').pop()) - Number(b.id.split(':').pop()));
      current.events = current.events.slice(-200);
      previous = copy(snap);
      return current;
    }
    function record(snap, advice, action, options) {
      if (!current) observe(snap);
      if (!current) return null;
      const entry = { id: Date.now() + ':' + (++sequence), at: new Date().toISOString(), action,
        kind: options.kind, amount: options.amount == null ? null : options.amount, confirmed: false,
        snapshot: copy({ hole: snap.hole, board: snap.board, pot: snap.pot, toCall: snap.toCall, street: snap.street,
          heroId: snap.heroId, position: snap.position, stack: snap.stack, effectiveStack: snap.effectiveStack,
          players: snap.players, events: current.events }), advice: copy(advice) };
      current.decisions.push(entry); current.decisions = current.decisions.slice(-50); revision++;
      let retained = 0;
      for (const hand of hands) {
        const keep = Math.max(0, 200 - retained);
        if (hand.decisions.length > keep) hand.decisions = keep ? hand.decisions.slice(-keep) : [];
        retained += hand.decisions.length;
      }
      // Preserve frozen decision context without exceeding Chrome's local quota.
      const bytes = () => new Blob([JSON.stringify(hands)]).size;
      while (hands.length > 1 && bytes() > 4 * 1024 * 1024) hands.pop();
      while (current.decisions.length > 1 && bytes() > 4 * 1024 * 1024) current.decisions.shift();
      return entry;
    }
    return { observe, record, get current() { return current; }, get hands() { return hands; }, get revision() { return revision; } };
  }

  const api = { create, parseLog };
  root.PNHistory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
