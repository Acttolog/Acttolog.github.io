import {
  COLORS, META, VERSION, PLAYER_SETS, DEFAULT_OPTIONS, PATH_STEPS,
  RING, START, SAFE_RINGS, HOME_COL, HOME_QUADRANT, BASE_SLOTS,
  createGame, legalMoves, rollDice, commitMove, endTurn, cpuPickMove,
  currentPlayer, xyAt, tokenCount, progressSum, standings, isValidGame,
} from './ludo-engine.js';
import { esc, load, save, toast, reduceMotion, copyText, shareText } from '../util.js';

const STEP_MS = 108;
const DICE_MS = 640;
const CPU_DELAY = 760;
const ORIENT = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const colorName = (c) => META[c]?.name || c;

function pct(v) { return `${(v / 15) * 100}%`; }

export function mount(root) {
  let destroyed = false;
  let game = null;
  let paused = true;
  let busy = false;
  let rolling = false;
  let flowId = 0;
  let anim = null;
  let statusText = '';
  let feed = [];
  let lastDice = null;
  let statsRecorded = false;
  let speed = null;
  let testDice = [];
  let savedGame = null;
  let diceX = 0;
  let diceY = 0;
  const tokenNodes = new Map();
  let sfx = null;

  const stored = load('ludo:prefs', null) || {};
  const prefs = {
    sound: stored.sound !== false,
    flat: Boolean(stored.flat),
    difficulty: stored.difficulty === 'easy' ? 'easy' : 'sharp',
  };
  let setupState = {
    players: [2, 3, 4].includes(stored.setup?.players) ? stored.setup.players : 2,
    mode: stored.setup?.mode === 'human' ? 'human' : 'cpu',
    difficulty: prefs.difficulty,
    options: {
      blockades: Boolean(stored.setup?.options?.blockades),
      threeSixes: stored.setup?.options?.threeSixes !== false,
      autoSelect: stored.setup?.options?.autoSelect !== false,
    },
  };
  let stats = (() => {
    const s = load('ludo:stats', null) || {};
    return {
      played: Math.max(0, Number(s.played) || 0),
      wins: Math.max(0, Number(s.wins) || 0),
      streak: Math.max(0, Number(s.streak) || 0),
      best: Math.max(0, Number(s.best) || 0),
    };
  })();
  const rawSave = load('ludo:save', null);
  if (rawSave && isValidGame(rawSave.game) && rawSave.game.phase !== 'over') savedGame = rawSave;

  const faces = [1, 2, 3, 4, 5, 6].map((v) => `<span class="lh-face lh-face-${v}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</span>`).join('');

  root.innerHTML = `
    <div class="lh-wrap${prefs.flat ? ' flat' : ''}" id="lhRoot">
      <header class="lh-head">
        <div class="lh-brand">
          <span class="lh-crest" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="34" height="34">
              <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".45"/>
              <circle cx="20" cy="20" r="14.5" fill="none" stroke="currentColor" stroke-width=".7" opacity=".25"/>
              <path d="M8 28 17 11l4 7.4L24.4 12 32 28z" fill="url(#lhGold)"/>
              <path d="M8 28h24" stroke="currentColor" stroke-width="1" opacity=".5"/>
              <defs><linearGradient id="lhGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe7ae"/><stop offset=".55" stop-color="#e2b566"/><stop offset="1" stop-color="#a9782f"/></linearGradient></defs>
            </svg>
          </span>
          <div class="lh-brandtext">
            <strong>LUDO HIMALAYA</strong>
            <span><span class="lh-ne">लुडो हिमालय</span> · THE NEPAL TABLE</span>
          </div>
        </div>
        <div class="lh-tools">
          <button type="button" class="lh-tool" data-act="rules">Rules</button>
          <button type="button" class="lh-tool" data-act="sound" aria-pressed="${prefs.sound}">Sound: ${prefs.sound ? 'on' : 'off'}</button>
          <button type="button" class="lh-tool" data-act="view" aria-pressed="${prefs.flat}">View: ${prefs.flat ? 'flat' : '3D'}</button>
          <button type="button" class="lh-tool" data-act="full">Full screen</button>
          <button type="button" class="lh-tool lh-tool-new" data-act="new">New match</button>
        </div>
      </header>

      <div class="lh-body">
        <div class="lh-play">
          <div class="lh-turnbar" id="lhTurnbar">
            <span class="lh-turn-dot" id="lhTurnDot" aria-hidden="true"></span>
            <div class="lh-turncopy">
              <strong id="lhTurnName">Ludo Himalaya</strong>
              <span id="lhStatus" role="status" aria-live="polite">Choose a match to begin.</span>
            </div>
            <span class="lh-streak" id="lhStreak" hidden aria-label="consecutive sixes"><i></i><i></i><i></i></span>
            <button type="button" class="lh-dice-scene" id="lhDiceBtn" aria-label="Roll the dice" aria-disabled="true" disabled>
              <span class="lh-dice-shadow" aria-hidden="true"></span>
              <span class="lh-dice-tilt" aria-hidden="true">
                <span class="lh-dice" id="lhDice">${faces}</span>
              </span>
            </button>
            <button type="button" class="lh-rollbtn" id="lhRoll" disabled>Roll dice <kbd>R</kbd></button>
          </div>

          <div class="lh-stage" id="lhStage">
            <div class="lh-board" id="lhBoard">
              <span class="lh-stud s1" aria-hidden="true"></span><span class="lh-stud s2" aria-hidden="true"></span>
              <span class="lh-stud s3" aria-hidden="true"></span><span class="lh-stud s4" aria-hidden="true"></span>
              <div class="lh-field" id="lhField" aria-label="Ludo board">
                <div class="lh-homes" id="lhHomes"></div>
                <div class="lh-cells" id="lhCells"></div>
                <div class="lh-center" aria-hidden="true">
                  <span class="lh-tri lh-tri-red"></span>
                  <span class="lh-tri lh-tri-green"></span>
                  <span class="lh-tri lh-tri-yellow"></span>
                  <span class="lh-tri lh-tri-blue"></span>
                  <span class="lh-medal">
                    <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
                      <path d="M8 27 17 12l4 7 3.4-5.6L32 27z" fill="currentColor"/>
                      <path d="M8 30h24" stroke="currentColor" stroke-width="1.2" opacity=".6"/>
                    </svg>
                    <b>ACTTOLOG</b>
                  </span>
                </div>
                <div class="lh-marks" id="lhMarks"></div>
                <div class="lh-fx" id="lhFx"></div>
                <div class="lh-tokens" id="lhTokens"></div>
              </div>
            </div>
          </div>
          <p class="lh-hint" id="lhHint">Tap a glowing marble to move it. Press <kbd>R</kbd> to roll.</p>
        </div>

        <aside class="lh-side">
          <section class="lh-card">
            <div class="lh-cardhead"><h3>The table</h3><span id="lhRound">—</span></div>
            <div class="lh-roster" id="lhRoster"></div>
          </section>
          <section class="lh-card lh-logcard">
            <div class="lh-cardhead"><h3>Play by play</h3></div>
            <ul class="lh-log" id="lhLog"><li class="empty">The table is set.</li></ul>
          </section>
          <div class="lh-sidefoot">
            <button type="button" class="lh-mini" data-act="new">New match</button>
            <span>Classic rules · 2–4 players</span>
          </div>
        </aside>
      </div>

      <div class="lh-modal-wrap" id="lhSetup" hidden></div>
      <div class="lh-modal-wrap" id="lhRules" hidden></div>
      <div class="lh-modal-wrap" id="lhResult" hidden></div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const qa = (sel) => [...root.querySelectorAll(sel)];
  const setupEl = q('#lhSetup');
  const rulesEl = q('#lhRules');
  const resultEl = q('#lhResult');
  const boardEl = q('#lhBoard');
  const stageEl = q('#lhStage');
  const tokensEl = q('#lhTokens');
  const marksEl = q('#lhMarks');
  const fxEl = q('#lhFx');
  const rollBtn = q('#lhRoll');
  const diceBtn = q('#lhDiceBtn');
  const diceEl = q('#lhDice');
  const hintEl = q('#lhHint');

  /* ── score effects ──────────────────────────────────────── */
  function makeSfx() {
    let ctx = null;
    let muted = false;
    const get = () => {
      if (!prefs.sound || muted) return null;
      try {
        ctx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch {
        return null;
      }
    };
    function tone(freq, dur = 0.12, type = 'sine', gain = 0.05, slide = 0, delay = 0) {
      const ac = get();
      if (!ac) return;
      try {
        const t = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ac.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      } catch { /* audio is a bonus, never a blocker */ }
    }
    function noise(dur = 0.1, gain = 0.03, freq = 1200, delay = 0) {
      const ac = get();
      if (!ac) return;
      try {
        const t = ac.currentTime + delay;
        const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 0.9;
        const g = ac.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filter).connect(g).connect(ac.destination);
        src.start(t);
      } catch { /* ignore */ }
    }
    return {
      roll() { for (let i = 0; i < 6; i++) noise(0.04, 0.028, 850 + Math.random() * 700, i * 0.065); },
      step() { tone(520, 0.045, 'triangle', 0.026, 180); },
      capture() { tone(240, 0.26, 'sawtooth', 0.05, -140); noise(0.18, 0.04, 420); },
      home() { tone(659, 0.15, 'sine', 0.05); tone(880, 0.2, 'sine', 0.045, 0, 0.12); },
      win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.24, 'triangle', 0.05, 0, i * 0.11)); },
      forfeit() { tone(300, 0.2, 'square', 0.04, -90); },
      nope() { tone(150, 0.18, 'square', 0.035, -40); },
      click() { tone(900, 0.03, 'sine', 0.02); },
      dispose() { muted = true; try { ctx?.close(); } catch { /* ignore */ } },
    };
  }
  sfx = makeSfx();
  const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } };

  /* ── static board ────────────────────────────────────────── */
  function buildBoard() {
    let homes = '';
    let sockets = '';
    for (const color of COLORS) {
      const [hx, hy] = HOME_QUADRANT[color];
      homes += `<div class="lh-home lh-home-${color}" data-color="${color}"
        style="left:${(hx / 15) * 100}%;top:${(hy / 15) * 100}%;width:${(6 / 15) * 100}%;height:${(6 / 15) * 100}%">
        <div class="lh-yard"></div>
        <span class="lh-home-name ne">${META[color].ne}</span>
        <span class="lh-home-en">${META[color].name.toUpperCase()}</span>
      </div>`;
      for (const [sx, sy] of BASE_SLOTS[color]) {
        sockets += `<span class="lh-socket lh-socket-${color}" data-color="${color}" style="left:${(sx / 15) * 100}%;top:${(sy / 15) * 100}%"></span>`;
      }
    }
    q('#lhHomes').innerHTML = homes;

    let cells = '';
    const seen = new Set();
    RING.forEach(([c, r], idx) => {
      const key = `${c},${r}`;
      if (seen.has(key)) return;
      seen.add(key);
      const owner = Object.keys(START).find((color) => START[color] === idx);
      const safe = SAFE_RINGS.includes(idx);
      const cls = ['lh-cell'];
      if (safe) cls.push('lh-safe');
      if (owner) cls.push(`lh-start-${owner}`);
      cells += `<div class="${cls.join(' ')}" style="left:${pct(c)};top:${pct(r)};width:${pct(1)};height:${pct(1)}">${safe ? '<span class="lh-star" aria-hidden="true">★</span>' : ''}</div>`;
    });
    for (const color of COLORS) {
      HOME_COL[color].forEach(([c, r], i) => {
        cells += `<div class="lh-cell lh-homecell lh-tint-${color}${i === 4 ? ' lh-homecell-last' : ''}" style="left:${pct(c)};top:${pct(r)};width:${pct(1)};height:${pct(1)}"></div>`;
      });
    }
    q('#lhCells').innerHTML = cells;
    tokensEl.insertAdjacentHTML('beforeend', sockets);
  }
  buildBoard();
  const socketEls = [...tokensEl.querySelectorAll('.lh-socket')];

  const ro = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect?.width || 0;
    if (w) boardEl.style.setProperty('--bw', `${w}px`);
  });
  ro.observe(boardEl);

  /* ── helpers ────────────────────────────────────────────── */
  function savePrefs() {
    save('ludo:prefs', {
      sound: prefs.sound,
      flat: prefs.flat,
      difficulty: setupState.difficulty,
      setup: setupState,
    });
  }

  function syncScrollLock() {
    const open = !setupEl.hidden || !rulesEl.hidden || !resultEl.hidden;
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }

  function pushLog(text, kind = '') {
    feed.push({ text, kind });
    if (feed.length > 40) feed = feed.slice(-40);
    renderLog();
  }

  function setStatus(text) {
    statusText = text;
    const el = q('#lhStatus');
    if (el) el.textContent = text;
  }

  function hasCpu() {
    return Boolean(game?.players.some((p) => p.type === 'cpu'));
  }

  function playerName(p, index) {
    if (!p) return '';
    if (p.type === 'cpu') return `CPU ${colorName(p.color)}`;
    if (game && game.players.length > 1 && game.players.some((x) => x.type === 'cpu')) return 'You';
    return `${colorName(p.color)} player`;
  }

  function actorName(p) {
    if (!p) return '';
    if (p.type === 'cpu') return `CPU ${colorName(p.color)}`;
    if (game && game.players.some((x) => x.type === 'cpu')) return 'You';
    return colorName(p.color);
  }

  function later(fn, ms) {
    const id = flowId;
    return setTimeout(() => {
      if (id !== flowId || destroyed) return;
      fn();
    }, ms);
  }

  /* ── rendering ──────────────────────────────────────────── */
  function renderTurnbar() {
    const bar = q('#lhTurnbar');
    const p = game ? currentPlayer(game) : null;
    const nameEl = q('#lhTurnName');
    const dot = q('#lhTurnDot');
    const streak = q('#lhStreak');
    if (!game || !p) {
      bar.style.setProperty('--turn', '#5f6d81');
      nameEl.textContent = 'Ludo Himalaya';
      dot.className = 'lh-turn-dot';
      streak.hidden = true;
      q('#lhStatus').textContent = 'Choose a match to begin.';
      return;
    }
    const meta = META[p.color];
    bar.style.setProperty('--turn', meta.hex);
    const humans = game.players.filter((x) => x.type === 'human').length;
    nameEl.textContent = p.type === 'cpu' ? `CPU ${meta.name}` : humans === 1 ? 'You' : `${meta.name} player`;
    dot.className = `lh-turn-dot lh-dot-${p.color}`;
    q('#lhStatus').textContent = statusText || defaultStatus();
    streak.hidden = !(game.sixes > 0 && game.phase !== 'over');
    [...streak.children].forEach((el, i) => el.classList.toggle('on', i < game.sixes));
    streak.setAttribute('aria-label', `${game.sixes} consecutive sixes`);
  }

  function defaultStatus() {
    if (!game) return 'Choose a match to begin.';
    if (game.phase === 'over') {
      const winner = game.players.find((p) => p.color === game.winner);
      return winner ? `${actorName(winner)} win${actorName(winner) === 'You' ? '' : 's'} the table.` : 'Match complete.';
    }
    const p = currentPlayer(game);
    if (!p) return '';
    if (game.phase === 'forfeit') return 'Three sixes — the turn is forfeited.';
    if (game.phase === 'no-move') return 'No legal move — the turn passes.';
    if (game.phase === 'rolling') {
      return p.type === 'cpu' ? `CPU ${colorName(p.color)} is readying the dice…` : 'Your turn — roll the dice.';
    }
    if (game.phase === 'choosing') {
      return p.type === 'cpu' ? `CPU ${colorName(p.color)} is choosing a token…` : `Rolled ${game.dice} — choose a marble to move.`;
    }
    return '';
  }

  function renderRoster() {
    const roster = q('#lhRoster');
    if (!game) {
      roster.innerHTML = '<p class="lh-empty">Two to four players. Roll a six to leave the yard.</p>';
      q('#lhRound').textContent = '—';
      return;
    }
    const humans = game.players.filter((p) => p.type === 'human').length;
    roster.innerHTML = game.players.map((p, i) => {
      const home = tokenCount(p);
      const prog = Math.round((progressSum(p) / (4 * PATH_STEPS)) * 100);
      const active = i === game.turn && game.phase !== 'over';
      const tag = p.type === 'cpu' ? 'CPU' : humans === 1 ? 'YOU' : `P${i + 1}`;
      return `<div class="lh-player${active ? ' active' : ''}" style="--pc:${META[p.color].hex}">
        <span class="lh-pdot"></span>
        <div class="lh-pname"><strong>${esc(playerName(p, i))}</strong><span>${home} of 4 home</span></div>
        <span class="lh-ppips" aria-label="${home} tokens home">${[0, 1, 2, 3].map((k) => `<i class="${k < home ? 'on' : ''}"></i>`).join('')}</span>
        <span class="lh-ptrack"><i style="width:${prog}%"></i></span>
        <span class="lh-ptag">${tag}</span>
      </div>`;
    }).join('');
    q('#lhRound').textContent = `${game.rolls} roll${game.rolls === 1 ? '' : 's'}`;
  }

  function renderLog() {
    const log = q('#lhLog');
    if (!feed.length) {
      log.innerHTML = '<li class="empty">The table is set.</li>';
      return;
    }
    log.innerHTML = feed.slice(-7).reverse()
      .map((e) => `<li class="${e.kind || ''}">${esc(e.text)}</li>`).join('');
  }

  function renderStreak() {
    const streak = q('#lhStreak');
    if (!game) return;
    streak.hidden = !(game.sixes > 0 && game.phase !== 'over');
    [...streak.children].forEach((el, i) => el.classList.toggle('on', i < game.sixes));
  }

  function renderRoll() {
    if (!game) {
      rollBtn.disabled = true;
      diceBtn.disabled = true;
      rollBtn.innerHTML = 'Start a match';
      return;
    }
    const p = currentPlayer(game);
    const can = game.phase === 'rolling' && p?.type === 'human' && !busy && !rolling && !paused;
    let label = 'Roll dice <kbd>R</kbd>';
    if (game.phase === 'over') label = 'Match over';
    else if (game.phase === 'choosing') label = 'Choose a marble';
    else if (p?.type === 'cpu' && game.phase === 'rolling') label = 'CPU at the dice…';
    else if (paused) label = 'Paused';
    rollBtn.innerHTML = label;
    rollBtn.disabled = !can;
    rollBtn.classList.toggle('is-live', Boolean(can));
    diceBtn.disabled = !can;
    diceBtn.setAttribute('aria-disabled', String(!can));
  }

  function renderHomes() {
    const p = game && game.phase !== 'over' ? currentPlayer(game) : null;
    const used = new Set(game ? game.players.map((x) => x.color) : COLORS);
    qa('.lh-home').forEach((el) => {
      el.classList.toggle('active', el.dataset.color === p?.color);
      el.classList.toggle('unused', game ? !used.has(el.dataset.color) : false);
    });
    qa('.lh-socket').forEach((el) => {
      el.classList.toggle('unused', game ? !used.has(el.dataset.color) : false);
    });
  }

  function renderTokens() {
    if (!game) {
      tokenNodes.clear();
      tokensEl.querySelectorAll('.lh-token').forEach((n) => n.remove());
      return;
    }
    const cur = currentPlayer(game);
    const choosing = game.phase === 'choosing' && cur;
    const movable = new Set(!choosing ? [] : legalMoves(game).map((m) => m.token));
    const canHuman = choosing && cur.type === 'human' && !paused;
    const items = [];

    for (const p of game.players) {
      p.tokens.forEach((pos, i) => {
        const shown = anim && anim.color === p.color && anim.token === i ? anim.progress : pos;
        const [x, y] = xyAt(p.color, shown, i);
        items.push({ p, i, pos, shown, x, y });
      });
    }
    const groups = new Map();
    for (const it of items) {
      if (it.shown >= 0 && it.shown <= 55) {
        const key = `${Math.round(it.x * 100)}:${Math.round(it.y * 100)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      }
    }
    const offsets = (n) => {
      if (n === 2) return [[-0.17, 0], [0.17, 0]];
      if (n === 3) return [[0, -0.18], [-0.17, 0.15], [0.17, 0.15]];
      if (n === 4) return [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]];
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return [Math.cos(a) * 0.22, Math.sin(a) * 0.22];
      });
    };
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const offs = offsets(group.length);
      group.forEach((it, k) => { it.x += offs[k][0]; it.y += offs[k][1]; });
    }

    for (const it of items) {
      const node = tokenNodes.get(`${it.p.color}:${it.i}`);
      if (!node) continue;
      node.style.left = `${(it.x / 15) * 100}%`;
      node.style.top = `${(it.y / 15) * 100}%`;
      node.style.zIndex = String(10 + Math.round(it.y * 4) + it.i);
      const isMovable = canHuman && it.p.color === cur.color && movable.has(it.i);
      node.classList.toggle('can-move', isMovable);
      node.classList.toggle('is-current', it.p.color === cur?.color && game.phase !== 'over');
      node.classList.toggle('in-yard', it.pos < 0);
      node.classList.toggle('done', it.pos >= PATH_STEPS);
      node.classList.toggle('is-human', it.p.type === 'human');
      node.tabIndex = isMovable ? 0 : -1;
      node.setAttribute('aria-disabled', String(canHuman && !isMovable));
      const loc = it.pos < 0 ? 'in the yard'
        : it.pos >= PATH_STEPS ? 'home'
          : it.pos >= 51 ? `home column, ${it.pos - 50} of 5`
            : `on the board, ${it.pos} step${it.pos === 1 ? '' : 's'} from start`;
      node.setAttribute('aria-label', `${colorName(it.p.color)} marble ${it.i + 1}, ${loc}${isMovable ? ', can move' : ''}`);
    }
  }

  function renderMarks() {
    marksEl.innerHTML = '';
    if (!game || game.phase !== 'choosing' || paused) return;
    const p = currentPlayer(game);
    if (!p || p.type !== 'human') return;
    const seen = new Set();
    for (const m of legalMoves(game)) {
      if (m.to >= PATH_STEPS) continue;
      const [x, y] = xyAt(p.color, m.to, m.token);
      const key = `${x.toFixed(2)}:${y.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const el = document.createElement('span');
      el.className = 'lh-mark';
      el.style.left = `${(x / 15) * 100}%`;
      el.style.top = `${(y / 15) * 100}%`;
      marksEl.appendChild(el);
    }
  }

  function renderAll() {
    if (!game) {
      renderTurnbar();
      renderRoster();
      renderLog();
      renderRoll();
      renderTokens();
      return;
    }
    renderTurnbar();
    renderRoster();
    renderLog();
    renderRoll();
    renderHomes();
    renderTokens();
    renderMarks();
  }

  function floatFx(x, y, text, kind) {
    if (reduceMotion()) return;
    const el = document.createElement('span');
    el.className = `lh-float ${kind || ''}`;
    el.style.left = `${(x / 15) * 100}%`;
    el.style.top = `${(y / 15) * 100}%`;
    el.textContent = text;
    fxEl.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /* ── dice ───────────────────────────────────────────────── */
  function resetDice() {
    diceX = 0;
    diceY = 0;
    lastDice = null;
    diceEl.style.transition = 'none';
    diceEl.style.transform = 'rotateX(0deg) rotateY(180deg)';
    diceEl.classList.add('idle');
    void diceEl.offsetWidth;
    diceEl.style.transition = '';
  }

  function showDice(value, instant = false) {
    const base = ORIENT[value] || ORIENT[6];
    diceX += 720;
    diceY += 1080;
    diceEl.classList.remove('idle');
    diceEl.style.transition = instant ? 'none' : `transform ${DICE_MS}ms cubic-bezier(.2,.75,.25,1)`;
    diceEl.style.transform = `rotateX(${diceX + base[0]}deg) rotateY(${diceY + base[1]}deg)`;
    if (instant) {
      void diceEl.offsetWidth;
      diceEl.style.transition = '';
    }
  }

  function restoreDice() {
    diceX = 0;
    diceY = 0;
    const value = game?.dice || null;
    lastDice = value;
    diceEl.style.transition = 'none';
    if (value) {
      diceEl.classList.remove('idle');
      diceEl.style.transform = `rotateX(${ORIENT[value][0]}deg) rotateY(${ORIENT[value][1]}deg)`;
    } else {
      diceEl.classList.add('idle');
      diceEl.style.transform = 'rotateX(0deg) rotateY(180deg)';
    }
    void diceEl.offsetWidth;
    diceEl.style.transition = '';
  }

  async function animateDice(value) {
    const reduced = reduceMotion() || speed !== null;
    diceBtn.classList.add('is-rolling');
    showDice(value, reduced);
    sfx.roll();
    await SLEEP(reduced ? (speed ?? 70) : DICE_MS);
    diceBtn.classList.remove('is-rolling');
  }

  /* ── tokens ─────────────────────────────────────────────── */
  function createTokens() {
    tokensEl.querySelectorAll('.lh-token').forEach((n) => n.remove());
    tokenNodes.clear();
    if (!game) return;
    for (const p of game.players) {
      for (let i = 0; i < 4; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `lh-token lh-token-${p.color}`;
        btn.dataset.color = p.color;
        btn.dataset.token = String(i);
        btn.tabIndex = -1;
        btn.innerHTML = `<span class="lh-token-shadow"></span><span class="lh-token-body"><span class="lh-num">${i + 1}</span></span>`;
        btn.addEventListener('click', () => onTokenTap(p.color, i));
        tokensEl.appendChild(btn);
        tokenNodes.set(`${p.color}:${i}`, btn);
      }
    }
  }

  function onTokenTap(color, i) {
    if (!game || paused || busy || rolling || game.phase === 'over') return;
    const p = currentPlayer(game);
    if (!p) return;
    if (p.color !== color) {
      setStatus(`It is ${playerName(p, game.turn)}'s turn.`);
      return;
    }
    if (p.type !== 'human') return;
    if (game.phase !== 'choosing') {
      setStatus('Roll the dice first.');
      return;
    }
    const move = legalMoves(game).find((m) => m.token === i);
    if (!move) {
      const node = tokenNodes.get(`${color}:${i}`);
      node?.classList.add('shake');
      setTimeout(() => node?.classList.remove('shake'), 380);
      sfx.nope();
      setStatus(`That marble cannot move with a ${game.dice}.`);
      return;
    }
    moveToken(i);
  }

  function nextDiceValue() {
    if (testDice.length) {
      const v = testDice.shift();
      if (v >= 1 && v <= 6) return v;
    }
    return 1 + Math.floor(Math.random() * 6);
  }

  /* ── turn flow ──────────────────────────────────────────── */
  function beginTurn() {
    if (!game || game.phase === 'over' || destroyed || paused) return;
    statusText = '';
    const p = currentPlayer(game);
    if (!p) return;
    if (game.phase === 'rolling') {
      setStatus(p.type === 'cpu' ? `CPU ${colorName(p.color)} is readying the dice…` : 'Your turn — roll the dice.');
    } else if (game.phase === 'choosing') {
      setStatus(p.type === 'cpu' ? `CPU ${colorName(p.color)} is choosing a token…` : `Rolled ${game.dice} — choose a marble to move.`);
    }
    renderAll();
    saveGame();
    if (game.phase === 'rolling' && p.type === 'cpu') scheduleCpuRoll();
    else if (game.phase === 'choosing' && p.type === 'cpu') scheduleCpuMove();
  }

  function scheduleCpuRoll(delay = CPU_DELAY) {
    if (!game || paused) return;
    later(() => {
      if (!game || paused || busy || rolling) return;
      if (game.phase !== 'rolling' || currentPlayer(game)?.type !== 'cpu') return;
      requestRoll(true);
    }, delay + Math.random() * 420);
  }

  function scheduleCpuMove() {
    if (!game || paused || game.phase !== 'choosing') return;
    const choice = cpuPickMove(game, legalMoves(game), setupState.difficulty);
    if (!choice) return;
    later(() => {
      if (!game || paused || busy || game.phase !== 'choosing') return;
      moveToken(choice.token);
    }, 620 + Math.random() * 380);
  }

  async function requestRoll(auto = false) {
    if (!game || paused || busy || rolling || destroyed) return;
    if (game.phase !== 'rolling') return;
    const p = currentPlayer(game);
    if (!p || (p.type !== 'human' && !auto)) return;
    const id = flowId;
    rolling = true;
    renderRoll();
    const value = nextDiceValue();
    await animateDice(value);
    if (destroyed || id !== flowId) {
      rolling = false;
      return;
    }
    const result = rollDice(game, value);
    rolling = false;
    lastDice = value;
    if (!result.ok) {
      renderAll();
      return;
    }
    statusText = '';
    renderAll();
    if (game.phase === 'choosing') saveGame();

    if (result.forfeit) {
      setStatus('Three sixes in a row — the turn is forfeited.');
      pushLog(`${colorName(p.color)} rolled a third six — turn forfeited.`, 'bad');
      sfx.forfeit();
      renderAll();
      await SLEEP(1150);
      if (destroyed || id !== flowId) return;
      endTurnUI();
      return;
    }
    if (!result.moves.length) {
      setStatus(`No legal move with a ${value}.`);
      sfx.nope();
      renderAll();
      await SLEEP(980);
      if (destroyed || id !== flowId) return;
      endTurnUI();
      return;
    }
    if (result.moves.length === 1 && game.options.autoSelect) {
      setStatus(`Only one move with a ${value}.`);
      await SLEEP(430);
      if (destroyed || id !== flowId) return;
      moveToken(result.moves[0].token);
      return;
    }
    if (p.type === 'cpu') {
      setStatus(`CPU ${colorName(p.color)} is choosing a token…`);
      const choice = cpuPickMove(game, result.moves, setupState.difficulty);
      renderAll();
      await SLEEP(600 + Math.random() * 480);
      if (destroyed || id !== flowId) return;
      moveToken(choice.token);
      return;
    }
    setStatus(value === 6 ? 'You rolled a six — choose a marble to move.' : `You rolled ${value} — choose a marble to move.`);
    renderAll();
  }

  function endTurnUI() {
    if (!game) return;
    statusText = '';
    endTurn(game);
    lastDice = null;
    beginTurn();
  }

  async function moveToken(token) {
    if (!game || paused || busy || destroyed || game.phase !== 'choosing') return;
    const p = currentPlayer(game);
    const moves = legalMoves(game);
    const move = moves.find((m) => m.token === token);
    if (!move) return;
    const id = flowId;
    busy = true;
    marksEl.innerHTML = '';
    hintEl.textContent = 'Moving…';
    const steps = move.from < 0 ? [0] : Array.from({ length: move.to - move.from }, (_, i) => move.from + i + 1);
    const stepMs = speed ?? (reduceMotion() ? 24 : STEP_MS);
    for (const pos of steps) {
      anim = { color: p.color, token, progress: pos };
      renderTokens();
      const node = tokenNodes.get(`${p.color}:${token}`);
      if (node && !reduceMotion() && speed === null) {
        node.classList.remove('hop');
        void node.offsetWidth;
        node.classList.add('hop');
      }
      sfx.step();
      await SLEEP(stepMs);
      if (destroyed || id !== flowId) {
        busy = false;
        anim = null;
        renderTokens();
        return;
      }
    }
    anim = null;
    const ev = commitMove(game, token);
    busy = false;
    hintEl.textContent = 'Tap a glowing marble to move it. Press R to roll.';
    if (!ev.ok) {
      renderAll();
      return;
    }
    if (ev.captures.length) {
      sfx.capture();
      buzz(35);
      for (const c of ev.captures) {
        const victim = tokenNodes.get(`${c.color}:${c.token}`);
        victim?.classList.add('captured');
        setTimeout(() => victim?.classList.remove('captured'), 620);
      }
      const first = ev.captures[0];
      const [fx, fy] = xyAt(first.color, first.pos, first.token);
      floatFx(fx, fy, 'CAPTURED', 'bad');
      pushLog(`${colorName(p.color)} captured ${colorName(first.color)}'s marble and sent it home.`, 'capture');
    }
    if (ev.finished) {
      sfx.home();
      floatFx(7.5, 7.5, 'HOME', 'good');
      pushLog(`${colorName(p.color)} brought a marble home.`, 'home');
    }
    if (ev.won) {
      sfx.win();
      buzz([40, 70, 50]);
      pushLog(`${colorName(p.color)} wins the table.`, 'win');
      statusText = defaultStatus();
      renderAll();
      save('ludo:save', null);
      savedGame = null;
      recordResult();
      showResult();
      return;
    }

    statusText = '';
    renderAll();
    saveGame();
    if (ev.extra) {
      statusText = ev.finished ? 'Marble home — roll again.'
        : ev.captures.length ? 'Capture — roll again.'
          : 'Six — roll again.';
      renderAll();
      if (currentPlayer(game)?.type === 'cpu') scheduleCpuRoll(620);
      return;
    }
    beginTurn();
  }

  /* ── persistence and stats ──────────────────────────────── */
  function saveGame() {
    if (!game || busy || rolling || paused) return;
    if (game.phase !== 'rolling' && game.phase !== 'choosing') return;
    const payload = { savedAt: Date.now(), game: JSON.parse(JSON.stringify(game)), feed: feed.slice(-12) };
    save('ludo:save', payload);
    savedGame = payload;
  }

  function recordResult() {
    if (!game || statsRecorded) return;
    statsRecorded = true;
    const winner = game.players.find((p) => p.color === game.winner);
    stats.played += 1;
    if (winner && winner.type === 'human') {
      stats.wins += 1;
      stats.streak += 1;
    } else {
      stats.streak = 0;
    }
    stats.best = Math.max(stats.best, stats.streak);
    save('ludo:stats', stats);
  }

  function currentConfig() {
    if (!game) return null;
    return {
      players: game.players.length,
      mode: hasCpu() ? 'cpu' : 'human',
      options: { ...game.options },
      difficulty: setupState.difficulty,
    };
  }

  /* ── setup and modals ───────────────────────────────────── */
  function chipsMarkup() {
    return (PLAYER_SETS[setupState.players] || PLAYER_SETS[2]).map((c) => (
      `<span class="lh-chip lh-chip-${c}"><i></i>${META[c].name}</span>`
    )).join('');
  }

  function resumeMarkup() {
    const live = game && game.phase !== 'over';
    const saved = savedGame && isValidGame(savedGame.game) && savedGame.game.phase !== 'over' ? savedGame : null;
    if (!live && !saved) return '';
    const source = live ? game : saved.game;
    const colors = source.players.map((p) => colorName(p.color)).join(' vs ');
    const when = live ? 'in progress' : 'saved earlier';
    return `<div class="lh-resume">
      <div><b>Match ${when}</b><span>${esc(colors)} · ${source.rolls} rolls · ${source.players.length} players</span></div>
      <button type="button" class="lh-resumebtn" data-act="resume">Resume</button>
    </div>`;
  }

  function renderSetup() {
    const live = Boolean(game && game.phase !== 'over');
    const hasSave = Boolean(savedGame && isValidGame(savedGame.game) && savedGame.game.phase !== 'over');
    setupEl.innerHTML = `
      <div class="lh-modal lh-setupcard" role="dialog" aria-modal="true" aria-labelledby="lhSetupTitle">
        ${live ? '<button type="button" class="lh-x" data-act="close-setup" aria-label="Back to the match">×</button>' : ''}
        <p class="lh-eyebrow">THE NEPAL TABLE · CLASSIC LUDO</p>
        <h2 id="lhSetupTitle">Ludo Himalaya</h2>
        <p class="lh-lead">Walnut, brass and glass. Roll six to step out, race your four marbles home, and send rivals back to their yard.</p>
        ${resumeMarkup()}
        <div class="lh-form">
          <div class="lh-fgroup">
            <span class="lh-label">Players</span>
            <div class="lh-seg" role="group" aria-label="Number of players">
              ${[2, 3, 4].map((n) => `<button type="button" data-players="${n}">${n}</button>`).join('')}
            </div>
            <div class="lh-chips" id="lhSetChips">${chipsMarkup()}</div>
          </div>
          <div class="lh-fgroup">
            <span class="lh-label">Opponents</span>
            <div class="lh-seg" role="group" aria-label="Opponents">
              <button type="button" data-mode="cpu">Play vs CPU</button>
              <button type="button" data-mode="human">Pass &amp; play</button>
            </div>
          </div>
          <div class="lh-fgroup lh-difffield">
            <span class="lh-label">CPU skill</span>
            <div class="lh-seg" role="group" aria-label="CPU skill">
              <button type="button" data-diff="sharp">Sharp</button>
              <button type="button" data-diff="easy">Casual</button>
            </div>
            <p class="lh-micro">Sharp takes captures and plays the odds. Casual keeps it friendly.</p>
          </div>
          <div class="lh-fgroup">
            <span class="lh-label">House rules</span>
            <label class="lh-check"><input type="checkbox" data-opt="threeSixes"><span><b>Three sixes forfeit</b><small>Rolling three sixes in a row loses the turn.</small></span></label>
            <label class="lh-check"><input type="checkbox" data-opt="blockades"><span><b>Blockades</b><small>Two marbles on one square stop rivals passing.</small></span></label>
            <label class="lh-check"><input type="checkbox" data-opt="autoSelect"><span><b>Auto-move</b><small>Take the only legal move automatically.</small></span></label>
          </div>
        </div>
        <div class="lh-setupfoot">
          <button type="button" class="lh-primary" id="lhStart" data-act="start">${live || hasSave ? 'Start a new match' : 'Start match'}</button>
          <button type="button" class="lh-link" data-act="open-rules">Read the full rules</button>
        </div>
        <p class="lh-recordline">Your record: <b>${stats.wins}</b> win${stats.wins === 1 ? '' : 's'} · <b>${stats.played}</b> match${stats.played === 1 ? '' : 'es'} · best streak <b>${stats.best}</b></p>
        <p class="lh-tierline">ACTTOLOG ARCADE · NEPAL SERIES · 2–4 PLAYERS · NO ACCOUNT</p>
      </div>`;
    updateSetupUI();
  }

  function updateSetupUI() {
    qa2(setupEl, '[data-players]').forEach((b) => {
      const on = Number(b.dataset.players) === setupState.players;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    qa2(setupEl, '[data-mode]').forEach((b) => {
      const on = b.dataset.mode === setupState.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    qa2(setupEl, '[data-diff]').forEach((b) => {
      const on = b.dataset.diff === setupState.difficulty;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    qa2(setupEl, '[data-opt]').forEach((i) => {
      i.checked = Boolean(setupState.options[i.dataset.opt]);
    });
    const diff = setupEl.querySelector('.lh-difffield');
    if (diff) diff.hidden = setupState.mode !== 'cpu';
    const chips = setupEl.querySelector('#lhSetChips');
    if (chips) chips.innerHTML = chipsMarkup();
  }

  function qa2(scope, sel) { return [...scope.querySelectorAll(sel)]; }

  function openSetup() {
    if (busy || rolling) {
      toast('One moment — a marble is moving.');
      return;
    }
    if (!setupEl.hidden) return;
    paused = true;
    flowId += 1;
    setupEl.hidden = false;
    renderSetup();
    syncScrollLock();
    setTimeout(() => {
      const target = setupEl.querySelector('[data-act="resume"]') || setupEl.querySelector('#lhStart');
      target?.focus({ preventScroll: true });
    }, 30);
  }

  function closeSetup(resume = true) {
    if (setupEl.hidden) return;
    setupEl.hidden = true;
    syncScrollLock();
    if (resume && rulesEl.hidden && resultEl.hidden) resumeTurn();
  }

  function openRules() {
    if (busy || rolling) {
      toast('One moment — a marble is moving.');
      return;
    }
    if (!rulesEl.hidden) return;
    paused = true;
    flowId += 1;
    rulesEl.innerHTML = `
      <div class="lh-modal lh-rulescard" role="dialog" aria-modal="true" aria-labelledby="lhRulesTitle">
        <button type="button" class="lh-x" data-act="close-rules" aria-label="Close the rules">×</button>
        <p class="lh-eyebrow">HOW TO PLAY</p>
        <h2 id="lhRulesTitle">The classic, in full.</h2>
        <ol class="lh-rulelist">
          <li><b>Leave the yard.</b> Roll a six to bring a marble onto your coloured start square. A six also earns another roll.</li>
          <li><b>Walk the ring.</b> Move exactly the number on the dice, along the outer ring and then up your own coloured home column.</li>
          <li><b>Capture rivals.</b> Land on a square holding a rival marble and it returns to its yard — and you roll again. Starred squares are safe: nobody is captured there.</li>
          <li><b>Go home exactly.</b> You need the exact roll to enter the centre. An overshoot does not move the marble.</li>
          <li><b>Three sixes.</b> If the house rule is on, a third six in a row forfeits the whole turn.</li>
          <li><b>Blockades.</b> With this rule on, two of your marbles on one square form a wall that rival marbles cannot pass or land on.</li>
          <li><b>Win the table.</b> The first player to bring all four marbles home wins. Extra rolls follow sixes, captures and marbles reaching home.</li>
        </ol>
        <div class="lh-rulechips">
          <span>2–4 players</span><span>CPU or pass &amp; play</span><span>Save &amp; resume</span><span>Sound &amp; 3D</span>
        </div>
        <button type="button" class="lh-primary" data-act="close-rules">Back to the table</button>
      </div>`;
    rulesEl.hidden = false;
    syncScrollLock();
    setTimeout(() => rulesEl.querySelector('.lh-x')?.focus({ preventScroll: true }), 30);
  }

  function closeRules() {
    rulesEl.hidden = true;
    syncScrollLock();
    if (!setupEl.hidden || !resultEl.hidden) return;
    resumeTurn();
  }

  function resumeTurn() {
    if (!game || game.phase === 'over' || destroyed) {
      paused = false;
      renderAll();
      return;
    }
    paused = false;
    statusText = '';
    renderAll();
    if (game.phase === 'rolling') {
      const p = currentPlayer(game);
      setStatus(p?.type === 'cpu' ? `CPU ${colorName(p.color)} is readying the dice…` : 'Your turn — roll the dice.');
      renderTurnbar();
      if (p?.type === 'cpu') scheduleCpuRoll(450);
    } else if (game.phase === 'choosing') {
      const p = currentPlayer(game);
      setStatus(p?.type === 'cpu' ? `CPU ${colorName(p.color)} is choosing a token…` : `Rolled ${game.dice} — choose a marble.`);
      renderAll();
      if (p?.type === 'cpu') scheduleCpuMove();
    }
    saveGame();
  }

  function startGame(cfg) {
    flowId += 1;
    busy = false;
    rolling = false;
    anim = null;
    paused = false;
    resultEl.hidden = true;
    rulesEl.hidden = true;
    setupEl.hidden = true;
    syncScrollLock();
    game = createGame({
      colors: cfg.colors,
      types: cfg.types,
      options: { ...DEFAULT_OPTIONS, ...(cfg.options || {}) },
    });
    feed = [];
    statsRecorded = false;
    statusText = '';
    lastDice = null;
    testDice = [];
    savedGame = null;
    save('ludo:save', null);
    createTokens();
    resetDice();
    if (prefs.flat) root.querySelector('#lhRoot').classList.add('flat');
    else root.querySelector('#lhRoot').classList.remove('flat');
    const p = currentPlayer(game);
    setStatus(`${colorName(p.color)} starts. Roll a six to leave the yard.`);
    renderAll();
    saveGame();
    hintEl.textContent = 'Tap a glowing marble to move it. Press R to roll.';
    setTimeout(() => rollBtn.focus({ preventScroll: true }), 40);
  }

  function startFromSetup() {
    if (busy || rolling) return;
    const colors = PLAYER_SETS[setupState.players] || PLAYER_SETS[2];
    const types = setupState.mode === 'cpu'
      ? colors.map((c, i) => (i === 0 ? 'human' : 'cpu'))
      : colors.map(() => 'human');
    prefs.difficulty = setupState.difficulty;
    savePrefs();
    startGame({ colors, types, options: { ...setupState.options } });
  }

  function doResume() {
    const live = game && game.phase !== 'over';
    if (live) {
      closeSetup();
      return;
    }
    if (!savedGame || !isValidGame(savedGame.game) || savedGame.game.phase === 'over') return;
    flowId += 1;
    game = savedGame.game;
    feed = Array.isArray(savedGame.feed) ? savedGame.feed.slice(-40) : [];
    savedGame = null;
    statsRecorded = false;
    paused = false;
    busy = false;
    rolling = false;
    setupEl.hidden = true;
    rulesEl.hidden = true;
    resultEl.hidden = true;
    syncScrollLock();
    createTokens();
    restoreDice();
    renderAll();
    beginTurn();
    setTimeout(() => rollBtn.focus({ preventScroll: true }), 40);
  }

  function showResult() {
    if (!game) return;
    paused = true;
    flowId += 1;
    const winner = game.players.find((p) => p.color === game.winner);
    const table = standings(game);
    const humanWin = winner?.type === 'human';
    const title = hasCpu() && humanWin ? 'You win.' : `${colorName(winner?.color || 'red')} wins.`;
    const confetti = reduceMotion() ? '' : Array.from({ length: 28 }, (_, i) => {
      const color = COLORS[i % 4];
      return `<i style="--x:${(i * 37) % 100}%;--d:${(i % 9) * 0.11}s;--r:${(i * 53) % 360}deg;--c:${META[color].hex}"></i>`;
    }).join('');
    const rows = table.map((row, i) => {
      const p = game.players[row.index];
      const human = p.type === 'human';
      return `<div class="lh-standing${row.isWinner ? ' win' : ''}">
        <span class="lh-rank">${i + 1}</span>
        <span class="lh-pdot" style="--pc:${META[row.color].hex}"></span>
        <span class="lh-standing-name"><b>${esc(playerName(p, row.index))}</b><small>${row.home} home · ${row.progress} steps${row.captures ? ` · ${row.captures} captures` : ''}</small></span>
        <span class="lh-standing-tag">${p.type === 'cpu' ? 'CPU' : human && hasCpu() ? 'YOU' : 'HUMAN'}</span>
      </div>`;
    }).join('');
    resultEl.innerHTML = `
      <div class="lh-modal lh-resultcard" role="dialog" aria-modal="true" aria-labelledby="lhResultTitle">
        <div class="lh-confetti" aria-hidden="true">${confetti}</div>
        <p class="lh-eyebrow">MATCH COMPLETE · ${game.players.length} PLAYERS · ${game.rolls} ROLL${game.rolls === 1 ? '' : 'S'}</p>
        <h2 id="lhResultTitle">${esc(title)}</h2>
        <p class="lh-resultsub">${hasCpu() && humanWin ? 'All four marbles are home. The table is yours.' : `${colorName(winner?.color || 'red')} brought all four marbles home.`}</p>
        <div class="lh-standings">${rows}</div>
        <div class="lh-modal-actions">
          <button type="button" class="lh-primary" data-result="again">Play again</button>
          <button type="button" class="lh-ghost" data-result="setup">Change setup</button>
          <button type="button" class="lh-ghost" data-result="copy">Copy result</button>
          ${navigator.share ? '<button type="button" class="lh-ghost" data-result="share">Share</button>' : ''}
        </div>
        <p class="lh-recordline">Record: <b>${stats.wins}</b> win${stats.wins === 1 ? '' : 's'} · <b>${stats.played}</b> match${stats.played === 1 ? '' : 'es'} · best streak <b>${stats.best}</b></p>
      </div>`;
    resultEl.hidden = false;
    syncScrollLock();
    setStatus(title);
    renderTurnbar();
    setTimeout(() => resultEl.querySelector('[data-result="again"]')?.focus({ preventScroll: true }), 40);
  }

  function resultText() {
    const winner = game.players.find((p) => p.color === game.winner);
    const table = standings(game);
    const lines = table.map((row, i) => `${i + 1}. ${colorName(row.color)} — ${row.home} home, ${row.progress} steps`);
    return `ACTTOLOG — Ludo Himalaya\n${hasCpu() && winner?.type === 'human' ? 'You win!' : `${colorName(winner?.color || 'red')} wins.`} ${game.rolls} rolls, ${game.players.length} players.\n${lines.join('\n')}\nacttolog.github.io/games/ludo-himalaya`;
  }

  /* ── tools ──────────────────────────────────────────────── */
  function syncTools() {
    const soundBtn = q('[data-act="sound"]');
    const viewBtn = q('[data-act="view"]');
    if (soundBtn) {
      soundBtn.textContent = `Sound: ${prefs.sound ? 'on' : 'off'}`;
      soundBtn.setAttribute('aria-pressed', String(prefs.sound));
    }
    if (viewBtn) {
      viewBtn.textContent = `View: ${prefs.flat ? 'flat' : '3D'}`;
      viewBtn.setAttribute('aria-pressed', String(prefs.flat));
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await root.querySelector('#lhRoot').requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast('Full screen is not available in this browser.');
    }
  }

  /* ── events ─────────────────────────────────────────────── */
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const act = btn.dataset.act;
      if (act === 'rules' || act === 'open-rules') openRules();
      else if (act === 'sound') {
        prefs.sound = !prefs.sound;
        savePrefs();
        syncTools();
        if (prefs.sound) sfx.click();
      } else if (act === 'view') {
        prefs.flat = !prefs.flat;
        q('#lhRoot').classList.toggle('flat', prefs.flat);
        savePrefs();
        syncTools();
        boardEl.style.setProperty('--rx', prefs.flat ? '0deg' : '16deg');
        boardEl.style.setProperty('--rz', '0deg');
      } else if (act === 'full') toggleFullscreen();
      else if (act === 'new') openSetup();
      else if (act === 'start') startFromSetup();
      else if (act === 'resume') doResume();
      else if (act === 'close-setup') closeSetup();
      else if (act === 'close-rules') closeRules();
      return;
    }
    const segP = e.target.closest('[data-players]');
    if (segP) {
      setupState.players = Number(segP.dataset.players);
      setupState.mode = setupState.mode;
      updateSetupUI();
      savePrefs();
      return;
    }
    const segM = e.target.closest('[data-mode]');
    if (segM) {
      setupState.mode = segM.dataset.mode;
      updateSetupUI();
      savePrefs();
      return;
    }
    const segD = e.target.closest('[data-diff]');
    if (segD) {
      setupState.difficulty = segD.dataset.diff;
      prefs.difficulty = segD.dataset.diff;
      updateSetupUI();
      savePrefs();
      return;
    }
    const res = e.target.closest('[data-result]');
    if (res) {
      const what = res.dataset.result;
      if (what === 'again') {
        const cfg = currentConfig();
        const colors = PLAYER_SETS[cfg.players] || PLAYER_SETS[2];
        const types = cfg.mode === 'cpu' ? colors.map((c, i) => (i === 0 ? 'human' : 'cpu')) : colors.map(() => 'human');
        startGame({ colors, types, options: cfg.options });
      } else if (what === 'setup') {
        resultEl.hidden = true;
        syncScrollLock();
        openSetup();
      } else if (what === 'copy') {
        copyText(resultText());
      } else if (what === 'share') {
        shareText(resultText());
      }
    }
  });

  root.addEventListener('change', (e) => {
    const input = e.target.closest('[data-opt]');
    if (!input) return;
    setupState.options[input.dataset.opt] = input.checked;
    savePrefs();
  });

  rollBtn.addEventListener('click', () => requestRoll(false));
  diceBtn.addEventListener('click', () => requestRoll(false));

  function onKey(e) {
    if (destroyed) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'r' || e.key === 'R') {
      if (!setupEl.hidden || !rulesEl.hidden || !resultEl.hidden) return;
      e.preventDefault();
      requestRoll(false);
    } else if (e.key === 'Escape') {
      if (!rulesEl.hidden) closeRules();
      else if (!setupEl.hidden && game && game.phase !== 'over') closeSetup();
    } else if (/^[1-4]$/.test(e.key)) {
      if (!game || paused || setupEl.hidden === false || game.phase !== 'choosing') return;
      const current = currentPlayer(game);
      if (current?.type !== 'human') return;
      moveToken(Number(e.key) - 1);
    }
  }
  window.addEventListener('keydown', onKey);

  function onFullscreenChange() {
    const btn = q('[data-act="full"]');
    if (btn) btn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);

  let stageRaf = 0;
  function parallax(e) {
    if (prefs.flat || reduceMotion() || e.pointerType === 'touch') return;
    cancelAnimationFrame(stageRaf);
    stageRaf = requestAnimationFrame(() => {
      const r = stageEl.getBoundingClientRect();
      const dx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
      const dy = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
      boardEl.style.setProperty('--rz', `${dx * 2.2}deg`);
      boardEl.style.setProperty('--rx', `${16 + dy * 2.2}deg`);
    });
  }
  function resetTilt() {
    boardEl.style.setProperty('--rz', '0deg');
    boardEl.style.setProperty('--rx', prefs.flat ? '0deg' : '16deg');
  }
  stageEl.addEventListener('pointermove', parallax);
  stageEl.addEventListener('pointerleave', resetTilt);

  /* ── boot ───────────────────────────────────────────────── */
  resetDice();
  renderAll();
  syncTools();
  boardEl.style.setProperty('--rx', prefs.flat ? '0deg' : '16deg');
  boardEl.style.setProperty('--rz', '0deg');
  openSetup();

  /* ── test hooks (only with ?ludoTest) ───────────────────── */
  const testMode = new URLSearchParams(location.search).has('ludoTest');
  let api = null;
  if (testMode) {
    api = {
      version: VERSION,
      state: () => (game ? JSON.parse(JSON.stringify(game)) : null),
      phase: () => (game ? game.phase : 'setup'),
      busy: () => Boolean(busy || rolling),
      setupOpen: () => !setupEl.hidden,
      resultOpen: () => !resultEl.hidden,
      start: (cfg = {}) => {
        const players = [2, 3, 4].includes(cfg.players) ? cfg.players : 2;
        const colors = PLAYER_SETS[players];
        const mode = cfg.mode === 'human' ? 'human' : 'cpu';
        const types = mode === 'cpu' ? colors.map((c, i) => (i === 0 ? 'human' : 'cpu')) : colors.map(() => 'human');
        setupState.players = players;
        setupState.mode = mode;
        setupState.difficulty = cfg.difficulty === 'easy' ? 'easy' : 'sharp';
        setupState.options = { ...DEFAULT_OPTIONS, ...(cfg.options || {}) };
        startGame({ colors, types, options: setupState.options });
        return true;
      },
      queue: (...vals) => {
        const flat = vals.flat ? vals.flat(Infinity) : vals;
        testDice.push(...flat.map(Number).filter((n) => n >= 1 && n <= 6));
      },
      roll: (value) => {
        if (Number.isInteger(value)) testDice.push(value);
        requestRoll(false);
      },
      pick: (i) => moveToken(i),
      setToken: (color, i, pos) => {
        if (!game || busy || rolling) return false;
        const p = game.players.find((x) => x.color === color);
        if (!p || !Number.isInteger(i) || i < 0 || i > 3) return false;
        if (!Number.isInteger(pos) || pos < -1 || pos > PATH_STEPS) return false;
        p.tokens[i] = pos;
        renderAll();
        saveGame();
        return true;
      },
      setTurn: (index) => {
        if (!game || busy || rolling) return false;
        flowId += 1;
        game.turn = ((index % game.players.length) + game.players.length) % game.players.length;
        game.phase = 'rolling';
        game.dice = null;
        game.sixes = 0;
        paused = false;
        statusText = '';
        renderAll();
        saveGame();
        if (currentPlayer(game).type === 'cpu') scheduleCpuRoll();
        return true;
      },
      speed: (ms) => { speed = Number.isFinite(ms) ? Math.max(0, ms) : null; },
      feed: () => feed.map((f) => f.text),
    };
    window.__ludo = api;
  }

  return () => {
    destroyed = true;
    flowId += 1;
    cancelAnimationFrame(stageRaf);
    try { saveGame(); } catch { /* ignore */ }
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.documentElement.style.overflow = '';
    sfx?.dispose();
    if (api && window.__ludo === api) delete window.__ludo;
  };
}
