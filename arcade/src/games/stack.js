import { $, fmt, load, save, copyText, reduceMotion } from '../util.js';

const BLOCK_H = 46;
const BASE_ALT = 800;
const STEP_ALT = 50;
const PERFECT_PX = 5;
const EVEREST = 8848;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function mount(root) {
  let best = Math.max(BASE_ALT, load('stack:best', BASE_ALT));
  let bestAtStart = best;
  let destroyed = false;

  root.innerHTML = `
    <div class="g-wrap" id="hsRoot">
      <div class="hs-wrap">
        <canvas class="hs-canvas" id="hsCanvas" aria-label="Himalaya Stack game. Tap or press space to drop each block."></canvas>
        <div class="hs-hud">
          <div class="g-row">
            <div class="stat"><b id="hsAlt">800</b><span>ALTITUDE · M</span></div>
            <div class="stat accent"><b id="hsBest">${fmt(best)}</b><span>BEST · M</span></div>
          </div>
          <div class="stat" style="min-width:64px"><b id="hsCombo">0</b><span>PERFECT</span></div>
        </div>
        <div class="hs-hint" id="hsHint">TAP OR PRESS SPACE TO DROP</div>
      </div>
    </div>`;

  const canvas = $('#hsCanvas', root);
  const ctx = canvas.getContext('2d');
  const altEl = $('#hsAlt', root);
  const bestEl = $('#hsBest', root);
  const comboEl = $('#hsCombo', root);
  const hintEl = $('#hsHint', root);
  const host = $('#hsRoot', root);

  let W = 0;
  let H = 0;
  let DPR = 1;
  let blocks = [];
  let moving = null;
  let cam = 0;
  let speedBase = 0;
  let level = 0;
  let perfectRun = 0;
  let over = false;
  let hasDropped = false;
  let flashes = [];
  let last = performance.now();
  let raf = 0;
  let cloudSeed = 0;
  let summitShown = false;
  const clouds = [];
  const stars = [];

  for (let i = 0; i < 46; i++) {
    stars.push({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.4 + 0.4, p: Math.random() * 6.28 });
  }
  const makeCloud = (initial) => ({
    x: Math.random(),
    alt: initial ? Math.random() * 1400 - 400 : 2600 + Math.random() * 1200,
    s: 0.6 + Math.random() * 1.2,
    a: 0.05 + Math.random() * 0.1,
    v: 0.05 + Math.random() * 0.12,
  });
  for (let i = 0; i < 9; i++) clouds.push(makeCloud(true));

  const baseWidth = () => Math.min(250, Math.max(150, W * 0.36));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(260, rect.width);
    H = Math.max(300, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    speedBase = Math.min(W * 0.9, W * 0.35 + level * Math.max(6, W * 0.012));
  }

  function reset() {
    host.querySelectorAll('.overlay').forEach((o) => o.remove());
    blocks = [{ x: W / 2 - baseWidth() / 2, w: baseWidth() }];
    level = 0;
    cam = 0;
    perfectRun = 0;
    over = false;
    hasDropped = false;
    flashes = [];
    summitShown = false;
    bestAtStart = Math.max(BASE_ALT, load('stack:best', best));
    best = Math.max(best, bestAtStart);
    spawnMoving(true);
    hintEl.style.display = '';
    altEl.textContent = fmt(BASE_ALT);
    bestEl.textContent = fmt(best);
    comboEl.textContent = '0';
  }

  const altitude = () => BASE_ALT + (blocks.length - 1) * STEP_ALT;

  function spawnMoving(first = false) {
    const prev = blocks[blocks.length - 1];
    const w = prev.w;
    if (first) {
      // start the opening block already overlapping base camp, so an early
      // tap is a partial hit rather than an instant miss
      const side = Math.random() < 0.5 ? -1 : 1;
      const offset = side * (0.15 + Math.random() * 0.45) * w;
      moving = { x: prev.x + offset, w, dir: side < 0 ? 1 : -1 };
      return;
    }
    const dir = blocks.length % 2 === 0 ? 1 : -1;
    moving = { x: dir > 0 ? 0 : W - w, w, dir };
    speedBase = Math.min(W * 0.9, W * 0.35 + level * Math.max(6, W * 0.012));
  }

  function drop() {
    if (over || destroyed || !moving) return;
    hasDropped = true;
    hintEl.style.display = 'none';
    const prev = blocks[blocks.length - 1];
    const left = Math.max(prev.x, moving.x);
    const right = Math.min(prev.x + prev.w, moving.x + moving.w);
    const overlap = right - left;
    if (overlap <= 1) {
      endGame();
      return;
    }
    const perfect = Math.abs(moving.x - prev.x) <= PERFECT_PX;
    let nb;
    if (perfect) {
      nb = { x: prev.x, w: prev.w };
      perfectRun += 1;
      flashes.push({ text: perfectRun > 1 ? `PERFECT ×${perfectRun}` : 'PERFECT', life: 1 });
    } else {
      nb = { x: left, w: overlap };
      perfectRun = 0;
    }
    blocks.push(nb);
    level += 1;
    if (perfectRun > 0) comboEl.textContent = String(perfectRun);
    const alt = altitude();
    altEl.textContent = fmt(alt);
    if (blocks.length > 1 && alt > best) {
      best = alt;
      save('stack:best', best);
      bestEl.textContent = fmt(best);
    }
    if (!summitShown && alt >= EVEREST) {
      summitShown = true;
      summit();
    }
    spawnMoving();
    if (reduceMotion()) cam = camTarget();
  }

  function camTarget() {
    const topIndex = blocks.length - 1;
    return Math.max(0, topIndex * BLOCK_H - (H * 0.42 - 70));
  }

  function screenY(levelIndex) {
    const baseY = H - 70;
    return baseY - levelIndex * BLOCK_H + cam;
  }

  function endGame() {
    over = true;
    const alt = altitude();
    const isNew = blocks.length > 1 && alt > bestAtStart;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="Climb ended">
        <p class="kicker" style="margin-bottom:10px">${isNew ? 'NEW HIGHEST ALTITUDE' : 'CLIMB ENDED'}</p>
        <h3>${alt >= EVEREST ? 'You passed Everest.' : 'The tower fell.'}</h3>
        <div class="score-big">${fmt(alt)} m</div>
        <p>Best altitude: <b>${fmt(best)} m</b>. Every perfect drop keeps the tower at full width — chase the next 50 metres.</p>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="hsAgain">Climb again</button>
          <button type="button" class="btn" id="hsCopy">Copy result</button>
          <a class="btn" href="./">Arcade home</a>
        </div>
      </div>`;
    host.appendChild(ov);
    ov.querySelector('#hsAgain').addEventListener('click', reset);
    ov.querySelector('#hsCopy').addEventListener('click', () =>
      copyText(`ACTTOLOG ARCADE — Himalaya Stack\nAltitude reached: ${fmt(alt)} m\nBest: ${fmt(best)} m\nacttolog.github.io/games/himalaya-stack`));
    ov.querySelector('#hsAgain').focus();
  }

  function summit() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="Everest altitude reached">
        <p class="kicker" style="margin-bottom:10px">8,848.86 M · SAGARMATHA</p>
        <h3>You climbed past Everest.</h3>
        <p>8,848 metres — the height of the world's highest peak. Keep stacking, or take the summit result now.</p>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="hsKeep">Keep climbing</button>
        </div>
      </div>`;
    host.appendChild(ov);
    ov.querySelector('#hsKeep').addEventListener('click', () => ov.remove());
    ov.querySelector('#hsKeep').focus();
  }

  function draw(t) {
    const progress = (altitude() - BASE_ALT) / 9000;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    const glow = Math.min(1, progress * 2.4);
    sky.addColorStop(0, progress > 0.45 ? '#060b16' : '#070c15');
    sky.addColorStop(0.55, `rgb(${Math.round(10 + glow * 12)},${Math.round(18 + glow * 22)},${Math.round(32 + glow * 40)})`);
    sky.addColorStop(1, `rgb(${Math.round(16 + glow * 40)},${Math.round(26 + glow * 46)},${Math.round(44 + glow * 40)})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // stars fade in as the tower climbs
    if (progress > 0.18) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, (progress - 0.18) * 1.8);
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t / 900 + s.p);
        ctx.fillStyle = `rgba(220,235,255,${tw})`;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }

    // distant Himalayan ridges
    const ridge = (baseY, amp, phase, fill, stroke) => {
      ctx.beginPath();
      ctx.moveTo(-30, H);
      const n = 34;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const h = amp * (0.3 + 0.7 * Math.pow(Math.abs(Math.sin(t * 5.7 + phase)), 1.5))
          + Math.sin(t * 21 + phase * 2) * amp * 0.12;
        ctx.lineTo(-30 + (W + 60) * t, baseY - h);
      }
      ctx.lineTo(W + 30, H);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    ridge(H * 0.76 + cam * 0.05, H * 0.2, 1.2, '#0e1828', 'rgba(190,215,240,.06)');
    ridge(H * 0.84 + cam * 0.08, H * 0.15, 3.9, '#152235', 'rgba(190,215,240,.07)');
    ridge(H * 0.92 + cam * 0.11, H * 0.1, 5.4, '#1c2c41', 'rgba(210,230,250,.08)');

    // drifting clouds, parallax against the climb
    for (const c of clouds) {
      const y = (H - 70) + cam * 0.45 - c.alt;
      if (y < -180 || y > H + 180) {
        // keep the cloud band stocked in both directions as the camera rises
        c.alt = y < -180
          ? (H - 70) + cam * 0.45 + 120 + Math.random() * H * 0.8
          : (H - 70) + cam * 0.45 - 140 - Math.random() * H * 1.4;
        c.x = Math.random();
        c.s = 0.6 + Math.random() * 1.2;
        c.a = 0.05 + Math.random() * 0.1;
        continue;
      }
      const cx = c.x * W;
      ctx.save();
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#dbe8ff';
      ctx.beginPath();
      ctx.ellipse(cx, y, 90 * c.s, 16 * c.s, 0, 0, 6.283);
      ctx.ellipse(cx + 44 * c.s, y + 6, 60 * c.s, 12 * c.s, 0, 0, 6.283);
      ctx.ellipse(cx - 48 * c.s, y + 7, 52 * c.s, 10 * c.s, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }

    // altitude scale
    ctx.save();
    ctx.font = '600 9px "Cascadia Mono", Consolas, monospace';
    ctx.fillStyle = 'rgba(180,198,220,.38)';
    ctx.textAlign = 'right';
    const baseY = H - 70;
    for (let a = BASE_ALT; a <= BASE_ALT + 16000; a += 500) {
      const y = baseY + cam - ((a - BASE_ALT) / STEP_ALT) * BLOCK_H;
      if (y > H - 12) continue;
      if (y < 44) break;
      ctx.strokeStyle = 'rgba(160,190,220,.08)';
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(W - 54, y);
      ctx.stroke();
      ctx.fillText(`${fmt(a)} m`, W - 12, y + 3);
    }
    ctx.restore();

    // tower
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const y = screenY(i) - BLOCK_H;
      if (y > H + 20 || y + BLOCK_H < -20) continue;
      const g = ctx.createLinearGradient(0, y, 0, y + BLOCK_H);
      g.addColorStop(0, '#e7effa');
      g.addColorStop(0.55, '#c2d1e4');
      g.addColorStop(1, '#93a9c3');
      ctx.fillStyle = g;
      roundRect(ctx, b.x, y, b.w, BLOCK_H - 3, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      roundRect(ctx, b.x + 3, y + 3, Math.max(0, b.w - 6), 6, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(7,12,20,.22)';
      ctx.lineWidth = 1;
      roundRect(ctx, b.x + 0.5, y + 0.5, b.w - 1, BLOCK_H - 4, 7);
      ctx.stroke();
      if (i === blocks.length - 1 && !over) {
        ctx.save();
        ctx.shadowColor = 'rgba(67,224,211,.5)';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = 'rgba(67,224,211,.9)';
        ctx.lineWidth = 2;
        roundRect(ctx, b.x + 1, y + 1, b.w - 2, BLOCK_H - 5, 7);
        ctx.stroke();
        ctx.restore();
      }
    }

    // moving block
    if (moving && !over) {
      const y = screenY(blocks.length) - BLOCK_H;
      const g = ctx.createLinearGradient(0, y, 0, y + BLOCK_H);
      g.addColorStop(0, '#f4fbff');
      g.addColorStop(0.6, '#bfe5ea');
      g.addColorStop(1, '#79b9c4');
      ctx.save();
      ctx.shadowColor = 'rgba(67,224,211,.35)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = g;
      roundRect(ctx, moving.x, y, moving.w, BLOCK_H - 3, 7);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      roundRect(ctx, moving.x + 3, y + 3, Math.max(0, moving.w - 6), 6, 3);
      ctx.fill();
    }

    // perfect flashes
    if (flashes.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '800 16px "Segoe UI", system-ui, sans-serif';
      for (const f of flashes) {
        const y = H * 0.26 - (1 - f.life) * 40;
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = '#43e0d3';
        ctx.fillText(f.text, W / 2, y);
      }
      ctx.restore();
    }

    // brand mark
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#e9eef7';
    ctx.font = '700 9px "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ACTTOLOG ARCADE · NEPAL', 12, 20);
    ctx.restore();
  }

  function frame(now) {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!over && moving) {
      moving.x += moving.dir * speedBase * dt;
      if (moving.x <= -moving.w) {
        moving.x = -moving.w;
        moving.dir = 1;
      } else if (moving.x >= W) {
        moving.x = W;
        moving.dir = -1;
      }
    }
    const target = camTarget();
    cam += (target - cam) * Math.min(1, dt * 6.5);
    for (const c of clouds) c.alt += c.v * dt * 14;
    flashes = flashes.map((f) => ({ ...f, life: f.life - dt * 0.9 })).filter((f) => f.life > 0);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  const onKey = (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') {
      e.preventDefault();
      drop();
    }
  };

  let startX = null;
  let startY = null;
  const onDown = (e) => {
    if (e.button !== undefined && e.button > 0) return;
    startX = e.clientX;
    startY = e.clientY;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
  };
  const onUp = (e) => {
    if (startX == null) return;
    const moved = Math.hypot(e.clientX - startX, (e.clientY || startY) - startY);
    startX = null;
    if (moved < 14) drop();
  };

  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(() => { resize(); });
  ro.observe(canvas);

  resize();
  last = performance.now();
  reset();
  raf = requestAnimationFrame(frame);

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
  };
}
