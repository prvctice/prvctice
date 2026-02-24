/**
 * Solitaire -- Klondike card game builtin app.
 * CSS-rendered cards, drag-and-drop, spring animations, sound effects, persistence.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const SOLITAIRE_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body { height: 100%; background: #008000; }

#game {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px;
  font-family: var(--p-font-sans);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  background: #008000;
}

#header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 0 6px 0;
  flex-shrink: 0;
  font-size: 12px;
}

#header .spacer { flex: 1; }

#header .p-btn {
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.15);
}
#header .p-btn:hover {
  background: rgba(255,255,255,0.12);
  color: #fff;
}

.stats-text {
  font-family: var(--p-font-mono);
  color: rgba(255,255,255,0.6);
  font-size: 11px;
  white-space: nowrap;
}

#board {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--gap, 6px);
  min-height: 0;
}

#topRow {
  display: flex;
  gap: var(--gap, 6px);
  flex-shrink: 0;
}

.pile-gap { width: var(--gap, 6px); flex-shrink: 0; }

#tableauRow {
  display: flex;
  gap: var(--gap, 6px);
  flex: 1;
  min-height: 0;
  align-items: flex-start;
}

.pile {
  width: var(--card-w, 80px);
  min-height: var(--card-h, 112px);
  position: relative;
  flex-shrink: 0;
}

.pile.tableau {
  flex: 1;
  min-width: 0;
}

.pile-ph {
  width: 100%;
  height: var(--card-h, 112px);
  border: 1.5px dashed rgba(255,255,255,0.18);
  border-radius: var(--p-radius-md, 6px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.2);
  font-size: 22px;
  cursor: pointer;
}

.pile-ph.no-click { cursor: default; }

/* ==================== CARDS ==================== */

.card {
  width: var(--card-w, 80px);
  height: var(--card-h, 112px);
  border-radius: var(--p-radius-md, 6px);
  position: absolute;
  left: 0;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: box-shadow 0.12s;
  touch-action: none;
}

.card.face-up {
  background: #fff;
  border: 1px solid rgba(0,0,0,0.15);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

.card.face-up:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.25); }

.card.face-down {
  background: #1a3399;
  background-image:
    repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 6px),
    repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 6px);
  border: 2px solid #fff;
  cursor: default;
}

.card .corner {
  position: absolute;
  font-size: calc(var(--card-w, 80px) * 0.14);
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  pointer-events: none;
}

.card .corner-tl { top: 3px; left: 4px; }
.card .corner-br { bottom: 3px; right: 4px; transform: rotate(180deg); }

.card .center-suit {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: calc(var(--card-w, 80px) * 0.32);
  pointer-events: none;
  opacity: 0.15;
}

.card.red { color: #cc0000; }
.card.black { color: #111; }

.card.dragging { opacity: 0.25; }

.card.face-down.stock-top { cursor: pointer; }

/* ==================== GHOST ==================== */

#ghost {
  position: fixed;
  pointer-events: none;
  z-index: 1000;
  display: none;
}

#ghost .card {
  position: relative;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  left: auto;
}

#ghost .card + .card {
  margin-top: calc(-1 * var(--card-h, 112px) + var(--face-up-off, 22px));
}

/* ==================== VICTORY CANVAS ==================== */

#victoryCanvas {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 400;
  pointer-events: none;
}

/* ==================== IN-GAME STATS OVERLAY ==================== */

#statsOverlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0,0,0,0.45);
  display: none;
  align-items: center;
  justify-content: center;
}

#statsOverlay.visible { display: flex; }

#statsCard {
  background: #fff;
  border-radius: var(--p-radius-lg, 12px);
  padding: 24px 28px;
  max-width: 340px;
  width: 85%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  color: #222;
}

#statsCard h2 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
  color: #006000;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
  margin-bottom: 18px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #888;
  font-weight: 600;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #111;
  font-family: var(--p-font-mono, monospace);
}

