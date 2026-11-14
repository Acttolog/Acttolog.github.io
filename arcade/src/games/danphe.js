import { $, fmt, load, best, reduceMotion, copyText } from '../util.js';

export function mount(root) {
  let bestScore = load('danphe:best', 0);
  let destroyed = false;

  root.innerHTML = `
    <div class="g-wrap g-pad" id="dfRoot">
      <div class="g-head">
        <div><h2>Danphe Flight</h2><p class="sub">Fly the national bird between the temple pillars. One tap per wingbeat.</p></div>
        <div class="g-row end">
          <div class="stat"><b id="dfScore">0</b><span>SCORE</span></div>
          <div class="stat accent"><b id="dfBest">${fmt(bestScore)}</b><span>BEST</span></div>
        </div>
      </div>
      <div class="df-stage" id="dfStage">
        <canvas class="df-canvas" id="dfCanvas" aria-label="Danphe Flight game. Tap, click or press space to flap."></canvas>
      </div>
      <p class="g-hint">TAP / CLICK / SPACE TO FLAP</p>
    </div>`;

  const canvas = $('#dfCanvas', root);
  const ctx = canvas.getContext('2d');
  const stage = $('#dfStage', root);
  const scoreEl = $('#dfScore', root);
  const bestEl = $('#dfBest', root);

  let W = 0, H = 0, DPR = 1;
  let bird = { y: 0, vy: 0 };
  let pillars = [];
  let score = 0;
  let running = false, over = false, started = false;
  let last = performance.now(), raf = 0, wing = 0;

  const BIRD_X = () => W * 0.3;
  const R = 13;
  const GRAV = 1400;
  const FLAP = -400;
  const PW = 64;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(260, rect.width);
    H = Math.max(280, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  const gapSize = () => Math.max(140, 175 - score * 1.5);
  const speed = () => Math.min(260, 150 + score * 3);

  function reset() {
    stage.querySelectorAll('.overlay').forEach((o) => o.remove());
    bird = { y: H * 0.45, vy: 0 };
    pillars = [];
    score = 0;
    over = false; started = false;
    hud();
  }

  function hud() {
    scoreEl.textContent = fmt(score);
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
      <h3>Danphe Flight</h3>
      <p>The danphe — Nepal's Himalayan monal — glows in nine colours. Keep it airborne between the carved temple pillars. Each pillar passed is one point; the gap tightens as you score.</p>
      <div class="overlay-actions"><button type="button" class="btn primary" id="dfStart">Take off</button></div>`);
    $('#dfStart', ov).addEventListener('click', () => { ov.remove(); running = true; flap(); });
  }

  function endOverlay() {
    const b = best('danphe:best', score);
    bestScore = b.value;
    hud();
    const ov = overlay(`
      <h3>Feathers down</h3>
      <div class="score-big">${fmt(score)}</div>
      <p>${b.isNew ? 'New personal best. ' : ''}Pillars passed: ${score}.</p>
      <div class="overlay-actions">
        <button type="button" class="btn primary" id="dfAgain">Fly again</button>
        <button type="button" class="btn" id="dfCopy">Copy result</button>
        <a class="btn" href="./">Arcade home</a>
      </div>`);
    $('#dfAgain', ov).addEventListener('click', () => { reset(); running = true; flap(); });
    $('#dfCopy', ov).addEventListener('click', () =>
      copyText(`Danphe Flight — ${score} pillars. Play: ${location.origin}/arcade/index.html?game=danphe-flight`));
  }

  function flap() {
    if (over || !running) return;
    started = true;
    bird.vy = FLAP;
    wing = 1;
  }

  function spawn() {
    const gap = gapSize();
    const margin = 60;
    const gy = margin + Math.random() * (H - margin * 2 - gap);
    pillars.push({ x: W + PW, gy, gap, passed: false });
  }

  function step(dt) {
    if (!started) return;
    bird.vy += GRAV * dt;
    bird.y += bird.vy * dt;
    wing = Math.max(0, wing - dt * 4);

    const lastP = pillars[pillars.length - 1];
    if (!lastP || lastP.x < W - 240) spawn();
    for (const p of pillars) p.x -= speed() * dt;
    pillars = pillars.filter((p) => p.x > -PW - 20);

    const bx = BIRD_X();
    for (const p of pillars) {
      if (!p.passed && p.x + PW < bx - R) { p.passed = true; score++; hud(); }
      if (bx + R > p.x && bx - R < p.x + PW) {
        if (bird.y - R < p.gy || bird.y + R > p.gy + p.gap) return die();
      }
    }
    if (bird.y + R > H - 24 || bird.y - R < 0) return die();
  }

  function die() {
    over = true; running = false;
    endOverlay();
  }

  function mountains(offset, color, base, amp) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = base + Math.sin((x + offset) * 0.012) * amp + Math.sin((x + offset) * 0.031) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1026');
    g.addColorStop(0.7, '#101a30');
    g.addColorStop(1, '#0a0f1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const drift = reduceMotion() ? 0 : t * 0.01;
    mountains(drift * 0.4, 'rgba(94,162,255,0.10)', H * 0.55, 40);
    mountains(drift * 0.8, 'rgba(94,162,255,0.16)', H * 0.7, 30);

    // ground
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(0, H - 24, W, 24);
    ctx.fillStyle = 'rgba(53,224,255,0.25)';
    ctx.fillRect(0, H - 24, W, 2);

    for (const p of pillars) {
      const pg = ctx.createLinearGradient(p.x, 0, p.x + PW, 0);
      pg.addColorStop(0, '#2a3550');
      pg.addColorStop(0.5, '#3b4a6e');
      pg.addColorStop(1, '#232c44');
      ctx.fillStyle = pg;
      ctx.fillRect(p.x, 0, PW, p.gy);
      ctx.fillRect(p.x, p.gy + p.gap, PW, H - p.gy - p.gap);
      ctx.fillStyle = '#c9a15f';
      ctx.fillRect(p.x - 5, p.gy - 12, PW + 10, 12);
      ctx.fillRect(p.x - 5, p.gy + p.gap, PW + 10, 12);
      ctx.fillStyle = 'rgba(201,161,95,0.35)';
      for (let y = 20; y < p.gy - 20; y += 34) ctx.fillRect(p.x + 8, y, PW - 16, 3);
      for (let y = p.gy + p.gap + 26; y < H - 30; y += 34) ctx.fillRect(p.x + 8, y, PW - 16, 3);
    }

    // danphe
    const bx = BIRD_X(), by = bird.y;
    const tilt = Math.max(-0.5, Math.min(0.7, bird.vy / 700));
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(tilt);
    ctx.shadowColor = '#3ddc97';
    ctx.shadowBlur = 16;
    const bg = ctx.createLinearGradient(-R, -R, R, R);
    bg.addColorStop(0, '#3ddc97');
    bg.addColorStop(0.5, '#2f7cff');
    bg.addColorStop(1, '#c77b3f');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.15, R * 0.85, 0, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    // tail
    ctx.fillStyle = '#c77b3f';
    ctx.beginPath();
    ctx.moveTo(-R * 0.9, 0);
    ctx.lineTo(-R * 1.9, -R * 0.35);
    ctx.lineTo(-R * 1.75, R * 0.3);
    ctx.closePath();
    ctx.fill();
    // wing
    const w = wing > 0 ? -0.9 : 0.35;
    ctx.fillStyle = 'rgba(232,238,252,0.85)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.15, -R * 0.1, R * 0.7, R * 0.42, w, 0, 7);
    ctx.fill();
    // crest
    ctx.strokeStyle = '#3ddc97';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R * 0.35, -R * 0.7);
    ctx.quadraticCurveTo(R * 0.55, -R * 1.35, R * 0.85, -R * 1.15);
    ctx.stroke();
    // eye + beak
    ctx.fillStyle = '#0b1020';
    ctx.beginPath(); ctx.arc(R * 0.55, -R * 0.25, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffc46b';
    ctx.beginPath();
    ctx.moveTo(R * 1.05, -R * 0.1);
    ctx.lineTo(R * 1.55, 0);
    ctx.lineTo(R * 1.05, R * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function loop(t) {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (running && !over) step(dt);
    draw(t);
  }

  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (over) { reset(); running = true; flap(); }
      else if (!running) { stage.querySelectorAll('.overlay').forEach((o) => o.remove()); running = true; flap(); }
      else flap();
    }
  }
  function onTap(e) {
    e.preventDefault();
    if (over) return;
    if (!running) { stage.querySelectorAll('.overlay').forEach((o) => o.remove()); running = true; }
    flap();
  }

  resize();
  reset();
  startOverlay();
  raf = requestAnimationFrame(loop);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onTap);

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onTap);
  };
}