'use strict';
/* ═══════════════════════════════════════════════════════════
   Three-Man Points  —  app.js  (v2 with handicaps)

   Flow:
     Setup  →  HCP Ratings  →  Scorecard  →  Leaderboard  →  Winner

   Handicap logic:
     - Each player has a course handicap (whole number)
     - Each hole has an HCP rating 1-18 (1=hardest)
     - A player gets a stroke on a hole when their handicap >= that hole's rating
     - Players with hcp > 18 get 2 strokes on holes where rating <= (hcp - 18)
     - Net score = gross score - strokes on that hole
     - Points are awarded based on NET scores
═══════════════════════════════════════════════════════════ */

const STORAGE_KEY  = 'three-man-v2';
const P_COLORS     = ['var(--c1)', 'var(--c2)', 'var(--c3)'];
const HOLE_SETS    = {
  '18': Array.from({length:18}, (_,i) => i+1),
  '9f': Array.from({length:9},  (_,i) => i+1),
  '9b': Array.from({length:9},  (_,i) => i+10),
};

let state = null;

// ── Handicap helpers ──────────────────────────────────────

/**
 * Returns strokes a player receives on a given hole.
 * @param {number} playerHcp   - course handicap (0-54)
 * @param {number} holeRating  - hole HCP rating (1-18)
 */
function strokesOnHole(playerHcp, holeRating) {
  if (!playerHcp || playerHcp <= 0) return 0;
  let strokes = 0;
  if (playerHcp >= holeRating) strokes++;
  if (playerHcp > 18 && holeRating <= (playerHcp - 18)) strokes++;
  return strokes;
}

/**
 * Net score for a player on a hole.
 */
function netScore(grossScore, playerHcp, holeRating) {
  if (grossScore === null) return null;
  return grossScore - strokesOnHole(playerHcp, holeRating);
}

// ── Points logic ──────────────────────────────────────────

function ptForPlayer(netScores, i) {
  const me = netScores[i];
  const others = netScores.filter((_,j) => j !== i);
  const o1 = others[0], o2 = others[1];
  if (me === o1 && me === o2) return 3;               // all tie
  if (me < o1 && me < o2)    return 5;               // lowest alone
  if (me > o1 && me > o2)    return 1;               // highest alone
  if ((me === o1 && me < o2) || (me === o2 && me < o1)) return 4;  // tie for low
  if ((me === o1 && me > o2) || (me === o2 && me > o1)) return 2;  // tie for high
  if (o1 === o2 && me < o1)  return 5;               // two others tie, I'm lower
  if (o1 === o2 && me > o1)  return 1;               // two others tie, I'm higher
  return 3;
}

function holePoints(grossScores, playerHcps, holeRating) {
  if (grossScores.some(s => s === null)) return [null, null, null];
  const nets = grossScores.map((g, i) => netScore(g, playerHcps[i], holeRating || 0));
  return [0, 1, 2].map(i => ptForPlayer(nets, i));
}

// ── State ─────────────────────────────────────────────────

function initState(players, holeSet, holeRatings) {
  const holes = HOLE_SETS[holeSet];
  return {
    players,       // [{name, color, hcp}]
    holeSet,
    holes,         // hole numbers [1..18], [1..9], or [10..18]
    holeRatings,   // {1:5, 2:11, ...} keyed by hole number
    scores: holes.map(() => [null, null, null]),
    finished: false,
  };
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadSaved()  {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
  catch { return null; }
}

// ── Totals ────────────────────────────────────────────────

function computeTotals() {
  const pts = [0,0,0];
  const holesPlayed = [0,0,0];
  const breakdown = state.holes.map((holeNum, hi) => {
    const gross = state.scores[hi];
    const rating = state.holeRatings[holeNum] || 0;
    const hcps = state.players.map(p => p.hcp || 0);
    const hp = holePoints(gross, hcps, rating);
    const nets = gross.map((g,i) => g !== null ? netScore(g, hcps[i], rating) : null);
    if (hp[0] !== null) {
      hp.forEach((p,i) => { pts[i] += p; holesPlayed[i]++; });
    }
    return { holeNum, gross, nets, pts: hp, rating,
             strokes: hcps.map(h => strokesOnHole(h, rating)) };
  });
  return { pts, holesPlayed, breakdown };
}

// ── Helpers ───────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

let toastT;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Screen 1: Setup ───────────────────────────────────────

function renderSetup() {
  const saved = loadSaved();
  $('btn-resume').style.display = (saved && !saved.finished) ? 'block' : 'none';
}

function wireSetup() {
  document.querySelectorAll('.tog-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tog-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  $('btn-to-hcp').addEventListener('click', () => {
    const names = [
      $('p1-name').value.trim() || 'Player 1',
      $('p2-name').value.trim() || 'Player 2',
      $('p3-name').value.trim() || 'Player 3',
    ];
    const hcps = [
      parseInt($('p1-hcp').value) || 0,
      parseInt($('p2-hcp').value) || 0,
      parseInt($('p3-hcp').value) || 0,
    ];
    const activeToggle = document.querySelector('.tog-btn.active');
    const holeSet = activeToggle ? activeToggle.dataset.holes : '18';
    // Temporarily store setup info for handoff to HCP screen
    window._pendingSetup = { names, hcps, holeSet };
    renderHcpScreen(holeSet);
    showScreen('screen-hcp');
  });

  $('btn-resume').addEventListener('click', () => {
    state = loadSaved();
    renderCard();
    showScreen('screen-card');
  });
}

