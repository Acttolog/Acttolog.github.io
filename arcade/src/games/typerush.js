import { PASSAGES, NEPALI_WORDS } from '../data.js';
import { $, esc, fmt, load, save, copyText, shuffle } from '../util.js';

const DURATION = 60000;
const SAVE_MIN_MS = 15000;
const SAVE_MIN_CHARS = 30;

function buildTarget(mode, previous) {
  if (mode === 'nepali') return shuffle(NEPALI_WORDS).slice(0, 24).join(' ');
  const pool = PASSAGES.filter((p) => p.text !== previous);
  return pool[Math.floor(Math.random() * pool.length)].text;
}

export function mount(root) {
  let mode = 'facts';
  let target = buildTarget(mode, '');
  let pos = 0;
  let errors = 0;
  let running = false;
  let finished = false;
  let startedAt = 0;
  let elapsed = 0;
  let timerId = null;
  let best = load('typerush:best:facts', 0);

  root.innerHTML = `
    <div class="g-wrap g-pad" id="trRoot">
      <div class="g-head">
        <div>
          <h2>TypeRush Nepal</h2>
          <p class="sub">Sixty seconds, one Nepal passage. Wrong keys are counted, never typed — accuracy is part of the score.</p>
        </div>
        <div class="g-row end">
          <div class="stat"><b id="trWpm">0</b><span>WPM</span></div>
          <div class="stat"><b id="trAcc">100%</b><span>ACCURACY</span></div>
          <div class="stat accent"><b id="trBest">${fmt(best)}</b><span>BEST WPM</span></div>
          <button type="button" class="btn small" id="trEnd" disabled>End test</button>
        </div>
      </div>
      <div class="tr-top">
        <div class="tr-modes" role="group" aria-label="Passage type">
          <button type="button" data-mode="facts" aria-pressed="true">Nepal facts</button>
          <button type="button" data-mode="nepali" aria-pressed="false">Romanized Nepali</button>
        </div>
        <div class="g-row" style="margin-left:auto">
          <span class="kh-round" id="trTime">60.0s</span>
          <button type="button" class="btn small" id="trRestart">Restart</button>
        </div>
      </div>
      <div class="progress" style="margin:0 0 12px"><i id="trBar" style="width:100%"></i></div>
      <div class="tr-stage" id="trStage">
        <div class="tr-text" id="trText"></div>
        <textarea class="tr-type" id="trInput" aria-label="Typing input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
      </div>
      <div class="tr-start">
        <p class="small dim" id="trNote" style="margin:0">Tap the passage, then start typing. The clock starts on your first key.</p>
        <p class="tr-mobile-note">On a phone, tap the passage to open the keyboard.</p>
        <div class="tr-stats">
          <div class="stat"><b id="trChars">0</b><span>CHARS</span></div>
          <div class="stat"><b id="trErr">0</b><span>MISTAKES</span></div>
        </div>
      </div>
    </div>`;

  const textEl = $('#trText', root);
  const stage = $('#trStage', root);
  const input = $('#trInput', root);
  const wpmEl = $('#trWpm', root);
  const accEl = $('#trAcc', root);
  const bestEl = $('#trBest', root);
  const timeEl = $('#trTime', root);
  const barEl = $('#trBar', root);
  const charsEl = $('#trChars', root);
  const errEl = $('#trErr', root);
  const noteEl = $('#trNote', root);
  const endBtn = $('#trEnd', root);
  const host = $('#trRoot', root);

  function renderText() {
    let html = '';
    for (let i = 0; i < target.length; i++) {
      let cls = 'tr-char';
      if (i < pos) cls += ' done';
      else if (i === pos) cls += ' cur';
      html += `<span class="${cls}">${esc(target[i])}</span>`;
    }
    textEl.innerHTML = html;
    const cur = textEl.querySelector('.cur');
    if (cur) {
      const top = cur.offsetTop;
      if (top < stage.scrollTop + 6 || top > stage.scrollTop + stage.clientHeight - 46) {
        stage.scrollTop = Math.max(0, top - 40);
      }
    }
  }

  const stats = () => {
    const attempts = pos + errors;
    const acc = attempts ? Math.round((pos / attempts) * 100) : 100;
    const minutes = Math.max(elapsed, 1) / 60000;
    const wpm = elapsed > 1000 ? Math.round(pos / 5 / minutes) : 0;
    return { attempts, acc, wpm };
  };

  function updateStats() {
    const s = stats();
    wpmEl.textContent = String(s.wpm);
    accEl.textContent = `${s.acc}%`;
    charsEl.textContent = fmt(pos);
    errEl.textContent = fmt(errors);
  }

  function updateTimer(now) {
    elapsed = Math.min(DURATION, now - startedAt);
    const rem = Math.max(0, DURATION - elapsed);
    timeEl.textContent = `${(rem / 1000).toFixed(1)}s`;
    barEl.style.width = `${(rem / DURATION) * 100}%`;
    updateStats();
    if (rem <= 0) finish('time');
  }

  function tick() {
    if (!running) return;
    updateTimer(performance.now());
  }

  function startRun() {
    running = true;
    finished = false;
    startedAt = performance.now();
    elapsed = 0;
    noteEl.textContent = 'Typing… mistakes are counted automatically.';
    endBtn.disabled = false;
    timerId = setInterval(tick, 100);
  }

  function flashBad() {
    const cur = textEl.querySelector('.cur');
    if (!cur) return;
    cur.classList.add('bad');
    setTimeout(() => cur.classList.remove('bad'), 140);
  }

  function handleChar(ch) {
    if (finished) return;
    if (ch === '\n' || ch === '\r' || ch === '\t') return;
    if (!running) startRun();
    if (pos >= target.length) return;
    if (ch === target[pos]) {
      pos += 1;
      renderText();
      updateStats();
      if (pos >= target.length) finish('passage');
    } else {
      errors += 1;
      flashBad();
      updateStats();
    }
  }

  function finish(reason) {
    if (!running || finished) return;
    finished = true;
    running = false;
    clearInterval(timerId);
    timerId = null;
    if (!elapsed) elapsed = Math.min(DURATION, performance.now() - startedAt);
    const s = stats();
    const secs = Math.max(1, Math.round(elapsed / 1000));
    const saveable = elapsed >= SAVE_MIN_MS && pos >= SAVE_MIN_CHARS;
    const prevBest = load(`typerush:best:${mode}`, 0);
    const isNew = saveable && s.wpm > prevBest;
    if (isNew) {
      save(`typerush:best:${mode}`, s.wpm);
      best = s.wpm;
      bestEl.textContent = fmt(best);
    }
    endBtn.disabled = true;
    input.blur();
    const share = `ACTTOLOG ARCADE — TypeRush Nepal\n${s.wpm} WPM · ${s.acc}% accuracy · ${secs}s\n${mode === 'nepali' ? 'Romanized Nepali' : 'Nepal facts'}\nacttolog.github.io/games/typerush-nepal`;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="Typing result">
        <p class="kicker" style="margin-bottom:10px">${reason === 'time' ? 'TIME UP' : reason === 'passage' ? 'PASSAGE COMPLETE' : 'TEST ENDED'}</p>
        <h3>${isNew ? 'New personal best.' : s.wpm >= 50 ? 'Fast fingers.' : 'Good rush.'}</h3>
        <div class="score-big">${s.wpm} <span style="font-size:14px;color:var(--dim);font-weight:600">WPM</span></div>
        <p>${fmt(pos)} characters in ${secs}s with <b>${s.acc}%</b> accuracy. ${fmt(errors)} mistake${errors === 1 ? '' : 's'}.${saveable ? '' : ' Results under 15 seconds are not saved.'}</p>
        <div class="ov-grid">
          <div class="stat"><b>${fmt(best)}</b><span>BEST WPM</span></div>
          <div class="stat"><b>${s.acc}%</b><span>ACCURACY</span></div>
          <div class="stat"><b>${fmt(pos)}</b><span>CHARACTERS</span></div>
        </div>
        <div class="share-box">${esc(share)}</div>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="trAgain">Type again</button>
          <button type="button" class="btn" id="trCopy">Copy result</button>
          <a class="btn" href="./">Arcade home</a>
        </div>
      </div>`;
    host.appendChild(ov);
    ov.querySelector('#trAgain').addEventListener('click', () => { ov.remove(); restart(); });
    ov.querySelector('#trCopy').addEventListener('click', () => copyText(share));
    ov.querySelector('#trAgain').focus();
  }

  function restart() {
    host.querySelectorAll('.overlay').forEach((o) => o.remove());
    clearInterval(timerId);
    timerId = null;
    running = false;
    finished = false;
    pos = 0;
    errors = 0;
    elapsed = 0;
    startedAt = 0;
    target = buildTarget(mode, target);
    best = load(`typerush:best:${mode}`, 0);
    bestEl.textContent = fmt(best);
    wpmEl.textContent = '0';
    accEl.textContent = '100%';
    charsEl.textContent = '0';
    errEl.textContent = '0';
    timeEl.textContent = '60.0s';
    barEl.style.width = '100%';
    endBtn.disabled = true;
    noteEl.textContent = 'Tap the passage, then start typing. The clock starts on your first key.';
    input.value = '';
    renderText();
    stage.scrollTop = 0;
    input.focus({ preventScroll: true });
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    restart();
  }

  input.addEventListener('input', () => {
    const v = input.value;
    input.value = '';
    if (finished) return;
    for (const ch of v) handleChar(ch);
  });
  input.addEventListener('paste', (e) => e.preventDefault());

  const onKey = (e) => {
    if (e.target === input || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(BUTTON|A|TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (finished) return;
    input.focus({ preventScroll: true });
    handleChar(e.key);
  };

  window.addEventListener('keydown', onKey);
  stage.addEventListener('click', () => { if (!finished) input.focus({ preventScroll: true }); });
  endBtn.addEventListener('click', () => finish('early'));
  $('#trRestart', root).addEventListener('click', restart);
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  renderText();

  return () => {
    clearInterval(timerId);
    window.removeEventListener('keydown', onKey);
  };
}
