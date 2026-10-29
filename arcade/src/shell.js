import { GAMES, PHOTOS, MERGE_TILES } from './data.js';
import { esc, $, todayKey } from './util.js';

const BASE_TITLE = 'ACTTOLOG ARCADE — Nepal Series';

function coverArt(id) {
  if (id === 'khoja-nepal') {
    return `<div class="cover-art">
      <img class="cover-img" src="/media/nepal/everest-pano-1600.jpg" alt="">
      <div class="cover-shade"></div>
      <div class="kh-art">
        <div class="kh-grid"><span class="kh-route"></span><span class="kh-pin2"></span></div>
      </div>
    </div>`;
  }
  if (id === 'merge-himalaya') {
    const values = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 64, 128, 16, 32, 8];
    const cells = values.map((v) => {
      const t = MERGE_TILES.find((x) => x.v === v);
      return `<div class="mini-tile" style="background:${t.color}">${v}</div>`;
    }).join('');
    return `<div class="cover-art"><div class="mh-art"><div class="mini-board">${cells}</div></div></div>`;
  }
  if (id === 'himalaya-stack') {
    const blocks = [240, 218, 196, 168, 142, 118, 96, 72].map((w) => `<div class="hs-block" style="width:${w}px"></div>`).join('');
    return `<div class="cover-art"><div class="hs-art"><div class="peak"></div><div class="hs-blocks">${blocks}</div></div></div>`;
  }
  if (id === 'typerush-nepal') {
    return `<div class="cover-art"><div class="tr-art">Nepal is home to <span class="done">eight of the ten</span> <span class="cur">highest</span> mountains on Earth. From the Terai plains to Himalayan ice, deserts and glaciers fit inside one country.</div></div>`;
  }
  return `<div class="cover-art"><div class="nd-art">
    <div class="q">Which is the deepest lake in Nepal?</div>
    <div class="opt">Tilicho Lake</div>
    <div class="opt on">Phoksundo Lake</div>
    <div class="opt">Rara Lake</div>
    <div class="opt">Phewa Lake</div>
  </div></div>`;
}

function renderCover(id) {
  const game = GAMES.find((g) => g.id === id) || GAMES[0];
  const stage = $('#coverStage');
  const app = $('#app');
  if (!stage) return;
  app.hidden = true;
  stage.hidden = false;
  document.body.style.overflow = 'hidden';
  document.title = `${game.title} — ACTTOLOG ARCADE`;
  stage.innerHTML = `<div class="cover" id="coverCard">
    ${coverArt(game.id)}
    <div class="cover-top">
      <div class="cover-brand">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M3 25 13 6l4.4 8.2L22.6 7 30 25z" fill="url(#cg)"/><defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#43e0d3"/><stop offset=".55" stop-color="#8b9bff"/><stop offset="1" stop-color="#ff9f6e"/></linearGradient></defs></svg>
        ACTTOLOG <span class="cover-chip">ARCADE</span>
      </div>
      <span class="cover-nepal">NEPAL SERIES</span>
    </div>
    <div class="cover-copy">
      <p class="cover-kicker">${esc(game.kicker)}</p>
      <h1 class="cover-title">${game.title.split(' ').join('<br>')}</h1>
      <p class="cover-sub">${esc(game.tagline)}</p>
    </div>
    <div class="cover-foot">
      <span><b>ACTTOLOG ARCADE</b> · Built by ACTTOLOG · Nepal</span>
      <span>PLAY FREE · NO ACCOUNT</span>
    </div>
  </div>`;
}

function renderCards(onPlay) {
  const grid = $('#gameGrid');
  if (!grid) return;
  grid.innerHTML = GAMES.map((g) => `
    <a class="gcard" href="?game=${g.id}" data-game="${g.id}" aria-label="Play ${esc(g.title)}">
      <div class="gcard-cover">
        <img src="${g.cover}" alt="" loading="lazy" width="1200" height="675">
        <span class="gcard-play" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16"><path d="M7 4.5v11l9-5.5z" fill="currentColor"/></svg>
        </span>
      </div>
      <div class="gcard-body">
        <div class="gcard-title"><h3>${esc(g.title)}</h3><span class="gcard-badge">FREE</span></div>
        <p class="ne" style="color:var(--dim);font-size:11.6px;margin-top:-4px">${esc(g.ne)}</p>
        <p>${esc(g.blurb)}</p>
        <div class="gcard-meta">
          ${g.meta.map((m) => `<span>${esc(m).toUpperCase()}</span>`).join('')}
          <span class="gcard-cta" style="margin-left:auto">PLAY NOW →</span>
        </div>
      </div>
    </a>`).join('');
  grid.querySelectorAll('[data-game]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      onPlay(a.dataset.game, true);
    });
  });
}

function renderCredits() {
  const list = $('#creditList');
  if (!list) return;
  list.innerHTML = PHOTOS.map((p) => `<li><a href="${p.source}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a> — ${esc(p.credit)} (${esc(p.license)})</li>`).join('');
}

export function initShell(registry) {
  const launcher = $('#launcher');
  const view = $('#gameview');
  const mount = $('#gamemount');
  const back = $('#backBtn');
  let current = null;
  let destroy = null;

  const setChrome = (game) => {
    $('#gvTitle').textContent = game.title;
    $('#gvNe').textContent = game.ne;
    $('#gvMeta').innerHTML = game.meta.map((m) => `<span class="pill">${esc(m)}</span>`).join('');
  };

  const close = (push = true) => {
    if (!current) return;
    try { destroy?.(); } catch (err) { console.error(err); }
    destroy = null;
    current = null;
    mount.innerHTML = '';
    view.hidden = true;
    launcher.hidden = false;
    document.title = BASE_TITLE;
    if (push) history.pushState({ view: 'launcher' }, '', location.pathname);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const open = (id, push = true) => {
    const game = GAMES.find((g) => g.id === id);
    const mod = registry[id];
    if (!game || !mod) {
      close(false);
      return;
    }
    if (current && current.id === id) return;
    if (current) {
      try { destroy?.(); } catch (err) { console.error(err); }
      destroy = null;
      mount.innerHTML = '';
    }
    current = game;
    setChrome(game);
    launcher.hidden = true;
    view.hidden = false;
    document.title = `${game.title} — ACTTOLOG ARCADE`;
    mount.innerHTML = '';
    destroy = mod.mount(mount, { game }) || null;
    if (push) history.pushState({ view: 'game', id }, '', `?game=${id}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  renderCards(open);
  renderCredits();
  back?.addEventListener('click', () => close(true));
  $('#topbar .brand')?.addEventListener('click', (e) => {
    if (!current) return;
    e.preventDefault();
    close(true);
  });
  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('game');
    if (id) open(id, false);
    else close(false);
  });

  const params = new URLSearchParams(location.search);
  if (params.get('cover')) {
    renderCover(params.get('cover'));
    return;
  }
  const id = params.get('game');
  if (id && GAMES.some((g) => g.id === id) && registry[id]) {
    open(id, false);
  } else if (id) {
    history.replaceState({ view: 'launcher' }, '', location.pathname);
  }
}