// ── Screen 2: HCP Ratings ─────────────────────────────────

function renderHcpScreen(holeSet) {
  const holes = HOLE_SETS[holeSet];
  const grid = $('hcp-grid');
  grid.innerHTML = holes.map(h => `
    <div class="hcp-hole-cell">
      <span class="hcp-hole-num ${h <= 9 ? 'front' : 'back'}">H${h}</span>
      <input class="hcp-rating-input" id="hcpr-${h}" type="number"
             min="1" max="18" placeholder="—"
             inputmode="numeric" data-hole="${h}" />
    </div>
  `).join('');

  // Mark filled on input
  grid.querySelectorAll('.hcp-rating-input').forEach(inp => {
    inp.addEventListener('input', () => {
      inp.classList.toggle('filled', inp.value !== '');
    });
  });
}

function getHcpRatings() {
  const ratings = {};
  document.querySelectorAll('.hcp-rating-input').forEach(inp => {
    const hole = parseInt(inp.dataset.hole);
    const val  = parseInt(inp.value);
    if (val >= 1 && val <= 18) ratings[hole] = val;
  });
  return ratings;
}

function wireHcpScreen() {
  $('btn-hcp-back').addEventListener('click', () => showScreen('screen-setup'));

  $('btn-hcp-clear').addEventListener('click', () => {
    document.querySelectorAll('.hcp-rating-input').forEach(inp => {
      inp.value = '';
      inp.classList.remove('filled');
    });
  });

  $('btn-start').addEventListener('click', () => {
    const setup = window._pendingSetup;
    if (!setup) { showScreen('screen-setup'); return; }

    const holeRatings = getHcpRatings();
    const players = setup.names.map((name, i) => ({
      name, color: P_COLORS[i], hcp: setup.hcps[i]
    }));
    state = initState(players, setup.holeSet, holeRatings);
    saveState();
    renderCard();
    showScreen('screen-card');
  });
}

// ── Screen 3: Scorecard ───────────────────────────────────

function renderCard() {
  const { pts, holesPlayed, breakdown } = computeTotals();
  const total  = state.holes.length;
  const played = holesPlayed[0];

  $('card-sub').textContent = played === total
    ? 'Round complete' : `${played} of ${total} holes played`;

  // Totals strip
  $('totals-strip').innerHTML = state.players.map((p,i) => `
    <div class="total-cell">
      <div class="tc-name" style="color:${p.color}">${p.name}</div>
      <div class="tc-pts" style="color:${p.color}">${pts[i]}</div>
      <div class="tc-hcp">HCP ${p.hcp || 0}</div>
    </div>
  `).join('');

  const container = $('hole-cards');
  container.innerHTML = '';
  let front9done = false;

  breakdown.forEach((b, hi) => {
    if (state.holeSet === '18' && b.holeNum === 10 && !front9done) {
      front9done = true;
      container.appendChild(buildSubtotalCard('Front 9', computeSubtotal(breakdown, 0, 9)));
    }
    container.appendChild(buildHoleCard(b, hi));
  });

  if (state.holeSet === '18') {
    container.appendChild(buildSubtotalCard('Back 9', computeSubtotal(breakdown, 9, 18)));
  }
  container.appendChild(buildRulesCard());
}

function computeSubtotal(breakdown, from, to) {
  const pts = [0,0,0];
  breakdown.slice(from, to).forEach(b => {
    if (b.pts[0] !== null) b.pts.forEach((p,i) => pts[i] += p);
  });
  return pts;
}

