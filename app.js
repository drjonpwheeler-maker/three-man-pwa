'use strict';
/* ═══════════════════════════════════════════════════════════
   Three-Man Points  —  app.js  (v3 with course saving)

   Storage keys:
     three-man-v3-round    → current/last round state
     three-man-v3-courses  → array of saved courses

   Course object:
     { id, name, savedAt, holes: { 1:{par,hcpRating}, 2:…, … } }

   Round state:
     { players, holeSet, holes[], holeData{}, scores[][], finished }
     holeData keyed by hole number: { par, hcpRating }
═══════════════════════════════════════════════════════════ */

const ROUND_KEY   = 'three-man-v3-round';
const COURSES_KEY = 'three-man-v3-courses';
const P_COLORS    = ['var(--c1)', 'var(--c2)', 'var(--c3)'];
const HOLE_SETS   = {
  '18': Array.from({length:18}, (_,i) => i+1),
  '9f': Array.from({length:9},  (_,i) => i+1),
  '9b': Array.from({length:9},  (_,i) => i+10),
};
const DEFAULT_PARS = { 1:4,2:4,3:3,4:5,5:4,6:3,7:4,8:5,9:4, 10:4,11:4,12:3,13:5,14:4,15:3,16:4,17:5,18:4 };

let state = null;
let _pendingSetup = null;
let _expandedCourse = null; // id of expanded course card

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

// ── Storage ───────────────────────────────────────────────
function saveRound()    { localStorage.setItem(ROUND_KEY,   JSON.stringify(state)); }
function loadRound()    { try { return JSON.parse(localStorage.getItem(ROUND_KEY));   } catch { return null; } }
function loadCourses()  { try { return JSON.parse(localStorage.getItem(COURSES_KEY)) || []; } catch { return []; } }
function saveCourses(c) { localStorage.setItem(COURSES_KEY, JSON.stringify(c)); }

// ── Course CRUD ───────────────────────────────────────────
function saveCourse(name, holeData) {
  const courses = loadCourses();
  const id = Date.now().toString();
  courses.push({ id, name: name.trim(), savedAt: Date.now(), holeData });
  saveCourses(courses);
  return id;
}

function deleteCourse(id) {
  const courses = loadCourses().filter(c => c.id !== id);
  saveCourses(courses);
}

// ── Handicap / Points logic ───────────────────────────────
function strokesOnHole(playerHcp, hcpRating) {
  if (!playerHcp || playerHcp <= 0 || !hcpRating) return 0;
  let s = 0;
  if (playerHcp >= hcpRating) s++;
  if (playerHcp > 18 && hcpRating <= (playerHcp - 18)) s++;
  return s;
}

function ptForPlayer(netScores, i) {
  const me = netScores[i];
  const others = netScores.filter((_,j) => j !== i);
  const [o1, o2] = others;
  if (me === o1 && me === o2) return 3;
  if (me < o1 && me < o2)    return 5;
  if (me > o1 && me > o2)    return 1;
  if ((me === o1 && me < o2) || (me === o2 && me < o1)) return 4;
  if ((me === o1 && me > o2) || (me === o2 && me > o1)) return 2;
  if (o1 === o2 && me < o1)  return 5;
  if (o1 === o2 && me > o1)  return 1;
  return 3;
}

function holePoints(grossScores, playerHcps, hcpRating) {
  if (grossScores.some(s => s === null)) return [null, null, null];
  const nets = grossScores.map((g, i) => g - strokesOnHole(playerHcps[i], hcpRating));
  return [0,1,2].map(i => ptForPlayer(nets, i));
}

// ── State init ────────────────────────────────────────────
function initState(players, holeSet, holeData) {
  const holes = HOLE_SETS[holeSet];
  return {
    players,    // [{name, color, hcp}]
    holeSet,
    holes,      // array of hole numbers
    holeData,   // { [holeNum]: { par, hcpRating } }
    scores: holes.map(() => [null, null, null]),
    finished: false,
  };
}

