import { MERGE_TILES } from '../data.js';
import { $, esc, fmt, load, save, toast } from '../util.js';

const N = 4;
const WIN = 2048;

function slideLine(vals) {
  const nums = vals.filter(Boolean);
  const out = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i < nums.length - 1 && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      out.push(v);
      gained += v;
      i++;
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < N) out.push(0);
  return { out, gained };
}

export function mount(root) {
  let board = Array(N * N).fill(0);
  let score = 0;
  let best = load('merge:best', 0);
  let won = false;
  let over = false;
  let newAt = -1;
  let mergedAt = new Set();
  let destroyed = false;

  const tileFor = (v) => MERGE_TILES.find((t) => t.v === v);
  const colorFor = (v) => tileFor(v)?.color || '#2a3a52';
  const nameFor = (v) => tileFor(v)?.name || String(v);

  root.innerHTML = `
    <div class="g-wrap g-pad" id="mhRoot">
      <div class="g-head">
        <div>
          <h2>Merge Himalaya</h2>
          <p class="sub">Merge matching tiles to climb the ladder — a 2048 tile reaches the Himalaya.</p>
        </div>
        <div class="g-row end">
          <div class="stat"><b id="mhScore">0</b><span>SCORE</span></div>
          <div class="stat accent"><b id="mhBest">${fmt(best)}</b><span>BEST</span></div>
          <button type="button" class="btn small" id="mhNew">New game</button>
        </div>
      </div>
      <div class="mh-grid">
        <div class="mh-boardwrap">
          <div class="mh-board" id="mhBoard" role="grid" aria-label="Merge Himalaya board, 4 by 4"></div>
        </div>
        <div class="mh-side">
          <div class="mh-ladder">
            <h4>THE LADDER</h4>
            <ol id="mhLadder">
              ${MERGE_TILES.map((t) => `<li><i style="background:${t.color}"></i><span>${esc(t.name)}</span><b style="margin-left:auto;color:var(--dim);font-weight:600">${t.v}</b></li>`).join('')}
            </ol>
          </div>
          <div class="mh-dpad" aria-label="Move controls">
            <button type="button" class="up" data-dir="up" aria-label="Move up">↑</button>
            <button type="button" data-dir="left" aria-label="Move left">←</button>
            <button type="button" data-dir="down" aria-label="Move down">↓</button>
            <button type="button" data-dir="right" aria-label="Move right">→</button>
          </div>
          <p class="small dim" style="margin:0;line-height:1.5">Swipe, use the arrow keys or WASD. Every new expedition starts with two tiles.</p>
        </div>
      </div>
    </div>`;

  const boardEl = $('#mhBoard', root);
  const scoreEl = $('#mhScore', root);
  const bestEl = $('#mhBest', root);
  const overlayHost = $('#mhRoot', root);

  const cells = Array.from({ length: N * N }, () => '<div class="mh-cell"></div>').join('');

  function render() {
    const tiles = board.map((v, i) => {
      if (!v) return '';
      const x = i % N;
      const y = Math.floor(i / N);
      const cls = `mh-tile${i === newAt ? ' new' : ''}`;
      return `<div class="${cls}" data-v="${v}" style="left:calc(8px + ${x} * (25% - 2px));top:calc(8px + ${y} * (25% - 2px));background:${colorFor(v)}"><b>${v}</b><span>${esc(nameFor(v))}</span></div>`;
    }).join('');
    boardEl.innerHTML = cells + tiles;
    scoreEl.textContent = fmt(score);
    bestEl.textContent = fmt(best);
  }

  const empties = () => board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

  function spawn() {
    const free = empties();
    if (!free.length) return;
    const idx = free[Math.floor(Math.random() * free.length)];
    board[idx] = Math.random() < 0.9 ? 2 : 4;
    newAt = idx;
  }

  function canMove() {
    if (board.some((v) => !v)) return true;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = board[y * N + x];
        if (x < N - 1 && board[y * N + x + 1] === v) return true;
        if (y < N - 1 && board[(y + 1) * N + x] === v) return true;
      }
    }
    return false;
  }

  function move(dir) {
    if (over || destroyed) return;
    const before = board.slice();
    let gained = 0;
    const merged = new Set();

    for (let line = 0; line < N; line++) {
      const idxs = [];
      for (let k = 0; k < N; k++) {
        if (dir === 'left') idxs.push(line * N + k);
        else if (dir === 'right') idxs.push(line * N + (N - 1 - k));
        else if (dir === 'up') idxs.push(k * N + line);
        else idxs.push((N - 1 - k) * N + line);
      }
      const vals = idxs.map((i) => board[i]);
      const res = slideLine(vals);
      gained += res.gained;
      idxs.forEach((idx, k) => { board[idx] = res.out[k]; });
      // highlight cells whose value was produced by a merge
      for (let k = 0; k < N; k++) {
        const val = res.out[k];
        if (val && k > 0 && res.out[k - 1] === val) merged.add(idxs[k]);
      }
    }

    const moved = board.some((v, i) => v !== before[i]);
    if (!moved) {
      board = before;
      return;
    }

    score += gained;
    if (score > best) {
      best = score;
      save('merge:best', best);
    }
    newAt = -1;
    mergedAt = merged;
    if (!won && board.some((v) => v >= WIN)) {
      won = true;
      spawn();
      render();
      winScreen();
      return;
    }
    spawn();
    render();
    if (!canMove()) {
      over = true;
      setTimeout(gameOver, 220);
    }
  }

  function clearOverlays() {
    overlayHost.querySelectorAll('.overlay').forEach((o) => o.remove());
  }

  function winScreen() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="Himalaya reached">
        <p class="kicker" style="margin-bottom:10px">2,048 · SUMMIT</p>
        <h3>You reached the Himalaya.</h3>
        <p>The 2048 tile is on the board. The expedition can keep going — the ladder does not end at the summit.</p>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="mhKeep">Keep climbing</button>
          <button type="button" class="btn" id="mhFresh">New game</button>
        </div>
      </div>`;
    overlayHost.appendChild(ov);
    ov.querySelector('#mhKeep').addEventListener('click', () => { ov.remove(); });
    ov.querySelector('#mhFresh').addEventListener('click', () => { ov.remove(); reset(); });
    ov.querySelector('#mhKeep').focus();
  }

  function gameOver() {
    clearOverlays();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="No moves left">
        <p class="kicker" style="margin-bottom:10px">NO MOVES LEFT</p>
        <h3>The expedition ends here.</h3>
        <div class="score-big">${fmt(score)}</div>
        <p>Best score: <b>${fmt(best)}</b>. Reach 2048 to plant the ACTTOLOG flag on the summit.</p>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="mhAgain">Play again</button>
          <a class="btn" href="./">Arcade home</a>
        </div>
      </div>`;
    overlayHost.appendChild(ov);
    ov.querySelector('#mhAgain').addEventListener('click', () => { ov.remove(); reset(); });
    ov.querySelector('#mhAgain').focus();
  }

  function reset() {
    board = Array(N * N).fill(0);
    score = 0;
    won = false;
    over = false;
    newAt = -1;
    mergedAt = new Set();
    clearOverlays();
    spawn();
    newAt = -1;
    spawn();
    newAt = -1;
    render();
  }

  const keyHandler = (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  };

  let touchStart = null;
  const onTouchStart = (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    e.preventDefault();
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  root.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => move(b.dataset.dir)));
  $('#mhNew', root).addEventListener('click', reset);
  window.addEventListener('keydown', keyHandler);
  boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
  boardEl.addEventListener('touchend', onTouchEnd, { passive: false });

  reset();
  render();

  return () => {
    destroyed = true;
    window.removeEventListener('keydown', keyHandler);
    boardEl.removeEventListener('touchstart', onTouchStart);
    boardEl.removeEventListener('touchend', onTouchEnd);
  };
}