function buildSubtotalCard(label, pts) {
  const div = document.createElement('div');
  div.className = 'subtotal-card';
  div.innerHTML = `
    <div class="subtotal-label">${label}</div>
    <div class="subtotal-cells">
      ${state.players.map((p,i) => `
        <div class="subtotal-cell">
          <div class="subtotal-name" style="color:${p.color}">${p.name.split(' ')[0]}</div>
          <div class="subtotal-pts" style="color:${p.color}">${pts[i]}</div>
        </div>
      `).join('')}
    </div>`;
  return div;
}

function buildHoleCard(b, hi) {
  const card = document.createElement('div');
  const allScored = b.gross.every(s => s !== null);
  const hasAny    = b.gross.some(s => s !== null);
  card.className = 'hole-card' + (allScored ? ' complete' : hasAny ? ' has-scores' : '');
  card.dataset.hi = hi;

  const ratingTxt = b.rating ? `HCP ${b.rating}` : 'No rating';

  card.innerHTML = `
    <div class="hole-card-header">
      <span class="hole-num">${b.holeNum}</span>
      <span class="hole-label">Hole ${b.holeNum}</span>
      <span class="hole-hcp-badge">${ratingTxt}</span>
    </div>
    <div class="hole-card-body">
      ${state.players.map((p,i) => {
        const gross = b.gross[i];
        const net   = b.nets[i];
        const strk  = b.strokes[i];
        const pts   = b.pts[i];
        const ptsClass = pts !== null ? `pts-${pts}` : 'pts-dash';
        const ptsStr   = pts !== null ? pts : '—';
        const netTxt   = net !== null
          ? `<span class="net-num">net ${net}</span>${strk > 0 ? `<span style="color:var(--gold)">${'●'.repeat(strk)}</span>` : ''}`
          : '';
        return `
          <div class="score-row">
            <span class="score-name" style="color:${p.color}">${p.name}</span>
            <div class="score-controls">
              <button class="score-btn" data-hi="${hi}" data-pi="${i}" data-dir="-1">−</button>
              <span class="score-val" id="sv-${hi}-${i}">${gross !== null ? gross : '—'}</span>
              <button class="score-btn" data-hi="${hi}" data-pi="${i}" data-dir="1">+</button>
            </div>
            <div class="net-val">${netTxt}</div>
            <span class="pts-badge ${ptsClass}" id="pb-${hi}-${i}">${ptsStr}</span>
          </div>`;
      }).join('')}
    </div>
    ${allScored ? `
    <div class="hole-pts-row">
      ${state.players.map((p,i) => `
        <div class="hole-pts-chip pts-${b.pts[i]}">
          ${p.name.split(' ')[0]}: ${b.pts[i]}
        </div>`).join('')}
    </div>` : ''}`;
  return card;
}

function buildRulesCard() {
  const div = document.createElement('div');
  div.className = 'rules-card';
  div.innerHTML = `
    <div class="rules-header">Points System (based on net scores)</div>
    <div class="rules-row"><span class="rules-pts pts-5">5</span><span class="rules-desc">Low net score alone</span></div>
    <div class="rules-row"><span class="rules-pts pts-4">4</span><span class="rules-desc">Tie for low net (2 players) — each</span></div>
    <div class="rules-row"><span class="rules-pts pts-3">3</span><span class="rules-desc">All three tied — each</span></div>
    <div class="rules-row"><span class="rules-pts pts-2">2</span><span class="rules-desc">Tie for high net (2 players) — each</span></div>
    <div class="rules-row"><span class="rules-pts pts-1">1</span><span class="rules-desc">High net score alone</span></div>
    <div class="rules-row" style="font-size:12px;padding:8px 16px;color:var(--text3)">
      <span>● = handicap stroke on this hole (gold dot)</span>
    </div>`;
  return div;
}

function handleScoreBtn(hi, pi, dir) {
  const cur = state.scores[hi][pi];
  const next = cur === null ? (dir === 1 ? 3 : null) : Math.max(1, cur + dir);
  if (next === null && dir === -1 && cur === null) return;
  if (next !== null) {
    state.scores[hi][pi] = next;
  }
  saveState();
  renderCard();
}

function wireCard() {
  $('btn-card-back').addEventListener('click', () => {
    showScreen('screen-setup');
    renderSetup();
  });
  $('btn-leaderboard-link').addEventListener('click', () => {
    renderLeaderboard();
    showScreen('screen-lead');
  });
  // Score buttons via delegation
  $('hole-cards').addEventListener('click', e => {
    const btn = e.target.closest('.score-btn');
    if (!btn) return;
    handleScoreBtn(parseInt(btn.dataset.hi), parseInt(btn.dataset.pi), parseInt(btn.dataset.dir));
  });
}

