import { $, fmt, load, best, reduceMotion, copyText } from '../util.js';

const COLS = 21;
const ROWS = 21;

export function mount(root) {
  let bestScore = load('snake:best', 0);
  let destroyed = false;

  root.innerHTML = `
    <div class="g-wrap g-pad" id="snRoot">
      <div class="g-head">
        <div><h2>Snake Himalaya</h2><p class="sub">Neon trail across the high grid. Eat momo, grow long, don't bite yourself.</p></div>
        <div class="g-row end">
          <div class="stat"><b id="snScore">0</b><span>SCORE</span></div>
          <div class="stat"><b id="snLen">3</b><span>LENGTH</span></div>
          <div class="stat accent"><b id="snBest">${fmt(bestScore)}</b><span>BEST</span></div>
        </div>
      </div>
      <div class="sn-stage" id="snStage">
        <canvas class="sn-canvas" id="snCanvas" aria-label="Snake Himalaya game. Arrow keys, WASD or swipe to steer."></canvas>
      </div>
      <p class="g-hint">ARROWS / WASD / SWIPE · SPACE TO START · P TO PAUSE</p>
    </div>`;

  const canvas = $('#snCanvas', root);
  const ctx = canvas.getContext('2d');
  const stage = $('#snStage', root);
  const scoreEl = $('#snScore', root);
  const lenEl = $('#snLen', root);
  const bestEl = $('#snBest', root);

  let W = 0, H = 0, DPR = 1, cell = 0, ox = 0, oy = 0;
  let snake = [], dir = { x: 1, y: 0 }, queue = [];
  let food = { x: 14, y: 10 };
  let score = 0, eaten = 0;
  let running = false, paused = false, over = false;
  let acc = 0, last = performance.now(), raf = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(260, rect.width);
    H = Math.max(260, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cell = Math.floor(Math.min(W / COLS, H / ROWS));
    ox = (W - cell * COLS) / 2;
    oy = (H - cell * ROWS) / 2;
  }

  const interval = () => Math.max(70, 150 - eaten * 3);

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    food = free[Math.floor(Math.random() * free.length)] || { x: 0, y: 0 };
  }

  function reset() {
    stage.querySelectorAll('.overlay').forEach((o) => o.remove());
    snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
    dir = { x: 1, y: 0 };
    queue = [];
    score = 0; eaten = 0;
    over = false; paused = false;
    placeFood();
    hud();
  }

  function hud() {
    scoreEl.textContent = fmt(score);
    lenEl.textContent = snake.length;
    bestEl.textContent = fmt(bestScore);
  }

  function overlay(html) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="overlay-card" role="dialog" aria-modal="true">${html}</div>`;
    stage.appendChild(ov);
    return ov;
  }

  function startOverlay() {
    const ov = overlay(`
      <h3>Snake Himalaya</h3>
      <p>Steer the neon snake across the high grid. Every momo you eat grows the trail and quickens the pulse. Walls and your own tail end the run.</p>
      <div class="overlay-actions">
        <button type="button" class="btn primary" id="snStart">Start run</button>
      </div>`);
    $('#snStart', ov).addEventListener('click', () => { ov.remove(); running = true; });
  }

  function endOverlay() {
    const b = best('snake:best', score);
    bestScore = b.value;
    hud();
    const ov = overlay(`
      <h3>Trail ended</h3>
      <div class="score-big">${fmt(score)}</div>
      <p>${b.isNew ? 'New personal best. ' : ''}Length ${snake.length} · ${eaten} momo eaten.</p>
      <div class="overlay-actions">
        <button type="button" class="btn primary" id="snAgain">Run again</button>
        <button type="button" class="btn" id="snCopy">Copy result</button>
        <a class="btn" href="./">Arcade home</a>
      </div>`);
    $('#snAgain', ov).addEventListener('click', () => { reset(); running = true; });
    $('#snCopy', ov).addEventListener('click', () =>
      copyText(`Snake Himalaya — ${score} pts, length ${snake.length}. Play: ${location.origin}/arcade/index.html?game=snake-himalaya`));
  }

  function steer(x, y) {
    const lastDir = queue.length ? queue[queue.length - 1] : dir;
    if (lastDir.x === -x && lastDir.y === -y) return;
    if (lastDir.x === x && lastDir.y === y) return;
    if (queue.length < 3) queue.push({ x, y });
  }

  function tick() {
    if (queue.length) dir = queue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS ||
        snake.some((s) => s.x === head.x && s.y === head.y)) {
      over = true; running = false;
      endOverlay();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      eaten++; score += 10;
      placeFood();
    } else snake.pop();
    hud();
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(140,170,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(ox + x * cell, oy); ctx.lineTo(ox + x * cell, oy + ROWS * cell); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(ox, oy + y * cell); ctx.lineTo(ox + COLS * cell, oy + y * cell); ctx.stroke();
    }
    // momo
    const fx = ox + food.x * cell + cell / 2, fy = oy + food.y * cell + cell / 2;
    const pulse = reduceMotion() ? 0.5 : (Math.sin(t / 300) + 1) / 2;
    ctx.save();
    ctx.shadowColor = '#ffc46b';
    ctx.shadowBlur = 10 + pulse * 8;
    ctx.fillStyle = '#ffe3b3';
    ctx.beginPath();
    ctx.arc(fx, fy + cell * 0.06, cell * 0.32, Math.PI, 0);
    ctx.lineTo(fx + cell * 0.32, fy + cell * 0.18);
    ctx.lineTo(fx - cell * 0.32, fy + cell * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d9a05b';
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(fx + i * cell * 0.14, fy - cell * 0.24);
      ctx.lineTo(fx + i * cell * 0.18, fy + cell * 0.1);
      ctx.stroke();
    }
    ctx.restore();
    // snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const k = i / Math.max(1, snake.length - 1);
      const r = Math.round(61 + (56 - 61) * k), g = Math.round(220 + (223 - 220) * k), b = Math.round(151 + (255 - 151) * k);
      ctx.save();
      if (i === 0) { ctx.shadowColor = '#3ddc97'; ctx.shadowBlur = 14; }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const pad = i === 0 ? 1 : 2;
      const rr = cell * (i === 0 ? 0.32 : 0.26);
      const x = ox + s.x * cell + pad, y = oy + s.y * cell + pad, w = cell - pad * 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, w, rr);
      ctx.fill();
      ctx.restore();
      if (i === 0) {
        ctx.fillStyle = '#041008';
        const ex = ox + s.x * cell + cell / 2, ey = oy + s.y * cell + cell / 2;
        ctx.beginPath(); ctx.arc(ex + dir.x * cell * 0.14 - dir.y * cell * 0.14, ey + dir.y * cell * 0.14 - dir.x * cell * 0.14, cell * 0.07, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + dir.x * cell * 0.14 + dir.y * cell * 0.14, ey + dir.y * cell * 0.14 + dir.x * cell * 0.14, cell * 0.07, 0, 7); ctx.fill();
      }
    }
    if (paused && running) {
      ctx.fillStyle = 'rgba(5,7,11,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e8eeff';
      ctx.font = '700 20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED — P TO RESUME', W / 2, H / 2);
    }
  }

  function loop(t) {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(100, t - last);
    last = t;
    if (running && !paused && !over) {
      acc += dt;
      while (acc >= interval()) { acc -= interval(); tick(); if (over) break; }
    }
    draw(t);
  }

  function onKey(e) {
    const k = e.key;
    const map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
    };
    if (map[k]) { e.preventDefault(); steer(...map[k]); }
    else if (k === ' ') {
      e.preventDefault();
      if (over) { reset(); running = true; }
      else if (!running) { stage.querySelectorAll('.overlay').forEach((o) => o.remove()); running = true; }
    } else if (k === 'p' || k === 'P') paused = !paused;
  }

  let touchStart = null;
  function onTouchStart(e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
      if (!running && !over) { stage.querySelectorAll('.overlay').forEach((o) => o.remove()); running = true; }
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1, 0);
    else steer(0, dy > 0 ? 1 : -1);
  }

  resize();
  reset();
  startOverlay();
  raf = requestAnimationFrame(loop);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchend', onTouchEnd);
  };
}