import { $, fmt, load, best, copyText } from '../util.js';

const FLAG_COLORS = ['#5ea2ff', '#e8eefc', '#ff5f7a', '#3ddc97', '#ffc46b'];

export function mount(root) {
  let bestScore = load('breakout:best', 0);
  let destroyed = false;

  root.innerHTML = `
    <div class="g-wrap g-pad" id="boRoot">
      <div class="g-head">
        <div><h2>Himalaya Breakout</h2><p class="sub">Break the prayer-flag wall, brick by brick. Three lives, rising speed.</p></div>
        <div class="g-row end">
          <div class="stat"><b id="boScore">0</b><span>SCORE</span></div>
          <div class="stat"><b id="boLives">3</b><span>LIVES</span></div>
          <div class="stat"><b id="boLevel">1</b><span>LEVEL</span></div>
          <div class="stat accent"><b id="boBest">${fmt(bestScore)}</b><span>BEST</span></div>
        </div>
      </div>
      <div class="bo-stage" id="boStage">
        <canvas class="bo-canvas" id="boCanvas" aria-label="Himalaya Breakout game. Move the paddle with mouse, touch or arrow keys. Click or space to launch."></canvas>
      </div>
      <p class="g-hint">MOUSE / TOUCH / ARROWS · CLICK OR SPACE TO LAUNCH</p>
    </div>`;

  const canvas = $('#boCanvas', root);
  const ctx = canvas.getContext('2d');
  const stage = $('#boStage', root);
  const scoreEl = $('#boScore', root);
  const livesEl = $('#boLives', root);
  const levelEl = $('#boLevel', root);
  const bestEl = $('#boBest', root);

  let W = 0, H = 0, DPR = 1;
  let paddle = { x: 0, w: 90, h: 12 };
  let ball = { x: 0, y: 0, vx: 0, vy: 0, r: 6, stuck: true };
  let bricks = [];
  let brickLayer = null;
  let particles = [];
  let score = 0, lives = 3, level = 1;
  let running = false, over = false;
  let keys = { left: false, right: false };
  let last = performance.now(), raf = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(260, rect.width);
    H = Math.max(280, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    paddle.w = Math.max(72, Math.min(130, W * 0.17));
    paddle.x = Math.min(Math.max(paddle.x, 0), W - paddle.w);
    if (ball.stuck) restBall();
  }

  const speed = () => Math.min(520, 250 + level * 35);

  function buildBricks() {
    bricks = [];
    const cols = 10, rows = 5;
    const gap = 4, top = 46;
    const bw = (W - gap * (cols + 1)) / cols;
    const bh = Math.max(12, Math.min(18, H * 0.035));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        bricks.push({ x: gap + c * (bw + gap), y: top + r * (bh + gap), w: bw, h: bh, color: FLAG_COLORS[r], alive: true });
    paintBricks();
  }

  // glow is expensive per frame; bake the wall once and repaint only on a hit
  function paintBricks() {
    brickLayer = document.createElement('canvas');
    brickLayer.width = canvas.width;
    brickLayer.height = canvas.height;
    const c = brickLayer.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const b of bricks) {
      if (!b.alive) continue;
      c.save();
      c.shadowColor = b.color; c.shadowBlur = 6;
      c.fillStyle = b.color;
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 3); c.fill();
      c.restore();
    }
  }

  function restBall() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = H - 30 - ball.r - 2;
    ball.vx = 0; ball.vy = 0; ball.stuck = true;
  }

  function reset(full) {
    stage.querySelectorAll('.overlay').forEach((o) => o.remove());
    if (full) { score = 0; lives = 3; level = 1; }
    particles = [];
    buildBricks();
    paddle.x = W / 2 - paddle.w / 2;
    restBall();
    over = false;
    hud();
  }

  function hud() {
    scoreEl.textContent = fmt(score);
    livesEl.textContent = lives;
    levelEl.textContent = level;
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
      <h3>Himalaya Breakout</h3>
      <p>Five rows of prayer-flag bricks stand between you and the summit. Keep the ball alive with the paddle; clear the wall to climb a level. Three lives.</p>
      <div class="overlay-actions"><button type="button" class="btn primary" id="boStart">Play</button></div>`);
    $('#boStart', ov).addEventListener('click', () => { ov.remove(); running = true; });
  }

  function endOverlay() {
    const b = best('breakout:best', score);
    bestScore = b.value;
    hud();
    const ov = overlay(`
      <h3>Wall holds</h3>
      <div class="score-big">${fmt(score)}</div>
      <p>${b.isNew ? 'New personal best. ' : ''}Reached level ${level}.</p>
      <div class="overlay-actions">
        <button type="button" class="btn primary" id="boAgain">Play again</button>
        <button type="button" class="btn" id="boCopy">Copy result</button>
        <a class="btn" href="./">Arcade home</a>
      </div>`);
    $('#boAgain', ov).addEventListener('click', () => { reset(true); running = true; });
    $('#boCopy', ov).addEventListener('click', () =>
      copyText(`Himalaya Breakout — ${score} pts, level ${level}. Play: ${location.origin}/arcade/index.html?game=himalaya-breakout`));
  }

  function levelOverlay() {
    const ov = overlay(`
      <h3>Level ${level} cleared</h3>
      <p>The wall rebuilds higher and the ball flies faster. +50 points.</p>
      <div class="overlay-actions"><button type="button" class="btn primary" id="boNext">Climb on</button></div>`);
    $('#boNext', ov).addEventListener('click', () => {
      ov.remove();
      level++; score += 50;
      buildBricks(); restBall(); hud();
      running = true;
    });
  }

  function launch() {
    if (!ball.stuck || over || !running) return;
    const a = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
    ball.vx = Math.cos(a) * speed();
    ball.vy = Math.sin(a) * speed();
    ball.stuck = false;
  }

  function burst(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color });
    }
  }

  function step(dt) {
    if (keys.left) paddle.x -= 420 * dt;
    if (keys.right) paddle.x += 420 * dt;
    paddle.x = Math.min(Math.max(paddle.x, 0), W - paddle.w);
    if (ball.stuck) { restBall(); return; }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }

    const py = H - 30;
    if (ball.vy > 0 && ball.y + ball.r >= py && ball.y + ball.r <= py + paddle.h + 10 &&
        ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
      const k = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const a = -Math.PI / 2 + k * 1.05;
      const s = speed();
      ball.vx = Math.cos(a) * s;
      ball.vy = Math.sin(a) * s;
      ball.y = py - ball.r;
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w && ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
        b.alive = false;
        score += 10;
        burst(b.x + b.w / 2, b.y + b.h / 2, b.color);
        paintBricks();
        const overlapX = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
        const overlapY = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
        if (overlapX < overlapY) ball.vx = -ball.vx; else ball.vy = -ball.vy;
        hud();
        break;
      }
    }

    if (bricks.every((b) => !b.alive)) { running = false; levelOverlay(); return; }

    if (ball.y > H + ball.r * 2) {
      lives--;
      hud();
      if (lives <= 0) { over = true; running = false; endOverlay(); }
      else restBall();
    }

    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1020');
    g.addColorStop(1, '#070b12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (brickLayer) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(brickLayer, 0, 0);
      ctx.restore();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.shadowColor = '#35e0ff'; ctx.shadowBlur = 12;
    const pg = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    pg.addColorStop(0, '#35e0ff'); pg.addColorStop(1, '#7c5cff');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.roundRect(paddle.x, H - 30, paddle.w, paddle.h, 6); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
    ctx.restore();
  }

  function loop(t) {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (running && !over) step(dt);
    draw();
  }

  function onKey(e) {
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    else if (e.key === ' ') {
      e.preventDefault();
      if (over) { reset(true); running = true; }
      else if (!running) { stage.querySelectorAll('.overlay').forEach((o) => o.remove()); running = true; }
      else launch();
    }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  }
  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    paddle.x = e.clientX - rect.left - paddle.w / 2;
    paddle.x = Math.min(Math.max(paddle.x, 0), W - paddle.w);
  }
  function onTouch(e) {
    const rect = canvas.getBoundingClientRect();
    paddle.x = e.touches[0].clientX - rect.left - paddle.w / 2;
    paddle.x = Math.min(Math.max(paddle.x, 0), W - paddle.w);
    e.preventDefault();
  }
  function onClick() {
    if (!running && !over) { stage.querySelectorAll('.overlay').forEach((o) => o.remove()); running = true; }
    else launch();
  }

  resize();
  reset(true);
  startOverlay();
  raf = requestAnimationFrame(loop);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('touchmove', onTouch, { passive: false });
  canvas.addEventListener('click', onClick);

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('touchmove', onTouch);
    canvas.removeEventListener('click', onClick);
  };
}