#statsOk {
  display: block;
  width: 100%;
  padding: 8px 0;
  background: #008000;
  color: #fff;
  border: none;
  border-radius: var(--p-radius-pill, 999px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

#statsOk:hover { background: #006a00; }
</style>
</head>
<body>
<div id="game">
  <div id="header">
    <button class="p-btn p-btn-ghost p-btn-sm" id="btnNew">New</button>
    <button class="p-btn p-btn-ghost p-btn-sm" id="btnUndo">Undo</button>
    <div class="spacer"></div>
    <span class="stats-text" id="moveCount">Moves: 0</span>
    <span class="stats-text" style="opacity:0.4">|</span>
    <span class="stats-text" id="timer">0:00</span>
    <span class="stats-text" style="opacity:0.4">|</span>
    <button class="p-btn p-btn-ghost p-btn-sm" id="btnStats">Stats</button>
    <button class="p-btn p-btn-ghost p-btn-sm" id="btnMute" title="Toggle sound">&#9834;</button>
  </div>
  <div id="board">
    <div id="topRow">
      <div class="pile" id="pStock"></div>
      <div class="pile" id="pWaste"></div>
      <div class="pile-gap"></div>
      <div class="pile" id="pF0"></div>
      <div class="pile" id="pF1"></div>
      <div class="pile" id="pF2"></div>
      <div class="pile" id="pF3"></div>
    </div>
    <div id="tableauRow">
      <div class="pile tableau" id="pT0"></div>
      <div class="pile tableau" id="pT1"></div>
      <div class="pile tableau" id="pT2"></div>
      <div class="pile tableau" id="pT3"></div>
      <div class="pile tableau" id="pT4"></div>
      <div class="pile tableau" id="pT5"></div>
      <div class="pile tableau" id="pT6"></div>
    </div>
  </div>
</div>
<div id="ghost"></div>
<canvas id="victoryCanvas" style="display:none"></canvas>
<div id="statsOverlay">
  <div id="statsCard">
    <h2>Statistics</h2>
    <div class="stats-grid" id="statsGrid"></div>
    <button id="statsOk">OK</button>
  </div>
</div>

<script>prvctice.onReady(function() {
  'use strict';

  /* ==================== CONSTANTS ==================== */

  var SUIT_SYM = ['\\u2660', '\\u2665', '\\u2666', '\\u2663'];
  var RANK_LBL = ['', 'A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  function isRed(s) { return s === 1 || s === 2; }
  function sameColor(a, b) { return isRed(a) === isRed(b); }

  /* ==================== STATE ==================== */

  var S = {
    stock: [], waste: [],
    fnd: [[], [], [], []],
    tab: [[], [], [], [], [], [], []],
    moves: 0, elapsed: 0,
    undo: [], gameOver: false
  };

  var timerRef = null;
  var timerOn = false;
  var muted = false;
  var saveTimer = null;
  var cardW = 80, cardH = 112, gap = 6;
  var fdOff = 4, fuOff = 22;

  /* ==================== DECK ==================== */

  function mkDeck() {
    var d = [];
    for (var s = 0; s < 4; s++)
      for (var r = 1; r <= 13; r++)
        d.push({ s: s, r: r, f: false });
    return d;
  }

  function shuffle(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }

  /* ==================== NEW GAME ==================== */

  function newGame() {
    stopTimer();
    var deck = shuffle(mkDeck());
    S.stock = []; S.waste = [];
    S.fnd = [[], [], [], []];
    S.tab = [[], [], [], [], [], [], []];
    S.moves = 0; S.elapsed = 0;
    S.undo = []; S.gameOver = false;

    var idx = 0;
    for (var c = 0; c < 7; c++) {
      for (var r = 0; r <= c; r++) {
        var card = deck[idx++];
        card.f = (r === c);
        S.tab[c].push(card);
      }
    }
    for (var i = idx; i < deck.length; i++) {
      deck[i].f = false;
      S.stock.push(deck[i]);
    }

    renderAll();
    updateDisp();
    debounceSave();
    dealAnim();
  }

  /* ==================== VALIDATION ==================== */

  function canFnd(card, fi) {
    var pile = S.fnd[fi];
    if (pile.length === 0) return card.r === 1;
    var top = pile[pile.length - 1];
    return card.s === top.s && card.r === top.r + 1;
  }

  function canTab(card, ti) {
    var pile = S.tab[ti];
    if (pile.length === 0) return card.r === 13;
    var top = pile[pile.length - 1];
    return !sameColor(card.s, top.s) && card.r === top.r - 1;
  }

  function findFndTarget(card) {
    for (var i = 0; i < 4; i++) {
      if (canFnd(card, i)) return i;
    }
    return -1;
  }

  /* ==================== UNDO ==================== */

  function pushUndo() {
    var snap = JSON.stringify({
      stock: S.stock, waste: S.waste,
      fnd: S.fnd, tab: S.tab, moves: S.moves
    });
    S.undo.push(snap);
    if (S.undo.length > 50) S.undo.shift();
  }

  function undo() {
    if (S.undo.length === 0 || S.gameOver) return;
    var snap = JSON.parse(S.undo.pop());
    S.stock = snap.stock; S.waste = snap.waste;
    S.fnd = snap.fnd; S.tab = snap.tab;
    S.moves = snap.moves;
    renderAll(); updateDisp();
    snd('undo'); debounceSave();
  }

  /* ==================== MOVES ==================== */

  function drawStock() {
    if (S.stock.length === 0) {
      if (S.waste.length === 0) return;
      pushUndo();
      var rev = [];
      for (var i = S.waste.length - 1; i >= 0; i--) {
        rev.push({ s: S.waste[i].s, r: S.waste[i].r, f: false });
      }
      S.stock = rev; S.waste = [];
      S.moves++; snd('recycle');
    } else {
      pushUndo();
      var c = S.stock.pop();
      c.f = true;
      S.waste.push(c);
      S.moves++; snd('draw');
    }
    startTimer(); renderAll(); updateDisp(); debounceSave();
  }

  function moveToFnd(pile, srcType, srcIdx, ci) {
    var card = pile[ci];
    var fi = findFndTarget(card);
    if (fi === -1) return false;
    if (srcType === 'tab' && ci !== pile.length - 1) return false;
    pushUndo();
    pile.splice(ci, 1);
    S.fnd[fi].push(card);
    S.moves++;
    if (srcType === 'tab') flipTop(srcIdx);
    snd('fnd'); startTimer();
    renderAll(); updateDisp(); checkWin(); debounceSave();
    return true;
  }

  function moveCards(srcPile, srcType, srcIdx, ci, tgtType, tgtIdx) {
    var cards = srcPile.slice(ci);
    if (tgtType === 'fnd') {
      if (cards.length !== 1) return false;
      if (!canFnd(cards[0], tgtIdx)) return false;
      pushUndo();
      srcPile.splice(ci);
      S.fnd[tgtIdx].push(cards[0]);
      snd('fnd');
    } else if (tgtType === 'tab') {
      if (!canTab(cards[0], tgtIdx)) return false;
      pushUndo();
      srcPile.splice(ci);
      for (var i = 0; i < cards.length; i++) S.tab[tgtIdx].push(cards[i]);
      snd('place');
    } else {
      return false;
    }
    S.moves++;
    if (srcType === 'tab') flipTop(srcIdx);
    startTimer(); renderAll(); updateDisp(); checkWin(); debounceSave();
    return true;
  }

  function flipTop(ti) {
    var p = S.tab[ti];
    if (p.length > 0 && !p[p.length - 1].f) {
      p[p.length - 1].f = true;
      snd('flip');
    }
  }

  /* ==================== WIN / AUTO-COMPLETE ==================== */

  function checkWin() {
    var tot = 0;
    for (var i = 0; i < 4; i++) tot += S.fnd[i].length;
    if (tot === 52) { S.gameOver = true; stopTimer(); victorySeq(); }
    else checkAutoComplete();
  }

  function checkAutoComplete() {
    if (S.stock.length > 0 || S.waste.length > 0) return;
    for (var i = 0; i < 7; i++)
      for (var j = 0; j < S.tab[i].length; j++)
        if (!S.tab[i][j].f) return;
    autoComplete();
  }

  function autoComplete() {
    var iv = setInterval(function() {
      var moved = false;
      for (var i = 0; i < 7; i++) {
        var p = S.tab[i];
        if (p.length === 0) continue;
        var c = p[p.length - 1];
        var fi = findFndTarget(c);
        if (fi !== -1) {
          p.pop(); S.fnd[fi].push(c); S.moves++;
          snd('fnd'); renderAll(); updateDisp();
          moved = true; break;
        }
      }
      if (!moved && S.waste.length > 0) {
        var wc = S.waste[S.waste.length - 1];
        var wfi = findFndTarget(wc);
        if (wfi !== -1) {
          S.waste.pop(); S.fnd[wfi].push(wc); S.moves++;
          snd('fnd'); renderAll(); updateDisp(); moved = true;
        }
      }
      if (!moved) { clearInterval(iv); checkWin(); }
    }, 100);
  }

  /* ==================== CARD ELEMENT ==================== */

  function mkCard(card) {
    var el = document.createElement('div');
    el.className = 'card ' + (card.f ? 'face-up' : 'face-down');
    if (card.f) {
      el.className += isRed(card.s) ? ' red' : ' black';
      var tl = document.createElement('span');
      tl.className = 'corner corner-tl';
      tl.innerHTML = RANK_LBL[card.r] + '<br>' + SUIT_SYM[card.s];
      el.appendChild(tl);

      var cs = document.createElement('span');
      cs.className = 'center-suit';
      cs.textContent = SUIT_SYM[card.s];
      el.appendChild(cs);

      var br = document.createElement('span');
      br.className = 'corner corner-br';
      br.innerHTML = RANK_LBL[card.r] + '<br>' + SUIT_SYM[card.s];
      el.appendChild(br);
    }
    el.setAttribute('data-s', card.s);
    el.setAttribute('data-r', card.r);
    return el;
  }

  /* ==================== RENDER ==================== */

  function renderAll() {
    // Stock
    var sEl = document.getElementById('pStock');
    sEl.innerHTML = '';
    if (S.stock.length > 0) {
      var sc = mkCard(S.stock[S.stock.length - 1]);
      sc.style.top = '0'; sc.style.left = '0';
      sc.className += ' stock-top';
      sc.setAttribute('data-pile', 'stock');
      sc.setAttribute('data-ci', String(S.stock.length - 1));
      sEl.appendChild(sc);
      if (S.stock.length > 1) {
        var badge = document.createElement('span');
        badge.style.cssText = 'position:absolute;bottom:3px;right:4px;font-size:9px;font-family:var(--p-font-mono);color:rgba(255,255,255,0.7);z-index:5;pointer-events:none';
        badge.textContent = String(S.stock.length);
        sEl.appendChild(badge);
      }
    } else {
      var ph = document.createElement('div');
      ph.className = 'pile-ph';
      ph.textContent = S.waste.length > 0 ? '\\u21BB' : '';
      ph.setAttribute('data-pile', 'stock');
      sEl.appendChild(ph);
    }

    // Waste
    var wEl = document.getElementById('pWaste');
    wEl.innerHTML = '';
    if (S.waste.length > 0) {
      var wc = mkCard(S.waste[S.waste.length - 1]);
      wc.style.top = '0'; wc.style.left = '0';
      wc.setAttribute('data-pile', 'waste');
      wc.setAttribute('data-ci', String(S.waste.length - 1));
      wEl.appendChild(wc);
    }

    // Foundations
    for (var fi = 0; fi < 4; fi++) {
      var fEl = document.getElementById('pF' + fi);
      fEl.innerHTML = '';
      if (S.fnd[fi].length > 0) {
        var fc = mkCard(S.fnd[fi][S.fnd[fi].length - 1]);
        fc.style.top = '0'; fc.style.left = '0';
        fc.setAttribute('data-pile', 'f' + fi);
        fc.setAttribute('data-ci', String(S.fnd[fi].length - 1));
        fEl.appendChild(fc);
      } else {
        var fp = document.createElement('div');
        fp.className = 'pile-ph no-click';
        fp.textContent = SUIT_SYM[fi];
        fEl.appendChild(fp);
      }
    }

    // Tableau
    for (var ti = 0; ti < 7; ti++) {
      var tEl = document.getElementById('pT' + ti);
      tEl.innerHTML = '';
      var pile = S.tab[ti];
      if (pile.length === 0) {
        var tp = document.createElement('div');
        tp.className = 'pile-ph no-click';
        tEl.appendChild(tp);
        tEl.style.height = cardH + 'px';
        continue;
      }
      var top = 0;
      for (var ci = 0; ci < pile.length; ci++) {
        var tc = mkCard(pile[ci]);
        tc.style.top = top + 'px';
        tc.style.left = '0';
        tc.style.zIndex = String(ci);
        tc.setAttribute('data-pile', 't' + ti);
        tc.setAttribute('data-ci', String(ci));
        tEl.appendChild(tc);
        top += pile[ci].f ? fuOff : fdOff;
      }
      tEl.style.height = (top + cardH) + 'px';
    }
  }

  /* ==================== RESPONSIVE LAYOUT ==================== */

  function updateLayout() {
    var board = document.getElementById('board');
    if (!board) return;
    var bw = board.getBoundingClientRect().width;
    gap = Math.max(4, Math.min(8, Math.floor(bw * 0.01)));
    cardW = Math.floor((bw - 7 * gap) / 7.5);
    cardW = Math.max(46, Math.min(110, cardW));
    cardH = Math.floor(cardW * 1.4);
    fdOff = Math.max(3, Math.floor(cardH * 0.04));
    fuOff = Math.max(14, Math.floor(cardH * 0.19));

    var root = document.documentElement;
    root.style.setProperty('--card-w', cardW + 'px');
    root.style.setProperty('--card-h', cardH + 'px');
    root.style.setProperty('--gap', gap + 'px');
    root.style.setProperty('--face-up-off', fuOff + 'px');
    renderAll();
  }

  var rObs = new ResizeObserver(function() { updateLayout(); });

  /* ==================== DRAG & DROP ==================== */

  var drag = {
    on: false, srcPile: null, srcType: '', srcIdx: -1,
    ci: -1, cards: [], offX: 0, offY: 0
  };

  function pileInfo(el) {
    var pid = el.getAttribute('data-pile');
    if (!pid) return null;
    var ci = parseInt(el.getAttribute('data-ci') || '0', 10);
    if (pid === 'stock') return { type: 'stock', idx: -1, pile: S.stock, ci: ci };
    if (pid === 'waste') return { type: 'waste', idx: -1, pile: S.waste, ci: ci };
    if (pid.charAt(0) === 'f') {
      var fi = parseInt(pid.charAt(1), 10);
      return { type: 'fnd', idx: fi, pile: S.fnd[fi], ci: ci };
    }
    if (pid.charAt(0) === 't') {
      var ti = parseInt(pid.charAt(1), 10);
      return { type: 'tab', idx: ti, pile: S.tab[ti], ci: ci };
    }
    return null;
  }

  function beginDrag(px, py, cardEl) {
    var info = pileInfo(cardEl);
    if (!info) return;
    var card = info.pile[info.ci];
    if (!card || !card.f) return;
    if (info.type === 'waste' && info.ci !== info.pile.length - 1) return;
    if (info.type === 'fnd' || info.type === 'stock') return;

    drag.on = true;
    drag.srcType = info.type;
    drag.srcIdx = info.idx;
    drag.ci = info.ci;
    drag.srcPile = info.pile;
    drag.cards = info.pile.slice(info.ci);

    var rect = cardEl.getBoundingClientRect();
    drag.offX = px - rect.left;
    drag.offY = py - rect.top;

    var ghost = document.getElementById('ghost');
    ghost.innerHTML = '';
    ghost.style.display = 'block';
    ghost.style.left = (px - drag.offX) + 'px';
    ghost.style.top = (py - drag.offY) + 'px';

    for (var i = 0; i < drag.cards.length; i++) {
      var cl = mkCard(drag.cards[i]);
      cl.style.position = 'relative';
      cl.style.left = 'auto';
      if (i > 0) cl.style.marginTop = (-cardH + fuOff) + 'px';
      ghost.appendChild(cl);
    }

    // Mark source cards
    var pileId = info.type === 'waste' ? 'pWaste' : ('pT' + info.idx);
    var pileEl = document.getElementById(pileId);
    if (pileEl) {
      var els = pileEl.querySelectorAll('.card');
      for (var j = info.ci; j < els.length; j++) els[j].classList.add('dragging');
    }
  }

  function moveDrag(ex, ey) {
    if (!drag.on) return;
    var ghost = document.getElementById('ghost');
    ghost.style.left = (ex - drag.offX) + 'px';
    ghost.style.top = (ey - drag.offY) + 'px';
  }

  function endDrag(ex, ey) {
    if (!drag.on) return;
    drag.on = false;
    var ghost = document.getElementById('ghost');
    ghost.style.display = 'none';
    ghost.innerHTML = '';

    var tgt = hitTest(ex, ey);
    if (tgt) {
      var ok = moveCards(drag.srcPile, drag.srcType, drag.srcIdx, drag.ci, tgt.type, tgt.idx);
      if (!ok) { snd('invalid'); renderAll(); }
    } else {
      snd('invalid'); renderAll();
    }
  }

  function hitTest(x, y) {
    for (var fi = 0; fi < 4; fi++) {
      var fRect = document.getElementById('pF' + fi).getBoundingClientRect();
      if (x >= fRect.left && x <= fRect.right && y >= fRect.top && y <= fRect.bottom) {
        return { type: 'fnd', idx: fi };
      }
    }
    for (var ti = 0; ti < 7; ti++) {
      var tRect = document.getElementById('pT' + ti).getBoundingClientRect();
      if (x >= tRect.left && x <= tRect.right && y >= tRect.top - 10 && y <= tRect.bottom + 30) {
        return { type: 'tab', idx: ti };
      }
    }
    return null;
  }

  /* ==================== POINTER EVENTS ==================== */

  var ptrCard = null, ptrX = 0, ptrY = 0, ptrTime = 0, ptrMoved = false;
  var dblPile = '', dblCi = -1, dblTime = 0;

  var gameEl = document.getElementById('game');

  gameEl.addEventListener('pointerdown', function(e) {
    if (S.gameOver) return;
    e.preventDefault();

    var cardEl = e.target.closest('.card');
    var phEl = e.target.closest('.pile-ph');

    if (!cardEl && phEl) {
      var phPile = phEl.getAttribute('data-pile');
      if (phPile === 'stock') { drawStock(); return; }
      return;
    }
    if (!cardEl) return;

    ptrCard = cardEl;
    ptrX = e.clientX; ptrY = e.clientY;
    ptrTime = Date.now();
    ptrMoved = false;

    if (gameEl.setPointerCapture) gameEl.setPointerCapture(e.pointerId);
  });

  gameEl.addEventListener('pointermove', function(e) {
    if (!ptrCard) return;

    if (!drag.on) {
      var dx = e.clientX - ptrX, dy = e.clientY - ptrY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        ptrMoved = true;
        beginDrag(ptrX, ptrY, ptrCard);
      }
    }
    if (drag.on) moveDrag(e.clientX, e.clientY);
  });

  gameEl.addEventListener('pointerup', function(e) {
    if (drag.on) { endDrag(e.clientX, e.clientY); ptrCard = null; return; }
    if (!ptrCard) return;

    var cardEl = ptrCard;
    ptrCard = null;
    if (ptrMoved) return;

    var info = pileInfo(cardEl);
    if (!info) return;

    if (info.type === 'stock') { drawStock(); return; }

    // Double-click detection
    var now = Date.now();
    var pid = info.type + (info.idx >= 0 ? info.idx : '');
    var isDbl = (now - dblTime < 400) && dblPile === pid && dblCi === info.ci;

    if (isDbl) {
      dblTime = 0;
      if ((info.type === 'waste' || info.type === 'tab') && info.ci === info.pile.length - 1) {
        moveToFnd(info.pile, info.type, info.idx, info.ci);
      }
    } else {
      dblPile = pid; dblCi = info.ci; dblTime = now;
      if (info.pile[info.ci] && info.pile[info.ci].f) snd('tap');
    }
  });

  gameEl.addEventListener('pointercancel', function() {
    if (drag.on) {
      drag.on = false;
      document.getElementById('ghost').style.display = 'none';
      renderAll();
    }
    ptrCard = null;
  });

  /* ==================== SOUND ==================== */

  function snd(type) {
    if (muted) return;
    try {
      var a = prvctice.audio;
      if (!a) return;
      switch (type) {
        case 'tap': a.tone(500, 25, { type: 'sine', volume: 0.08 }); break;
        case 'flip': a.tone(800, 40, { type: 'sine', volume: 0.12 }); break;
        case 'place': a.tone(400, 60, { type: 'triangle', volume: 0.15 }); break;
        case 'fnd': a.tone(600, 80, { type: 'sine', volume: 0.2 }); break;
        case 'draw': a.tone(300, 50, { type: 'sine', volume: 0.12 }); break;
        case 'recycle': a.sequence([
          { freq: 250, duration: 60 }, { freq: 300, duration: 60 }, { freq: 350, duration: 60 }
        ], { type: 'triangle', volume: 0.12 }); break;
        case 'invalid': a.tone(200, 100, { type: 'square', volume: 0.08 }); break;
        case 'undo': a.tone(350, 50, { type: 'sine', volume: 0.1 }); break;
        case 'win': a.sequence([
          { freq: 523, duration: 150 }, { freq: 659, duration: 150 },
          { freq: 784, duration: 150 }, { freq: 1047, duration: 300 }
        ], { type: 'sine', volume: 0.25 }); break;
      }
    } catch (e) { /* noop */ }
  }

  function toggleMute() {
    muted = !muted;
    updateMuteBtn();
    prvctice.storage.set('solitaire_muted', muted);
  }

  function updateMuteBtn() {
    var btn = document.getElementById('btnMute');
    if (!btn) return;
    btn.style.opacity = muted ? '0.35' : '';
    btn.title = muted ? 'Unmute sounds' : 'Mute sounds';
  }

  /* ==================== ANIMATIONS ==================== */

  function dealAnim() {
    var cards = document.querySelectorAll('#board .card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].style.opacity = '0';
      cards[i].style.transform = 'scale(0.85) translateY(-8px)';
    }
    void document.body.offsetHeight;
    for (var j = 0; j < cards.length; j++) {
      prvctice.animate(cards[j], {
        opacity: '1', transform: 'scale(1) translateY(0)'
      }, { preset: 'snappy', delay: j * 35 });
    }
  }

  /* ==================== VICTORY ==================== */

  function victorySeq() {
    snd('win');
    loadStats().then(function(st) {
      st.played++; st.won++; st.currentStreak++;
      if (st.currentStreak > st.bestStreak) st.bestStreak = st.currentStreak;
      if (st.bestTime === 0 || S.elapsed < st.bestTime) st.bestTime = S.elapsed;
      if (st.bestMoves === 0 || S.moves < st.bestMoves) st.bestMoves = S.moves;
      return saveStats(st);
    });
    prvctice.storage.delete('solitaire_game');
    prvctice.ui.toast({
      message: 'You won! ' + S.moves + ' moves, ' + fmtTime(S.elapsed),
      type: 'success', duration: 5000
    });
    startCascade();
    setTimeout(function() { stopCascade(); showWinPrompt(); }, 5500);
  }

  var cascRAF = null;
  var cascCards = [];

  function startCascade() {
    var cv = document.getElementById('victoryCanvas');
    cv.style.display = 'block';
    var ctx = cv.getContext('2d');
    var bRect = document.getElementById('game').getBoundingClientRect();
    cv.width = Math.round(bRect.width);
    cv.height = Math.round(bRect.height);
    cv.style.width = bRect.width + 'px';
    cv.style.height = bRect.height + 'px';
    var w = cv.width, h = cv.height;
    cascCards = [];

    var delay = 0;
    for (var fi = 0; fi < 4; fi++) {
      for (var ri = 13; ri >= 1; ri--) {
        (function(suit, rank, d) {
          setTimeout(function() {
            cascCards.push({
              x: w * 0.4 + suit * (cardW * 0.6),
              y: 10,
              vx: (Math.random() - 0.5) * 6,
              vy: Math.random() * 2 + 1,
              w: cardW * 0.5, h: cardH * 0.5,
              suit: suit, rank: rank,
              rot: 0, vr: (Math.random() - 0.5) * 0.1
            });
          }, d);
        })(fi, ri, delay);
        delay += 50;
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < cascCards.length; i++) {
        var c = cascCards[i];
        c.vy += 0.35;
        c.x += c.vx; c.y += c.vy;
        c.rot += c.vr;
        if (c.x < 0) { c.x = 0; c.vx = Math.abs(c.vx) * 0.8; }
        if (c.x + c.w > w) { c.x = w - c.w; c.vx = -Math.abs(c.vx) * 0.8; }
        if (c.y + c.h > h) { c.y = h - c.h; c.vy = -Math.abs(c.vy) * 0.7; }

        ctx.save();
        ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
        ctx.rotate(c.rot);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.fillStyle = isRed(c.suit) ? '#cc0000' : '#111';
        ctx.font = Math.round(c.w * 0.35) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(RANK_LBL[c.rank] + SUIT_SYM[c.suit], 0, 0);
        ctx.restore();
      }
      cascRAF = requestAnimationFrame(frame);
    }
    cascRAF = requestAnimationFrame(frame);
  }

  function stopCascade() {
    if (cascRAF) { cancelAnimationFrame(cascRAF); cascRAF = null; }
    var cv = document.getElementById('victoryCanvas');
    cv.style.display = 'none';
    cascCards = [];
  }

  function showWinPrompt() {
    prvctice.ui.confirm({
      title: 'You Win!',
      message: S.moves + ' moves in ' + fmtTime(S.elapsed),
      confirmLabel: 'Play Again', cancelLabel: 'Close'
    }).then(function(again) { if (again) newGame(); });
  }

  /* ==================== TIMER ==================== */

  function startTimer() {
    if (timerOn || S.gameOver) return;
    timerOn = true;
    timerRef = setInterval(function() {
      S.elapsed++;
      var el = document.getElementById('timer');
      if (el) el.textContent = fmtTime(S.elapsed);
    }, 1000);
  }

  function stopTimer() {
    timerOn = false;
    if (timerRef) { clearInterval(timerRef); timerRef = null; }
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateDisp() {
    var mEl = document.getElementById('moveCount');
    if (mEl) mEl.textContent = 'Moves: ' + S.moves;
    var tEl = document.getElementById('timer');
    if (tEl) tEl.textContent = fmtTime(S.elapsed);
  }

  /* ==================== STATS & PERSISTENCE ==================== */

  function defaultStats() {
    return { played: 0, won: 0, currentStreak: 0, bestStreak: 0, bestTime: 0, bestMoves: 0 };
  }

  function loadStats() {
    return prvctice.storage.get('solitaire_stats').then(function(d) {
      return (d && typeof d === 'object') ? d : defaultStats();
    }).catch(function() { return defaultStats(); });
  }

  function saveStats(st) { return prvctice.storage.set('solitaire_stats', st); }

  function showStatsDialog() {
    loadStats().then(function(st) {
      var pct = st.played > 0 ? Math.round(st.won / st.played * 100) : 0;
      var grid = document.getElementById('statsGrid');
      if (!grid) return;
      grid.innerHTML = '';
      var items = [
        ['Games Played', String(st.played)],
        ['Games Won', st.won + ' (' + pct + '%)'],
        ['Current Streak', String(st.currentStreak)],
        ['Best Streak', String(st.bestStreak)]
      ];
      if (st.bestTime > 0) items.push(['Best Time', fmtTime(st.bestTime)]);
      if (st.bestMoves > 0) items.push(['Fewest Moves', String(st.bestMoves)]);
      for (var i = 0; i < items.length; i++) {
        var div = document.createElement('div');
        div.className = 'stat-item';
        div.innerHTML = '<span class="stat-label">' + items[i][0] + '</span><span class="stat-value">' + items[i][1] + '</span>';
        grid.appendChild(div);
      }
      var overlay = document.getElementById('statsOverlay');
      if (overlay) overlay.classList.add('visible');
    });
  }

  function hideStats() {
    var overlay = document.getElementById('statsOverlay');
    if (overlay) overlay.classList.remove('visible');
  }

  function saveGame() {
    if (S.gameOver) return;
    prvctice.storage.set('solitaire_game', {
      stock: S.stock, waste: S.waste,
      fnd: S.fnd, tab: S.tab,
      moves: S.moves, elapsed: S.elapsed,
      undo: S.undo
    });
  }

  function debounceSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveGame, 500);
  }

  function loadGame() {
    return prvctice.storage.get('solitaire_game').then(function(d) {
      if (!d || !d.tab) return false;
      S.stock = d.stock || [];
      S.waste = d.waste || [];
      S.fnd = d.fnd || [[], [], [], []];
      S.tab = d.tab || [[], [], [], [], [], [], []];
      S.moves = d.moves || 0;
      S.elapsed = d.elapsed || 0;
      S.undo = d.undo || [];
      S.gameOver = false;
      return true;
    }).catch(function() { return false; });
  }

  /* ==================== KEYBOARD ==================== */

  function onKey(e) {
    if (S.gameOver) return;
    var k = e.key;
    if (k === 'z' || k === 'Z') { undo(); e.preventDefault(); }
    else if (k === 'n' || k === 'N') { confirmNew(); }
    else if (k === ' ') { drawStock(); e.preventDefault(); }
  }

  document.addEventListener('keydown', onKey);
  if (prvctice.input && prvctice.input.onKeyDown) prvctice.input.onKeyDown(onKey);

  /* ==================== UI CONTROLS ==================== */

  function confirmNew() {
    if (S.moves === 0) { newGame(); return; }
    prvctice.ui.confirm({
      title: 'New Game',
      message: 'Start a new game? Current progress will be lost.',
      confirmLabel: 'New Game', cancelLabel: 'Cancel'
    }).then(function(yes) {
      if (!yes) return;
      if (!S.gameOver) {
        loadStats().then(function(st) {
          st.played++; st.currentStreak = 0;
          return saveStats(st);
        });
      }
      prvctice.storage.delete('solitaire_game');
      newGame();
    });
  }

  document.getElementById('btnNew').addEventListener('click', confirmNew);
  document.getElementById('btnUndo').addEventListener('click', function() { undo(); });
  document.getElementById('btnStats').addEventListener('click', function() { showStatsDialog(); });
  document.getElementById('btnMute').addEventListener('click', function() { toggleMute(); });
  document.getElementById('statsOk').addEventListener('click', function() { hideStats(); });
  document.getElementById('statsOverlay').addEventListener('click', function(e) {
    if (e.target === this) hideStats();
  });

  /* ==================== CLEANUP ==================== */

  prvctice.onDispose(function() { saveGame(); stopTimer(); });
  prvctice.window.onClose(function() { saveGame(); stopTimer(); });

  /* ==================== INIT ==================== */

  rObs.observe(document.getElementById('board'));

  prvctice.storage.get('solitaire_muted').then(function(v) {
    if (v === true) { muted = true; updateMuteBtn(); }
  });

  loadGame().then(function(has) {
    if (has) {
      prvctice.ui.confirm({
        title: 'Resume Game?',
        message: 'You have a saved game (' + S.moves + ' moves). Resume?',
        confirmLabel: 'Resume', cancelLabel: 'New Game'
      }).then(function(resume) {
        if (resume) {
          updateLayout(); updateDisp();
          if (S.moves > 0) startTimer();
        } else {
          newGame();
        }
      });
    } else {
      newGame();
    }
  });
});<` +
  `/script>
</body>
</html>`;