// ── Screen 4: Leaderboard ─────────────────────────────────

function renderLeaderboard() {
  const { pts, holesPlayed, breakdown } = computeTotals();
  const total  = state.holes.length;
  const played = holesPlayed[0];
  $('lead-sub').textContent = played === total ? 'Final Scores' : `${played} of ${total} holes`;

  const ranked = state.players.map((p,i) => ({...p, pts: pts[i], played: holesPlayed[i]}))
    .sort((a,b) => b.pts - a.pts);

  const rankIcons   = ['🥇','🥈','🥉'];
  const rankClasses = ['r1','r2','r3'];

  let html = `<div class="lead-table">`;
  ranked.forEach((p,ri) => {
    html += `
      <div class="lead-row ${ri===0 && p.pts>0 ? 'lead-1st' : ''}">
        <div class="lead-rank ${rankClasses[ri]}">${rankIcons[ri]||ri+1}</div>
        <div class="lead-color" style="background:${p.color}"></div>
        <div class="lead-name">${p.name}<br><span style="font-size:11px;color:var(--text3);font-weight:400">HCP ${p.hcp||0}</span></div>
        <div class="lead-stats">
          <div class="lead-pts-big" style="color:${p.color}">${p.pts}</div>
          <div class="lead-detail">${p.pts} pts · ${p.played} holes</div>
        </div>
      </div>`;
  });
  html += `</div>`;

  // Hole-by-hole table
  const scoredHoles = breakdown.filter(b => b.pts[0] !== null);
  if (scoredHoles.length > 0) {
    html += `<div class="pts-breakdown">
      <div class="pts-breakdown-header">Hole-by-Hole Points</div>
      <div class="pts-breakdown-grid">
        <div class="pb-cell pb-head">Hole</div>
        <div class="pb-cell pb-head">HCP</div>
        ${state.players.map(p => `<div class="pb-cell pb-head" style="color:${p.color}">${p.name.split(' ')[0]}</div>`).join('')}`;
    scoredHoles.forEach(b => {
      html += `<div class="pb-cell pb-hole">${b.holeNum}</div>`;
      html += `<div class="pb-cell pb-hcp-r">${b.rating || '—'}</div>`;
      b.pts.forEach(pt => { html += `<div class="pb-cell pts-${pt}" style="font-weight:700">${pt}</div>`; });
    });
    html += `</div></div>`;
  }

  html += `<button class="finish-btn" id="btn-finish">${played===total ? '🏆 Final Results' : 'Finish Round'}</button>`;
  $('lead-content').innerHTML = html;
  $('btn-finish').addEventListener('click', () => {
    state.finished = true;
    saveState();
    renderWinner();
    showScreen('screen-winner');
  });
}

function wireLead() {
  $('btn-lead-back').addEventListener('click', () => { renderCard(); showScreen('screen-card'); });
  $('btn-lead-refresh').addEventListener('click', renderLeaderboard);
}

// ── Screen 5: Winner ──────────────────────────────────────

function renderWinner() {
  const { pts } = computeTotals();
  const ranked = state.players.map((p,i) => ({...p, pts: pts[i]}))
    .sort((a,b) => b.pts - a.pts);
  const winner = ranked[0];

  $('winner-content').innerHTML = `
    <div class="winner-wrap">
      <div class="winner-trophy">🏆</div>
      <div class="winner-label">Winner</div>
      <div class="winner-name" style="color:${winner.color}">${winner.name}</div>
      <div class="winner-pts">${winner.pts} points</div>
      <div class="winner-podium">
        ${ranked.map((p,ri) => `
          <div class="podium-card ${ri===0?'p1st':''}">
            <div class="podium-rank">${['🥇','🥈','🥉'][ri]}</div>
            <div class="podium-name">${p.name}</div>
            <div class="podium-pts" style="color:${p.color}">${p.pts}</div>
          </div>`).join('')}
      </div>
      <button class="new-round-btn" id="btn-new-round">New Round</button>
    </div>`;
  $('btn-new-round').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    state = null;
    renderSetup();
    showScreen('screen-setup');
  });
}

// ── Boot ──────────────────────────────────────────────────

function boot() {
  wireSetup();
  wireHcpScreen();
  wireCard();
  wireLead();
  renderSetup();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  showScreen('screen-setup');
}

document.addEventListener('DOMContentLoaded', boot);