// ── Totals ────────────────────────────────────────────────
function computeTotals() {
  const pts = [0,0,0];
  const holesPlayed = [0,0,0];
  const playerHcps = state.players.map(p => p.hcp || 0);

  const breakdown = state.holes.map((holeNum, hi) => {
    const gross = state.scores[hi];
    const hd    = state.holeData[holeNum] || {};
    const hcpRating = hd.hcpRating || 0;
    const par       = hd.par || 4;
    const hp  = holePoints(gross, playerHcps, hcpRating);
    const nets = gross.map((g,i) => g !== null ? g - strokesOnHole(playerHcps[i], hcpRating) : null);
    const strokes = playerHcps.map(h => strokesOnHole(h, hcpRating));
    if (hp[0] !== null) hp.forEach((p,i) => { pts[i] += p; holesPlayed[i]++; });
    return { holeNum, gross, nets, pts: hp, hcpRating, par, strokes };
  });
  return { pts, holesPlayed, breakdown };
}

// ══════════════════════════════════════════════════════════
// SCREEN 1 · SETUP
// ══════════════════════════════════════════════════════════
function renderSetup() {
  const saved = loadRound();
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
    const holeSet = document.querySelector('.tog-btn.active')?.dataset.holes || '18';
    _pendingSetup = { names, hcps, holeSet };
    renderHcpScreen(holeSet, null);
    showScreen('screen-hcp');
  });

  $('btn-resume').addEventListener('click', () => {
    state = loadRound();
    renderCard();
    showScreen('screen-card');
  });
}

// ══════════════════════════════════════════════════════════
// SCREEN 2 · HOLE INFO (par + HCP ratings)
// ══════════════════════════════════════════════════════════
let _loadedCourse = null; // currently loaded course object

function renderHcpScreen(holeSet, prefill) {
  // prefill = holeData object or null
  const holes = HOLE_SETS[holeSet];
  const grid = $('hcp-grid');
  grid.innerHTML = holes.map(h => {
    const pre = prefill ? (prefill[h] || {}) : {};
    const parVal  = pre.par       ? pre.par       : '';
    const hcpVal  = pre.hcpRating ? pre.hcpRating : '';
    return `
      <div class="hcp-hole-row">
        <span class="hcp-hole-num ${h <= 9 ? 'front' : 'back'}">H${h}</span>
        <input class="hcp-cell-input ${parVal ? 'par-filled' : ''}"
               id="par-${h}" type="number" min="3" max="6"
               placeholder="par" inputmode="numeric"
               value="${parVal}" data-hole="${h}" data-type="par" />
        <input class="hcp-cell-input ${hcpVal ? 'filled' : ''}"
               id="hcpr-${h}" type="number" min="1" max="18"
               placeholder="hcp" inputmode="numeric"
               value="${hcpVal}" data-hole="${h}" data-type="hcpr" />
      </div>`;
  }).join('');

  grid.querySelectorAll('.hcp-cell-input').forEach(inp => {
    inp.addEventListener('input', () => {
      if (inp.dataset.type === 'par') inp.classList.toggle('par-filled', inp.value !== '');
      else inp.classList.toggle('filled', inp.value !== '');
    });
  });

  updateLoadedCourseBanner();
}

function updateLoadedCourseBanner() {
  const bar = $('loaded-course-bar');
  if (_loadedCourse) {
    bar.style.display = 'flex';
    $('loaded-course-name').textContent = _loadedCourse.name;
    $('hcp-screen-sub').textContent = _loadedCourse.name;
  } else {
    bar.style.display = 'none';
    $('hcp-screen-sub').textContent = 'Par & HCP ratings per hole';
  }
}

function readHoleData() {
  const holeData = {};
  document.querySelectorAll('.hcp-cell-input[data-type="par"]').forEach(inp => {
    const hole = parseInt(inp.dataset.hole);
    if (!holeData[hole]) holeData[hole] = {};
    const v = parseInt(inp.value);
    holeData[hole].par = (v >= 3 && v <= 6) ? v : 4;
  });
  document.querySelectorAll('.hcp-cell-input[data-type="hcpr"]').forEach(inp => {
    const hole = parseInt(inp.dataset.hole);
    if (!holeData[hole]) holeData[hole] = {};
    const v = parseInt(inp.value);
    if (v >= 1 && v <= 18) holeData[hole].hcpRating = v;
  });
  return holeData;
}

