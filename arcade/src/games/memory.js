import { $, $$, fmt, load, save, shuffle, copyText } from '../util.js';

const SYMBOLS = [
  { s: '🏔️', n: 'Himalaya' },
  { s: '🦏', n: 'One-horned rhino' },
  { s: '🌺', n: 'Laligurans' },
  { s: '🥟', n: 'Momo' },
  { s: '🛕', n: 'Temple' },
  { s: '🦚', n: 'Danphe' },
  { s: '🍵', n: 'Chiya' },
  { s: '🙏', n: 'Namaste' },
];

export function mount(root) {
  let bestMoves = load('memory:best', 0);
  let destroyed = false;

  root.innerHTML = `
    <div class="g-wrap g-pad" id="mnRoot">
      <div class="g-head">
        <div><h2>Memory Nepal</h2><p class="sub">Eight pairs of Nepal icons. Flip, remember, match — in as few moves as you can.</p></div>
        <div class="g-row end">
          <div class="stat"><b id="mnMoves">0</b><span>MOVES</span></div>
          <div class="stat"><b id="mnPairs">0/8</b><span>PAIRS</span></div>
          <div class="stat"><b id="mnTime">0:00</b><span>TIME</span></div>
          <div class="stat accent"><b id="mnBest">${bestMoves ? bestMoves : '—'}</b><span>BEST MOVES</span></div>
        </div>
      </div>
      <div class="mn-grid" id="mnGrid" role="grid" aria-label="Memory Nepal card grid"></div>
      <p class="g-hint">CLICK OR TAB + ENTER TO FLIP · MATCH ALL EIGHT PAIRS</p>
    </div>`;

  const grid = $('#mnGrid', root);
  const movesEl = $('#mnMoves', root);
  const pairsEl = $('#mnPairs', root);
  const timeEl = $('#mnTime', root);
  const bestEl = $('#mnBest', root);

  let open = [];
  let lock = false;
  let moves = 0, pairs = 0;
  let startTime = 0, timer = 0, finished = false;

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function hud() {
    movesEl.textContent = moves;
    pairsEl.textContent = `${pairs}/8`;
    bestEl.textContent = bestMoves || '—';
  }

  function deal() {
    grid.innerHTML = '';
    open = []; lock = false; moves = 0; pairs = 0; finished = false;
    startTime = 0;
    clearInterval(timer);
    timeEl.textContent = '0:00';
    const deck = shuffle([...SYMBOLS, ...SYMBOLS]);
    deck.forEach((sym, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mn-card';
      card.dataset.idx = i;
      card.dataset.sym = sym.s;
      card.setAttribute('aria-label', `Card ${i + 1}, face down`);
      card.innerHTML = `
        <span class="mn-inner">
          <span class="mn-face mn-front" aria-hidden="true">✦</span>
          <span class="mn-face mn-back" aria-hidden="true">${sym.s}</span>
        </span>`;
      card.addEventListener('click', () => flip(card, sym));
      grid.appendChild(card);
    });
    hud();
  }

  function flip(card, sym) {
    if (destroyed || lock || finished || card.classList.contains('open')) return;
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => { timeEl.textContent = fmtTime(Date.now() - startTime); }, 500);
    }
    card.classList.add('open');
    card.setAttribute('aria-label', `${sym.n}, face up`);
    open.push({ card, sym });
    if (open.length < 2) return;

    moves++;
    hud();
    const [a, b] = open;
    open = [];
    if (a.sym.s === b.sym.s) {
      a.card.classList.add('done');
      b.card.classList.add('done');
      pairs++;
      hud();
      if (pairs === 8) win();
    } else {
      lock = true;
      setTimeout(() => {
        if (destroyed) return;
        a.card.classList.remove('open');
        b.card.classList.remove('open');
        a.card.setAttribute('aria-label', 'Card, face down');
        b.card.setAttribute('aria-label', 'Card, face down');
        lock = false;
      }, 750);
    }
  }

  function win() {
    finished = true;
    clearInterval(timer);
    const elapsed = Date.now() - startTime;
    timeEl.textContent = fmtTime(elapsed);
    const isNew = !bestMoves || moves < bestMoves;
    if (isNew) { bestMoves = moves; save('memory:best', bestMoves); }
    hud();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="All pairs matched">
        <h3>Sabai milo!</h3>
        <div class="score-big">${moves} moves</div>
        <p>${isNew ? 'New personal best. ' : ''}All eight pairs in ${fmtTime(elapsed)}.</p>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="mnAgain">Deal again</button>
          <button type="button" class="btn" id="mnCopy">Copy result</button>
          <a class="btn" href="./">Arcade home</a>
        </div>
      </div>`;
    $('#mnRoot', root).appendChild(ov);
    $('#mnAgain', ov).addEventListener('click', () => { ov.remove(); deal(); });
    $('#mnCopy', ov).addEventListener('click', () =>
      copyText(`Memory Nepal — all 8 pairs in ${moves} moves (${fmtTime(elapsed)}). Play: ${location.origin}/arcade/index.html?game=memory-nepal`));
  }

  deal();

  return () => {
    destroyed = true;
    clearInterval(timer);
    $$('.mn-card', grid).forEach((c) => c.replaceWith(c.cloneNode(true)));
  };
}