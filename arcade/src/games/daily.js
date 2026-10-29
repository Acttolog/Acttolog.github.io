import { TRIVIA } from '../data.js';
import { $, esc, load, save, seededPick, shuffle, shareText, todayKey, copyText } from '../util.js';

const COUNT = 10;

function streakState() {
  const st = load('daily:streak', { last: '', n: 0 });
  if (!st || !st.last) return 0;
  const today = todayKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return st.last === today || st.last === todayKey(y) ? st.n : 0;
}

function recordStreak() {
  const today = todayKey();
  const st = load('daily:streak', { last: '', n: 0 });
  if (st.last === today) return st.n;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const n = st.last === todayKey(y) ? st.n + 1 : 1;
  save('daily:streak', { last: today, n });
  return n;
}

export function mount(root) {
  const today = todayKey();
  let mode = 'daily';
  let questions = [];
  let index = 0;
  let answered = false;
  let selected = -1;
  let answers = [];
  let destroyed = false;

  root.innerHTML = `
    <div class="g-wrap g-pad" id="ndRoot">
      <div class="nd-wrap">
        <div class="nd-main" id="ndMain"></div>
        <aside class="nd-side">
          <div class="nd-streak"><b id="ndStreak">${streakState()}</b><span>DAY STREAK</span></div>
          <div class="nd-streak"><b id="ndScore">0</b><span>SCORE · /${COUNT}</span></div>
          <div class="nd-share" id="ndGrid" aria-hidden="true">${Array.from({ length: COUNT }, () => '<i></i>').join('')}</div>
          <button type="button" class="btn small" id="ndPractice">Practice mode</button>
          <p class="small dim" style="margin:0;line-height:1.5">The same ten questions for everyone, refreshed at midnight. Practice never changes your streak.</p>
        </aside>
      </div>
    </div>`;

  const main = $('#ndMain', root);
  const grid = $('#ndGrid', root);
  const scoreEl = $('#ndScore', root);
  const streakEl = $('#ndStreak', root);
  const host = $('#ndRoot', root);

  function paintGrid() {
    [...grid.children].forEach((cell, i) => {
      cell.className = '';
      if (i < answers.length) cell.className = answers[i] ? 'hit' : 'miss';
    });
    scoreEl.textContent = String(answers.filter(Boolean).length);
  }

  function showLocked(saved) {
    const hits = '🟩'.repeat(saved.score) + '🟥'.repeat(COUNT - saved.score);
    main.innerHTML = `
      <div class="nd-qhead"><span class="nd-cat">NEPAL DAILY</span><span class="nd-count">${today}</span></div>
      <h3 class="nd-q" style="margin-bottom:6px">Today's set is complete.</h3>
      <p class="small dim" style="margin:0 0 12px">You scored <b style="color:var(--txt)">${saved.score} / ${COUNT}</b>. A new set arrives after midnight — practice stays open all day.</p>
      <div class="nd-share" style="margin-bottom:16px">${Array.from({ length: COUNT }, (_, i) => `<i class="${i < saved.score ? 'hit' : 'miss'}"></i>`).join('')}</div>
      <p class="small dim" style="margin:0 0 14px">${hits}</p>
      <div class="g-row">
        <button type="button" class="btn primary small" id="ndLockedPractice">Practice set</button>
        <button type="button" class="btn small" id="ndLockedShare">Share result</button>
      </div>`;
    main.querySelector('#ndLockedPractice').addEventListener('click', () => start('practice'));
    main.querySelector('#ndLockedShare').addEventListener('click', () => {
      shareText(`ACTTOLOG ARCADE — Nepal Daily\n${today} · ${saved.score}/${COUNT}\n${hits}\nacttolog.github.io/games/nepal-daily`);
    });
  }

  function start(nextMode) {
    host.querySelectorAll('.overlay').forEach((o) => o.remove());
    mode = nextMode;
    questions = nextMode === 'daily'
      ? seededPick(TRIVIA, COUNT, `daily:${today}`, (q) => q.c)
      : seededPick(TRIVIA, COUNT, `practice:${Date.now()}:${Math.random()}`, (q) => q.c);
    index = 0;
    answers = [];
    paintGrid();
    renderQuestion();
  }

  function renderQuestion() {
    answered = false;
    selected = -1;
    const q = questions[index];
    if (!q) { finish(); return; }
    main.innerHTML = `
      <div class="nd-qhead">
        <span class="nd-cat">${esc(q.c)}</span>
        <span class="nd-count">QUESTION ${index + 1} / ${COUNT}</span>
      </div>
      <div class="progress" style="margin:-2px 0 14px"><i style="width:${((index) / COUNT) * 100}%"></i></div>
      <h3 class="nd-q" id="ndQ">${esc(q.q)}</h3>
      <div class="nd-options" id="ndOptions" role="group" aria-label="Answer options">
        ${q.o.map((opt, i) => `<button type="button" class="nd-opt" data-opt="${i}"><kbd>${i + 1}</kbd><span class="txt">${esc(opt)}</span></button>`).join('')}
      </div>
      <div class="nd-why" id="ndWhy" hidden></div>
      <div class="g-row" style="margin-top:14px">
        <button type="button" class="btn primary small" id="ndNext" hidden>${index === COUNT - 1 ? 'See result' : 'Next question'} →</button>
      </div>`;
    main.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.opt))));
    main.querySelector('#ndNext').addEventListener('click', next);
    paintGrid();
  }

  function answer(i) {
    if (answered) return;
    answered = true;
    selected = i;
    const q = questions[index];
    const correct = i === q.a;
    answers.push(correct);
    paintGrid();
    main.querySelectorAll('[data-opt]').forEach((b, bi) => {
      b.disabled = true;
      if (bi === q.a) b.classList.add('right');
      else if (bi === i) b.classList.add('wrong');
    });
    const why = main.querySelector('#ndWhy');
    why.hidden = false;
    why.innerHTML = `<b style="color:${correct ? 'var(--ok)' : 'var(--bad)'}">${correct ? 'Correct.' : 'Not quite.'}</b> ${esc(q.why)}`;
    const nextBtn = main.querySelector('#ndNext');
    nextBtn.hidden = false;
    nextBtn.focus({ preventScroll: true });
    const bar = main.querySelector('.progress i');
    if (bar) bar.style.width = `${((index + 1) / COUNT) * 100}%`;
  }

  function next() {
    if (!answered) return;
    index += 1;
    if (index >= COUNT) finish();
    else renderQuestion();
  }

  function finish() {
    const score = answers.filter(Boolean).length;
    const hits = answers.map((a) => (a ? '🟩' : '🟥')).join('');
    const share = `ACTTOLOG ARCADE — Nepal Daily\n${mode === 'daily' ? today : 'Practice'} · ${score}/${COUNT}\n${hits}\nacttolog.github.io/games/nepal-daily`;
    if (mode === 'daily') {
      const prev = load('daily:result', null);
      if (!prev || prev.date !== today) save('daily:result', { date: today, score, answers });
      streakEl.textContent = String(recordStreak());
    }
    const isDaily = mode === 'daily';
    if (isDaily) showLocked({ date: today, score });
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="Quiz result" style="--ok:${isDaily ? 'var(--ok)' : 'var(--gold)'}">
        <p class="kicker" style="margin-bottom:10px">${isDaily ? 'DAILY SET COMPLETE' : 'PRACTICE COMPLETE'}</p>
        <h3>${score >= 9 ? 'Nepal expert.' : score >= 7 ? 'Strong knowledge.' : score >= 4 ? 'A good start.' : 'Tomorrow is another climb.'}</h3>
        <div class="score-big">${score} <span style="font-size:14px;color:var(--dim);font-weight:600">/ ${COUNT}</span></div>
        <p>${isDaily ? `Day streak: <b>${streakState()}</b>. The same set is open to everyone today — share your grid and compare.` : 'Practice rounds do not change your daily streak. The daily set is always ten questions from the full bank.'}</p>
        <div class="nd-share" style="margin:14px 0 0">${answers.map((a) => `<i class="${a ? 'hit' : 'miss'}"></i>`).join('')}</div>
        <div class="share-box">${esc(share)}</div>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="ndAgain">${isDaily ? 'Practice set' : 'Practice again'}</button>
          <button type="button" class="btn" id="ndCopy">Copy result</button>
          <a class="btn" href="./">Arcade home</a>
        </div>
      </div>`;
    host.appendChild(ov);
    ov.querySelector('#ndAgain').addEventListener('click', () => { ov.remove(); start('practice'); });
    ov.querySelector('#ndCopy').addEventListener('click', () => copyText(share));
    ov.querySelector('#ndAgain').focus();
  }

  const onKey = (e) => {
    if (host.querySelector('.overlay')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!answered && /^[1-4]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (questions[index] && i < questions[index].o.length) {
        e.preventDefault();
        answer(i);
      }
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  };
  window.addEventListener('keydown', onKey);
  $('#ndPractice', root).addEventListener('click', () => start('practice'));

  const saved = load('daily:result', null);
  if (saved && saved.date === today) {
    answers = Array.isArray(saved.answers) ? saved.answers : [];
    showLocked(saved);
    paintGrid();
    scoreEl.textContent = String(saved.score);
  } else {
    start('daily');
  }

  return () => {
    destroyed = true;
    window.removeEventListener('keydown', onKey);
  };
}