function wireHcpScreen() {
  $('btn-hcp-back').addEventListener('click', () => {
    _loadedCourse = null;
    showScreen('screen-setup');
  });

  $('btn-hcp-courses').addEventListener('click', () => {
    renderCoursesList();
    showScreen('screen-courses');
  });

  $('btn-clear-course').addEventListener('click', () => {
    _loadedCourse = null;
    const holeSet = _pendingSetup?.holeSet || '18';
    renderHcpScreen(holeSet, null);
  });

  $('btn-save-course').addEventListener('click', () => {
    const name = $('course-name-input').value.trim();
    if (!name) { toast('Enter a course name first'); return; }
    const holeData = readHoleData();
    saveCourse(name, holeData);
    $('course-name-input').value = '';
    _loadedCourse = { name };
    updateLoadedCourseBanner();
    toast(`"${name}" saved!`);
  });

  $('btn-start').addEventListener('click', () => {
    if (!_pendingSetup) { showScreen('screen-setup'); return; }
    const holeData = readHoleData();
    const players = _pendingSetup.names.map((name, i) => ({
      name, color: P_COLORS[i], hcp: _pendingSetup.hcps[i]
    }));
    state = initState(players, _pendingSetup.holeSet, holeData);
    saveRound();
    renderCard();
    showScreen('screen-card');
  });
}

// ══════════════════════════════════════════════════════════
// SCREEN 2b · SAVED COURSES LIST
// ══════════════════════════════════════════════════════════
function renderCoursesList() {
  const courses = loadCourses();
  const list = $('courses-list');
  const noMsg = $('no-courses-msg');
  const countSub = $('courses-count-sub');

  countSub.textContent = courses.length === 0 ? 'No courses saved'
    : `${courses.length} course${courses.length !== 1 ? 's' : ''} saved`;

  if (courses.length === 0) {
    list.innerHTML = '';
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';

  // Sort newest first
  const sorted = [...courses].sort((a,b) => b.savedAt - a.savedAt);

  list.innerHTML = sorted.map(course => {
    const allHoles = Object.keys(course.holeData).map(Number).sort((a,b) => a-b);
    const holeCount = allHoles.length;
    const isExpanded = _expandedCourse === course.id;

    const previewHoles = allHoles.slice(0, 9);
    const previewHoles2 = allHoles.slice(9, 18);

    const savedDate = new Date(course.savedAt).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});

    return `
      <div class="course-card" id="cc-${course.id}">
        <div class="course-card-header" data-course-id="${course.id}">
          <div class="course-card-icon">🏌️</div>
          <div class="course-card-info">
            <div class="course-card-name">${course.name}</div>
            <div class="course-card-meta">${holeCount} holes · Saved ${savedDate}</div>
          </div>
          <div class="course-card-arrow">${isExpanded ? '▲' : '▼'}</div>
        </div>
        <div class="course-holes-preview ${isExpanded ? 'open' : ''}" id="chp-${course.id}">
          ${buildHolePreviewGrid(course.holeData, previewHoles, 'Front')}
          ${previewHoles2.length ? buildHolePreviewGrid(course.holeData, previewHoles2, 'Back') : ''}
        </div>
        <div class="course-card-actions">
          <button class="course-action-btn load" data-course-id="${course.id}">Load Course</button>
          <button class="course-action-btn delete" data-course-id="${course.id}">Delete</button>
        </div>
      </div>`;
  }).join('');

  // Wire expand toggles
  list.querySelectorAll('.course-card-header').forEach(h => {
    h.addEventListener('click', () => {
      const id = h.dataset.courseId;
      _expandedCourse = (_expandedCourse === id) ? null : id;
      renderCoursesList();
    });
  });

  // Wire load buttons
  list.querySelectorAll('.course-action-btn.load').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.courseId;
      const course = courses.find(c => c.id === id);
      if (!course) return;
      _loadedCourse = course;
      const holeSet = _pendingSetup?.holeSet || '18';
      renderHcpScreen(holeSet, course.holeData);
      showScreen('screen-hcp');
      toast(`Loaded "${course.name}"`);
    });
  });

  // Wire delete buttons
  list.querySelectorAll('.course-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.courseId;
      const course = courses.find(c => c.id === id);
      if (!course) return;
      if (!confirm(`Delete "${course.name}"?`)) return;
      deleteCourse(id);
      if (_expandedCourse === id) _expandedCourse = null;
      renderCoursesList();
      toast(`"${course.name}" deleted`);
    });
  });
}

