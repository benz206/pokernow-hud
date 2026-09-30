(function (root) {
  'use strict';

  const SUIT_MAP = {
    '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c',
    '♤': 's', '♡': 'h', '♢': 'd', '♧': 'c',
    S: 's', H: 'h', D: 'd', C: 'c',
    s: 's', h: 'h', d: 'd', c: 'c',
  };

  const SUIT_WORDS = { spade: 's', heart: 'h', diamond: 'd', club: 'c' };

  const VALUE_MAP = {
    A: 'A', K: 'K', Q: 'Q', J: 'J', T: 'T', 10: 'T',
    9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
  };

  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';

  function toCard(valueText, suitText) {
    const v = VALUE_MAP[String(valueText || '').trim().toUpperCase()];
    const s = SUIT_MAP[String(suitText || '').trim()];
    if (!v || !s) return -1;
    return (RANKS.indexOf(v) << 2) | SUITS.indexOf(s);
  }

  function attrBlob(el) {
    const cls = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
    let out = String(cls || '');
    for (const a of el.attributes || []) {
      if (a.name.indexOf('data-') === 0) out += ' ' + a.name + '=' + a.value;
    }
    return out;
  }

  function suitFrom(el) {
    if (!el) return null;
    for (const ch of String(el.textContent || '').trim()) if (SUIT_MAP[ch]) return SUIT_MAP[ch];
    const blob = attrBlob(el).toLowerCase();
    for (const word in SUIT_WORDS) if (blob.indexOf(word) >= 0) return SUIT_WORDS[word];
    const m = blob.match(/suit[-_=]?"?([shdc])\b/);
    return m ? m[1] : null;
  }

  function valueFrom(el) {
    if (!el) return null;
    const t = String(el.textContent || '').trim().toUpperCase();
    if (VALUE_MAP[t]) return VALUE_MAP[t];
    const m = attrBlob(el).toUpperCase().match(/(?:VALUE|RANK)[-_=]?"?(10|[AKQJT2-9])\b/);
    return m ? VALUE_MAP[m[1]] : null;
  }

  // A card is readable only if a rank AND a suit can actually be extracted.
  // Face-down cards carry neither, so they fall out naturally -- never trust a
  // class name like "flipped" to mean face-down, it often means face-up.
  function readCardEl(el) {
    const blob = attrBlob(el);
    let m = blob.match(/\bcard[-_=]?"?(10|[AKQJT2-9])([shdc])\b/i);
    if (m) {
      const c = toCard(m[1], m[2].toLowerCase());
      if (c >= 0) return c;
    }

    const v = valueFrom(el.querySelector('.value, [class*="value"], [class*="rank"]')) || valueFrom(el);
    const u = suitFrom(el.querySelector('.suit, [class*="suit"]')) || suitFrom(el);
    if (v && u) {
      const c = toCard(v, u);
      if (c >= 0) return c;
    }

    const text = String(el.textContent || '').replace(/\s+/g, '');
    m = text.match(/^(10|[AKQJT98765432])([\u2660\u2665\u2666\u2663\u2664\u2661\u2662\u2667])$/i);
    if (m) return toCard(m[1], m[2]);
    return -1;
  }

  function cardEls(scope) {
    return Array.from(scope.querySelectorAll('.card, [class*="card-"], [class*="Card"]'))
      .filter((el) => !el.closest('.pnhud, .log-modal'))
      .filter((el) => !el.querySelector('.card, [class*="card-"], [class*="Card"]'));
  }

  function readCards(scope) {
    const out = [];
    for (const el of cardEls(scope)) {
      const c = readCardEl(el);
      if (c >= 0 && !out.includes(c)) out.push(c);
    }
    return out;
  }

  function firstMatch(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  const HERO_SELECTORS = [
    '.table-player.you-player',
    '.you-player',
    '[class*="you-player"]',
    '.table-player.current-player',
  ];

  const BOARD_SELECTORS = [
    '.table-cards',
    '.community-cards',
    '[class*="table-cards"]',
    '[class*="community"]',
    '.board',
  ];

  const SEAT_SELECTORS = ['.table-player', '[class*="table-player-"]'];

  function heroCards() {
    const hero = firstMatch(HERO_SELECTORS);
    if (!hero) return [];
    return readCards(hero).slice(0, 2);
  }

  function boardCards() {
    const board = firstMatch(BOARD_SELECTORS);
    if (board) {
      const cards = readCards(board);
      if (cards.length) return cards.slice(0, 5);
    }
    const seats = document.querySelectorAll(SEAT_SELECTORS[0]);
    const inSeat = (el) => Array.from(seats).some((s) => s.contains(el));
    const out = [];
    for (const el of cardEls(document.body)) {
      if (inSeat(el)) continue;
      const c = readCardEl(el);
      if (c >= 0 && !out.includes(c)) out.push(c);
    }
    return out.slice(0, 5);
  }

  function seats() {
    for (const sel of SEAT_SELECTORS) {
      const found = document.querySelectorAll(sel);
      if (found.length) return Array.from(found);
    }
    return [];
  }

  function isFolded(seat) {
    const cls = String(seat.className || '');
    if (/\bfold|folded|sitting-out|away|offline/i.test(cls)) return true;
    const status = seat.querySelector('[class*="status"]');
    if (status && /fold|sitting out|away/i.test(status.textContent || '')) return true;
    return false;
  }

  function heroFolded() {
    const hero = firstMatch(HERO_SELECTORS);
    if (!hero) return false;
    if (isFolded(hero)) return true;
    for (const el of hero.querySelectorAll('[class]')) {
      const raw = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
      if (/\bfolded?\b/i.test(String(raw || ''))) return true;
    }
    return false;
  }

  function opponentCount() {
    const hero = firstMatch(HERO_SELECTORS);
    const all = seats();
    if (!all.length) return null;
    let n = 0;
    for (const seat of all) {
      if (hero && (seat === hero || seat.contains(hero) || hero.contains(seat))) continue;
      if (isFolded(seat)) continue;
      if (cardEls(seat).length < 2) continue;
      n++;
    }
    return n;
  }

  function parseAmount(text) {
    const m = String(text || '').replace(/[,\s]/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function numbersInText(text) {
    const out = [];
    const re = /\d[\d,]*(\.\d+)?/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const v = parseFloat(m[0].replace(/,/g, ''));
      if (!isNaN(v)) out.push(v);
    }
    return out;
  }

  // Per-element, never from a container's textContent: adjacent values concatenate
  // there, so a main value of 100 beside an add-on of 40 would read as 40100.
  function numbersInTree(root) {
    const out = [];
    (function walk(node) {
      if (!node.children || node.children.length === 0) {
        out.push.apply(out, numbersInText(node.textContent));
        return;
      }
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out.push.apply(out, numbersInText(child.textContent));
      }
      for (const child of node.children) walk(child);
    })(root);
    return out;
  }

  // Sum the whole pot container rather than reading one value element: PokerNow
  // renders a main value plus an "add-on" for the current street's chips, and side
  // pots appear as further values. Reading only .main-value under-reports the pot.
  const POT_CONTAINER_SELECTORS = [
    '.table-pot-size',
    '[class*="pot-size"]',
    '[class*="total-pot"]',
    '[class*="main-pot"]',
    '[class*="pot"]',
  ];

  const BET_SELECTORS = [
    '[class*="bet-value"]',
    '[class*="player-bet"]',
    '[class*="bet-chips"]',
    '[class*="table-player-bet"]',
  ];

  function sumBets() {
    for (const sel of BET_SELECTORS) {
      let sum = 0;
      let found = false;
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('.pnhud')) continue;
        const nums = numbersInTree(el);
        if (nums.length) { sum += nums[0]; found = true; }
      }
      if (found) return { value: sum, source: 'sum of ' + sel };
    }
    return { value: null, source: null };
  }

  // value may legitimately be 0 (an empty pot); null means genuinely not found.
  function potDetail() {
    for (const sel of POT_CONTAINER_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('.pnhud')) continue;
        const total = el.querySelector('.add-on');
        const totalLabel = total && total.querySelector('small');
        if (total && /\btotal\b/i.test(totalLabel ? totalLabel.textContent : total.textContent)) {
          const nums = numbersInTree(total);
          if (nums.length) return { value: nums[nums.length - 1], source: 'labelled total' };
        }
        const nums = numbersInTree(el);
        if (!nums.length) continue;
        const sum = nums.reduce((a, b) => a + b, 0);
        if (sum > 0) return { value: sum, source: sel };
        // Container says zero -- the chips may still be sitting in front of players.
        const bets = sumBets();
        if (bets.value) return { value: bets.value, source: bets.source + ' (pot read 0)' };
        return { value: 0, source: sel };
      }
    }
    return sumBets();
  }

  function pot() {
    return potDetail().value;
  }

  // Pre-action controls ("Fold", "Check/Fold", "Call Any") are on screen while you
  // are still waiting. Treating them as live buttons is what makes a bot fold before
  // the action reaches it.
  const PRE_ACTION = /pre-?action|pre-?decision|pre-?select|pre-?bet|auto-?action|advance|queue/i;

  function inPreActionArea(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const raw = node.className && node.className.baseVal !== undefined
        ? node.className.baseVal : node.className;
      if (PRE_ACTION.test(String(raw || ''))) return true;
    }
    return false;
  }

  function looksDisabled(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    const raw = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
    return /\b(disabled|inactive|is-disabled|not-allowed)\b/i.test(String(raw || ''));
  }

  function isHidden(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return true;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    return false;
  }

  // A compound label ("Check/Fold") or a blanket one ("Call Any") is a standing
  // instruction, not the action for this decision.
  function classifyAction(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || t.indexOf('/') >= 0 || /\bany\b/i.test(t)) return null;
    if (/^fold$/i.test(t)) return 'fold';
    if (/^check$/i.test(t)) return 'check';
    if (/^call\b/i.test(t)) return 'call';
    if (/^all[-\s]?in\b/i.test(t)) return 'allin';
    if (/^(raise|bet)\b/i.test(t)) return 'raise';
    return null;
  }

  function actionButtons() {
    const out = { fold: null, check: null, call: null, raise: null, allin: null };
    for (const b of document.querySelectorAll('button, [class*="action-button"], [role="button"]')) {
      if (b.closest('.pnhud, .log-modal') || looksDisabled(b) || isHidden(b) || inPreActionArea(b)) continue;
      const kind = classifyAction(b.textContent);
      if (kind && !out[kind]) out[kind] = b;
    }
    return out;
  }

  const TURN_MARKER = /\b(decision-current|current-player|active-player|acting|to-act|your-turn|turn)\b/i;
  const TURN_TIMER = '[class*="decision-timer"], [class*="time-bank"], [class*="timebank"], '
    + '[class*="countdown"], [class*="turn-timer"]';

  function actingSeat() {
    for (const seat of seats()) {
      const raw = seat.className && seat.className.baseVal !== undefined
        ? seat.className.baseVal : seat.className;
      if (TURN_MARKER.test(String(raw || ''))) return seat;
      if (seat.querySelector(TURN_TIMER)) return seat;
    }
    return null;
  }

  // true / false when the table marks who is acting, null when it does not -- in
  // which case callers fall back to whether live buttons exist.
  function heroToAct() {
    const acting = actingSeat();
    if (!acting) return null;
    const hero = firstMatch(HERO_SELECTORS);
    if (!hero) return false;
    return acting === hero || hero.contains(acting) || acting.contains(hero);
  }

  function actions() {
    const b = actionButtons();
    return {
      canCheck: !!b.check,
      canCall: !!b.call,
      canRaise: !!b.raise,
      canFold: !!b.fold,
      canAllIn: !!b.allin,
      toCall: b.call ? parseAmount(b.call.textContent) : null,
    };
  }

  // Find the raise/bet amount box without ever grabbing the chat input.
  function raiseInput() {
    let best = null;
    let bestScore = 0;
    for (const el of document.querySelectorAll('input')) {
      if (el.closest('.pnhud, .log-modal') || el.disabled || el.readOnly || isHidden(el) || inPreActionArea(el)) continue;
      const type = String(el.type || 'text').toLowerCase();
      if (type !== 'number' && type !== 'text' && type !== 'tel' && type !== 'range') continue;

      const context = (attrBlob(el) + ' ' + (el.name || '') + ' ' + (el.placeholder || '')
        + ' ' + (el.parentElement ? attrBlob(el.parentElement) : '')
        + ' ' + (el.closest('[class]') ? attrBlob(el.closest('[class]')) : '')).toLowerCase();

      if (/chat|message|comment|search|nickname|name|note/.test(context)) continue;

      let score = 0;
      if (/raise|bet|amount|wager|stake/.test(context)) score += 3;
      if (!/raise|bet|amount|wager|stake/.test(context)) continue;
      if (type === 'number' || type === 'range') score += 2;
      if (el.hasAttribute('min') || el.hasAttribute('max')) score += 1;
      if (/^\s*-?\d+(\.\d+)?\s*$/.test(String(el.value || ''))) score += 2;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return bestScore >= 3 ? best : null;
  }

  // React tracks input values through the prototype setter; assigning .value
  // directly leaves its internal state stale and the change is ignored.
  function setInputValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const protoSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    const ownSetter = Object.getOwnPropertyDescriptor(el, 'value');
    if (protoSetter && protoSetter.set && (!ownSetter || ownSetter.set !== protoSetter.set)) {
      protoSetter.set.call(el, String(value));
    } else {
      el.value = String(value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const applied = parseAmount(el.value);
    return applied;
  }

  function inputBounds(el) {
    return {
      min: el.hasAttribute('min') ? parseAmount(el.getAttribute('min')) : null,
      max: el.hasAttribute('max') ? parseAmount(el.getAttribute('max')) : null,
    };
  }

  function snapshot() {
    const hole = heroCards();
    const board = boardCards();
    const filtered = board.filter((c) => !hole.includes(c));
    const opponents = opponentCount();
    const act = actions();
    const toAct = heroToAct();
    const live = act.canCheck || act.canCall || act.canRaise || act.canAllIn;
    const players = playerDetails();
    const hero = players.find(p => p.hero);
    const others = players.filter(p => !p.hero && p.inHand && !p.folded);
    const input = raiseInput();
    const bounds = input ? inputBounds(input) : { min: null, max: null };
    return {
      hole,
      board: filtered,
      opponents,
      folded: heroFolded(),
      pot: pot(),
      toCall: act.toCall,
      canCheck: act.canCheck,
      canCall: act.canCall,
      canRaise: act.canRaise,
      canFold: act.canFold,
      canAllIn: act.canAllIn,
      players,
      heroId: hero ? hero.id : null,
      heroBet: hero ? hero.bet : null,
      stack: hero ? hero.stack : null,
      position: hero ? hero.position : null,
      effectiveStack: hero && hero.stack !== null && others.length && others.every(p => p.stack !== null)
        ? Math.min(hero.stack, Math.max(...others.map(p => p.stack))) : null,
      closesAction: others.length === 1 && others[0].allIn,
      uncalledExcess: !!(hero && hero.stack !== null && others.length === 1 && others[0].bet > hero.bet + hero.stack),
      sidePots: !!document.querySelector('.table-pot-size [class*="side-pot"], .side-pot'),
      raiseMin: bounds.min,
      raiseMax: bounds.max,
      log: logEntries(),
      dealer: dealerSeat(),
      street: filtered.length === 0 ? 'preflop' : filtered.length === 3 ? 'flop' : filtered.length === 4 ? 'turn' : filtered.length === 5 ? 'river' : 'dealing',
      toAct,
      yourTurn: toAct === null ? live : (toAct && live),
      key: hole.join(',') + '|' + filtered.join(',') + '|' + opponents,
    };
  }

  function dealerSeat() {
    const el = document.querySelector('[class*="dealer-position-"]');
    if (el && el.querySelector('.dead-button')) return null;
    const match = el && String(el.className).match(/dealer-position-(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function playerDetails() {
    const hero = firstMatch(HERO_SELECTORS);
    const players = seats().map((seat, i) => {
      const name = seat.querySelector('.table-player-name, [class*="player-name"]');
      const link = name && name.querySelector('a[href*="/players/"]');
      const seatMatch = String(seat.className).match(/\btable-player-(\d+)\b/);
      const number = seatMatch ? Number(seatMatch[1]) : i + 1;
      const stack = seat.querySelector('.table-player-stack');
      const bet = seat.querySelector('.table-player-bet-value, [class*="bet-value"]');
      const status = seat.querySelector('.table-player-status, [class*="player-action"]');
      return { id: link ? link.getAttribute('href').split('/players/')[1].split(/[?#]/)[0] : 'seat:' + number,
        name: name ? name.textContent.trim() : seat === hero ? 'You' : 'Seat ' + number,
        seat: number, hero: seat === hero, folded: isFolded(seat), inHand: cardEls(seat).length >= 2,
        stack: stack ? (/all\s*in/i.test(stack.textContent) ? 0 : parseAmount(stack.textContent)) : null,
        allIn: !!(stack && /all\s*in/i.test(stack.textContent)) || /\ball-in\b/i.test(seat.className),
        bet: bet ? parseAmount(bet.textContent) : 0, status: status ? status.textContent.trim() : '', position: null };
    });
    const dealer = dealerSeat();
    if (dealer !== null && players.length >= 2) {
      const ordered = players.slice().sort((a, b) => ((a.seat - dealer + 10) % 10) - ((b.seat - dealer + 10) % 10));
      // A dead/empty button needs blind history; do not invent positions from it.
      if (ordered[0].seat === dealer) ordered.forEach((p, i) => {
        p.position = ordered.length === 2 ? (i === 0 ? 'BTN/SB' : 'BB')
          : i === 0 ? 'BTN' : i === 1 ? 'SB' : i === 2 ? 'BB'
            : i === ordered.length - 1 ? 'CO' : i === ordered.length - 2 && i > 3 ? 'HJ'
              : i === 3 ? 'UTG' : 'UTG+' + (i - 3);
      });
    }
    return players;
  }

  function logEntries() {
    // PokerNow's Full Log is newest first. Read only the public DOM, never app state.
    return Array.from(document.querySelectorAll('.log-modal-entries .entry-ctn')).reverse().map(el => {
      const content = el.querySelector('.content');
      const people = content ? Array.from(content.querySelectorAll('abbr[title]')).map(p => ({
        id: p.title.replace(/^Player ID:\s*/, ''), name: p.textContent.trim(),
      })) : [];
      return { text: content ? content.textContent.trim() : '', people,
        at: (el.querySelector('.at') || {}).textContent || '' };
    });
  }

  function cardToString(c) {
    return RANKS[c >> 2] + SUITS[c & 3];
  }

  function classSurvey(pattern, limit) {
    const seen = Object.create(null);
    for (const el of document.querySelectorAll('[class]')) {
      const raw = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
      for (const c of String(raw || '').split(/\s+/)) {
        if (c && pattern.test(c)) seen[c] = (seen[c] || 0) + 1;
      }
    }
    return Object.keys(seen)
      .map((k) => [k, seen[k]])
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map((e) => e[0] + ' x' + e[1]);
  }

  function debug() {
    const hero = firstMatch(HERO_SELECTORS);
    const board = firstMatch(BOARD_SELECTORS);
    const snap = snapshot();
    const all = cardEls(document.body);

    const info = {
      url: location.href,
      matched: {
        hero: HERO_SELECTORS.find((x) => document.querySelector(x)) || null,
        board: BOARD_SELECTORS.find((x) => document.querySelector(x)) || null,
        seatCount: seats().length,
        cardElementCount: all.length,
        cardsSuccessfullyRead: all.filter((el) => readCardEl(el) >= 0).length,
      },
      parsed: {
        hole: snap.hole.map(cardToString),
        board: snap.board.map(cardToString),
        opponents: snap.opponents,
        folded: snap.folded,
        toAct: snap.toAct,
        yourTurn: snap.yourTurn,
        pot: snap.pot,
        potSource: potDetail().source,
        toCall: snap.toCall,
      },
      classVocabulary: {
        card: classSurvey(/card/i, 25),
        player: classSurvey(/player|seat/i, 25),
        table: classSurvey(/table|board|community|pot/i, 25),
      },
      sampleCardHTML: all.slice(0, 6).map((el) => el.outerHTML.slice(0, 400)),
      heroHTML: hero ? hero.outerHTML.slice(0, 2000) : null,
      boardHTML: board ? board.outerHTML.slice(0, 1500) : null,
      sampleSeatHTML: seats()[0] ? seats()[0].outerHTML.slice(0, 1500) : null,
    };

    const text = JSON.stringify(info, null, 2);
    console.log('[PokerNow HUD] debug dump:\n' + text);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => console.log('[PokerNow HUD] copied to clipboard - paste it to Claude'),
        () => console.log('[PokerNow HUD] clipboard blocked; copy the JSON above'),
      );
    }
    return info;
  }

  function tableDetected() {
    return !!document.querySelector(
      '.table-player, [class*="table-player"], .table-cards, [class*="table-cards"], [class*="you-player"]',
    );
  }

  function cardCount() {
    return cardEls(document.body).length;
  }

  root.PNParser = {
    snapshot, debug, cardToString, heroCards, boardCards, opponentCount, tableDetected, cardCount, actions, actionButtons, heroFolded, potDetail, heroToAct, classifyAction, raiseInput, setInputValue, inputBounds,
  };
})(typeof window !== 'undefined' ? window : globalThis);