function buildHolePreviewGrid(holeData, holes, label) {
  return `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:6px">${label} 9</div>
      <div class="chp-grid">
        ${holes.map(h => {
          const hd = holeData[h] || {};
          return `
            <div class="chp-cell">
              <div class="chp-num">H${h}</div>
              <div class="chp-par">${hd.par || '—'}</div>
              <div class="chp-hcpr">${hd.hcpRating || '—'}</div>
            </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:16px;margin-top:6px;font-size:10px;color:var(--text3)">
        <span><span style="color:var(--gold)">■</span> Par</span>
        <span><span style="color:var(--text2)">■</span> HCP Rating</span>
      </div>
    </div>`;
}

function wireCoursesList() {
  $('btn-courses-back').addEventListener('click', () => showScreen('screen-hcp'));
}

// ══════════════════════════════════════════════════════════
// SCREEN 3 · SCORECARD
// ══════════════════════════════════════════════════════════
function renderCard() {
  const { pts, holesPlayed, breakdown } = computeTotals();
  const total  = state.holes.length;
  const played = holesPlayed[0];

  $('card-sub').textContent = played === total
    ? 'Round complete' : `${played} of ${total} holes played`;

  $('totals-strip').innerHTML = state.players.map((p,i) => `
    <div class="total-cell">
      <div class="tc-name" style="color:${p.color}">${p.name}</div>
      <div class="tc-pts" style="color:${p.color}">${pts[i]}</div>
      <div class="tc-hcp">HCP ${p.hcp || 0}</div>
    </div>`).join('');

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
        </div>`).join('')}
    </div>`;
  return div;
}

function buildHoleCard(b, hi) {
  const card = document.createElement('div');
  const allScored = b.gross.every(s => s !== null);
  const hasAny    = b.gross.some(s => s !== null);
  card.className = 'hole-card' + (hasAny ? ' has-scores' : '');
  card.dataset.hi = hi;

  const parTxt = b.par ? `Par ${b.par}` : '';
  const hcpTxt = b.hcpRating ? `HCP ${b.hcpRating}` : '';
  const metaTxt = [parTxt, hcpTxt].filter(Boolean).join(' · ');

  card.innerHTML = `
    <div class="hole-card-header">
      <span class="hole-num">${b.holeNum}</span>
      <div class="hole-meta">
        <div class="hole-label">Hole ${b.holeNum}</div>
        ${metaTxt ? `<div class="hole-par-hcp">${metaTxt}</div>` : ''}
      </div>
    </div>
    <div class="hole-card-body">
      ${state.players.map((p,i) => {
        const gross  = b.gross[i];
        const net    = b.nets[i];
        const strk   = b.strokes[i];
        const pts    = b.pts[i];
        const ptsClass = pts !== null ? `pts-${pts}` : 'pts-dash';
        const ptsStr   = pts !== null ? pts : '—';
        const netHtml  = net !== null
          ? `<span class="net-num">net ${net}</span>${strk > 0 ? `<span class="stroke-pips">${'●'.repeat(strk)}</span>` : ''}`
          : '';
        return `
          <div class="score-row">
            <span class="score-name" style="color:${p.color}">${p.name}</span>
            <div class="score-controls">
              <button class="score-btn" data-hi="${hi}" data-pi="${i}" data-dir="-1">−</button>
              <span class="score-val" id="sv-${hi}-${i}">${gross !== null ? gross : '—'}</span>
              <button class="score-btn" data-hi="${hi}" data-pi="${i}" data-dir="1">+</button>
            </div>
            <div class="net-val">${netHtml}</div>
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
    <div class="rules-header">Points System — based on net scores · 9 pts per hole</div>
    <div class="rules-row"><span class="rules-pts pts-5">5</span><span class="rules-desc">Low net score alone</span></div>
    <div class="rules-row"><span class="rules-pts pts-4">4</span><span class="rules-desc">Tie for low net (2 players) — each</span></div>
    <div class="rules-row"><span class="rules-pts pts-3">3</span><span class="rules-desc">All three tied — each</span></div>
    <div class="rules-row"><span class="rules-pts pts-2">2</span><span class="rules-desc">Tie for high net (2 players) — each</span></div>
    <div class="rules-row"><span class="rules-pts pts-1">1</span><span class="rules-desc">High net score alone</span></div>
    <div class="rules-row" style="padding:8px 16px"><span style="font-size:11px;color:var(--text3)">● gold dot = handicap stroke received on that hole</span></div>`;
  return div;
}

function wireCard() {
  $('btn-card-back').addEventListener('click', () => { renderSetup(); showScreen('screen-setup'); });
  $('btn-leaderboard-link').addEventListener('click', () => { renderLeaderboard(); showScreen('screen-lead'); });

  $('hole-cards').addEventListener('click', e => {
    const btn = e.target.closest('.score-btn');
    if (!btn) return;
    const hi  = parseInt(btn.dataset.hi);
    const pi  = parseInt(btn.dataset.pi);
    const dir = parseInt(btn.dataset.dir);
    const cur = state.scores[hi][pi];
    const next = cur === null ? (dir === 1 ? 3 : null) : Math.max(1, cur + dir);
    if (next === null) return;
    state.scores[hi][pi] = next;
    saveRound();
    renderCard();
  });
}

// ══════════════════════════════════════════════════════════
// SCREEN 4 · LEADERBOARD
// ══════════════════════════════════════════════════════════
function renderLeaderboard() {
  const { pts, holesPlayed, breakdown } = computeTotals();
  const total  = state.holes.length;
  const played = holesPlayed[0];
  $('lead-sub').textContent = played === total ? 'Final Scores' : `${played} of ${total} holes`;

  const ranked = state.players.map((p,i) => ({...p, pts: pts[i], played: holesPlayed[i]}))
    .sort((a,b) => b.pts - a.pts);

  const rankIcons = ['🥇','🥈','🥉'];
  const rankCls   = ['r1','r2','r3'];

  let html = `<div class="lead-table">`;
  ranked.forEach((p,ri) => {
    html += `
      <div class="lead-row ${ri===0 && p.pts>0 ? 'lead-1st' : ''}">
        <div class="lead-rank ${rankCls[ri]}">${rankIcons[ri]||ri+1}</div>
        <div class="lead-color" style="background:${p.color}"></div>
        <div class="lead-name">${p.name}<br><span style="font-size:11px;color:var(--text3);font-weight:400">HCP ${p.hcp||0}</span></div>
        <div class="lead-stats">
          <div class="lead-pts-big" style="color:${p.color}">${p.pts}</div>
          <div class="lead-detail">${p.pts} pts · ${p.played} holes</div>
        </div>
      </div>`;
  });
  html += `</div>`;

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
      html += `<div class="pb-cell pb-hcp-r">${b.hcpRating||'—'}</div>`;
      b.pts.forEach(pt => { html += `<div class="pb-cell pts-${pt}" style="font-weight:700">${pt}</div>`; });
    });
    html += `</div></div>`;
  }

  html += `<button class="finish-btn" id="btn-finish">${played===total ? '🏆 Final Results' : 'Finish Round'}</button>`;
  $('lead-content').innerHTML = html;
  $('btn-finish').addEventListener('click', () => {
    state.finished = true;
    saveRound();
    renderWinner();
    showScreen('screen-winner');
  });
}

function wireLead() {
  $('btn-lead-back').addEventListener('click', () => { renderCard(); showScreen('screen-card'); });
  $('btn-lead-refresh').addEventListener('click', renderLeaderboard);
}

// ══════════════════════════════════════════════════════════
// SCREEN 5 · WINNER
// ══════════════════════════════════════════════════════════
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
    localStorage.removeItem(ROUND_KEY);
    state = null;
    renderSetup();
    showScreen('screen-setup');
  });
}

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
function boot() {
  wireSetup();
  wireHcpScreen();
  wireCoursesList();
  wireCard();
  wireLead();
  renderSetup();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  showScreen('screen-setup');
}

document.addEventListener('DOMContentLoaded', boot);
