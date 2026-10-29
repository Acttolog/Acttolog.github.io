import { PHOTOS, photoPath, photoCredit } from '../data.js';
import { $, esc, fmt, load, save, seededPick, shuffle, shareText, todayKey, copyText } from '../util.js';

let leafletPromise = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = './vendor/leaflet/leaflet.css';
      css.dataset.leaflet = '1';
      document.head.appendChild(css);
    }
    const script = document.createElement('script');
    script.src = './vendor/leaflet/leaflet.js';
    script.async = true;
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet unavailable')));
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

const ROUNDS = 5;
const MAX_ROUND = 5000;
const HINT_CAP = 3000;
const SCALE_KM = 300;

const haversine = (a, b) => {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const scoreFor = (km) => Math.round(MAX_ROUND * Math.exp(-km / SCALE_KM));
const groupOf = (p) => p.region.split(',')[0];
const rankFor = (total) => {
  const pct = total / (ROUNDS * MAX_ROUND);
  if (pct >= 0.92) return 'Himalayan cartographer';
  if (pct >= 0.72) return 'Valley expert';
  if (pct >= 0.48) return 'Trail finder';
  if (pct >= 0.24) return 'Curious trekker';
  return 'First-time visitor';
};

function picksFor(mode) {
  if (mode === 'daily') return seededPick(PHOTOS, ROUNDS, `khoja:${todayKey()}`, groupOf);
  return shuffle(PHOTOS).slice(0, ROUNDS);
}

const squares = (points) => points.map((p) => {
  const r = p / MAX_ROUND;
  return r >= 0.8 ? '🟩' : r >= 0.55 ? '🟨' : r >= 0.3 ? '🟧' : '🟥';
}).join('');

export function mount(root) {
  let mode = 'daily';
  let picks = picksFor(mode);
  let round = 0;
  let total = 0;
  let points = [];
  let hintUsed = false;
  let guess = null;
  let truthMarker = null;
  let guessMarker = null;
  let line = null;
  let map = null;
  let destroyed = false;
  let observer = null;
  let answered = false;

  root.innerHTML = `
    <div class="g-wrap" id="khRoot">
      <div class="kh-wrap">
        <div class="kh-photo">
          <picture>
            <source id="khAvif" type="image/avif">
            <img id="khImg" alt="" width="1024" height="683">
          </picture>
          <div class="kh-top">
            <div class="g-row">
              <span class="kh-round" id="khRound">ROUND 1 / ${ROUNDS}</span>
              <span class="kh-round" id="khMode">DAILY</span>
            </div>
            <button type="button" class="kh-round" id="khSwitch" style="cursor:pointer">Practice</button>
          </div>
          <div class="kh-hint" id="khHint" hidden></div>
          <div class="kh-credit" id="khCredit"></div>
        </div>
        <div class="kh-map-pane">
          <div class="kh-map" id="khMap" role="application" aria-label="Map of Nepal. Click or tap to drop your guess."></div>
          <div class="kh-result" id="khResult" hidden></div>
          <div class="kh-controls">
            <p class="msg" id="khMsg">Tap the map to drop your pin.</p>
            <button type="button" class="btn ghost small" id="khCenter" title="Place the pin at the map centre">Pin centre</button>
            <button type="button" class="btn ghost small" id="khHintBtn">Hint −15%</button>
            <button type="button" class="btn primary small" id="khConfirm" disabled>Confirm guess</button>
          </div>
        </div>
      </div>
    </div>`;

  const el = {
    img: $('#khImg', root), avif: $('#khAvif', root), credit: $('#khCredit', root),
    round: $('#khRound', root), mode: $('#khMode', root), hint: $('#khHint', root),
    mapEl: $('#khMap', root), msg: $('#khMsg', root), confirm: $('#khConfirm', root),
    hintBtn: $('#khHintBtn', root), center: $('#khCenter', root),
    result: $('#khResult', root), switchBtn: $('#khSwitch', root), root: $('#khRoot', root),
  };

  function renderRound() {
    const p = picks[round];
    answered = false;
    hintUsed = false;
    guess = null;
    el.round.textContent = `ROUND ${round + 1} / ${ROUNDS}`;
    el.mode.textContent = mode.toUpperCase();
    el.switchBtn.textContent = mode === 'daily' ? 'Practice' : 'Daily';
    el.img.src = photoPath(p.slug, 1024, 'jpg');
    el.avif.srcset = photoPath(p.slug, 1024, 'avif');
    el.img.alt = `${p.title} — where in Nepal is this?`;
    el.credit.innerHTML = `${esc(photoCredit(p))} · <a href="${p.source}" target="_blank" rel="noopener noreferrer">source</a>`;
    el.hint.hidden = true;
    el.hint.textContent = '';
    el.hintBtn.disabled = false;
    el.hintBtn.style.opacity = '';
    el.confirm.disabled = true;
    el.msg.innerHTML = 'Tap the map to drop your pin.';
    el.result.hidden = true;
    el.result.innerHTML = '';
    if (guessMarker) { guessMarker.remove(); guessMarker = null; }
    if (truthMarker) { truthMarker.remove(); truthMarker = null; }
    if (line) { line.remove(); line = null; }
    if (map) {
      map.flyTo([28.3949, 84.124], 7, { duration: 0.3 });
      map.closePopup();
    }
  }

  function placeGuess(latlng) {
    if (answered || !map) return;
    guess = { lat: latlng.lat, lng: latlng.lng };
    if (guessMarker) guessMarker.setLatLng(latlng);
    else {
      guessMarker = window.L.marker(latlng, {
        icon: window.L.divIcon({ className: '', html: '<span class="kh-pin"></span>', iconSize: [22, 22], iconAnchor: [11, 22] }),
        keyboard: false,
      }).addTo(map);
    }
    el.confirm.disabled = false;
    el.msg.innerHTML = 'Pin dropped. <b>Confirm</b> when you are ready.';
  }

  function useHint() {
    if (answered || hintUsed) return;
    hintUsed = true;
    const p = picks[round];
    el.hint.hidden = false;
    el.hint.innerHTML = `<b>Region hint:</b> ${esc(p.region)} · <span class="dim">max ${fmt(HINT_CAP)} pts this round</span>`;
    el.hintBtn.disabled = true;
    el.hintBtn.style.opacity = '.45';
    el.msg.innerHTML = 'Hint used — the region is shown on the photo.';
  }

  function submit() {
    if (answered || !guess || !map) return;
    answered = true;
    const p = picks[round];
    const truth = { lat: p.lat, lng: p.lng };
    const km = haversine(guess, truth);
    let pts = scoreFor(km);
    if (hintUsed) pts = Math.min(pts, HINT_CAP);
    points.push(pts);
    total += pts;

    truthMarker = window.L.marker([p.lat, p.lng], {
      icon: window.L.divIcon({ className: '', html: '<span class="kh-pin truth"></span>', iconSize: [22, 22], iconAnchor: [11, 22] }),
      keyboard: false,
    }).addTo(map).bindTooltip(esc(p.title), { direction: 'top', offset: [0, -18] });
    line = window.L.polyline([[guess.lat, guess.lng], [p.lat, p.lng]], {
      color: '#43e0d3', weight: 2, dashArray: '6 6', opacity: 0.9,
    }).addTo(map);
    map.fitBounds(window.L.latLngBounds([[guess.lat, guess.lng], [p.lat, p.lng]]).pad(0.35), { animate: false });

    el.confirm.disabled = true;
    el.hintBtn.disabled = true;
    const dist = km < 1 ? `${Math.round(km * 1000)} m` : `${fmt(Math.round(km))} km`;
    const last = round === ROUNDS - 1;
    el.result.hidden = false;
    el.result.innerHTML = `
      <div>
        <div class="pts">+${fmt(pts)}</div>
        <div class="small dim">${esc(dist)} from the pin</div>
      </div>
      <div style="min-width:0">
        <div class="place">${esc(p.title)}</div>
        <div class="small dim">${esc(p.region)} · ${esc(p.ne)}</div>
      </div>
      <div style="margin-left:auto">
        <button type="button" class="btn primary small" id="khNext">${last ? 'See result' : 'Next photo'} →</button>
      </div>`;
    el.msg.innerHTML = `You scored <b>${fmt(pts)}</b> this round.`;
    el.result.querySelector('#khNext').addEventListener('click', () => {
      if (last) finish();
      else { round += 1; renderRound(); }
    });
  }

  function finish() {
    const bestBefore = load('khoja:best', 0);
    if (total > bestBefore) save('khoja:best', total);
    let bestToday = total;
    if (mode === 'daily') {
      const prev = load('khoja:daily', null);
      const today = todayKey();
      if (prev && prev.date === today && prev.total > total) bestToday = prev.total;
      save('khoja:daily', { date: today, total: bestToday, rounds: points });
    }
    const share = `ACTTOLOG ARCADE — Khoja Nepal\n${mode === 'daily' ? todayKey() : 'Practice'} · ${fmt(total)} / ${fmt(ROUNDS * MAX_ROUND)}\n${squares(points)}\nacttolog.github.io/games/khoja-nepal`;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="overlay-card" role="dialog" aria-modal="true" aria-label="Khoja Nepal result">
        <p class="kicker" style="margin-bottom:10px">${mode === 'daily' ? 'DAILY RUN COMPLETE' : 'PRACTICE COMPLETE'}</p>
        <h3>${esc(rankFor(total))}</h3>
        <div class="score-big">${fmt(total)} <span style="font-size:14px;color:var(--dim);font-weight:600">/ ${fmt(ROUNDS * MAX_ROUND)}</span></div>
        <p>${mode === 'daily' ? `Today's best so far: <b>${fmt(bestToday)}</b>. A new set of photos arrives tomorrow.` : `Personal best: <b>${fmt(Math.max(bestBefore, total))}</b> points.`}</p>
        <div class="ov-grid">
          ${points.map((p, i) => `<div class="stat"><b>${fmt(p)}</b><span>ROUND ${i + 1}</span></div>`).join('')}
        </div>
        <div class="share-box" id="khShare">${esc(share)}</div>
        <div class="overlay-actions">
          <button type="button" class="btn primary" id="khAgain">Play practice</button>
          <button type="button" class="btn" id="khCopy">Copy result</button>
          <a class="btn" href="./">Arcade home</a>
        </div>
      </div>`;
    el.root.appendChild(overlay);
    overlay.querySelector('#khAgain').addEventListener('click', () => {
      overlay.remove();
      mode = 'practice';
      picks = picksFor('practice');
      round = 0; total = 0; points = [];
      renderRound();
    });
    overlay.querySelector('#khCopy').addEventListener('click', () => copyText(share));
    overlay.querySelector('#khAgain').focus();
  }

  function toggleMode() {
    const next = mode === 'daily' ? 'practice' : 'daily';
    mode = next;
    picks = picksFor(next);
    round = 0; total = 0; points = [];
    const stale = el.root.querySelector('.overlay');
    if (stale) stale.remove();
    renderRound();
    el.msg.innerHTML = `${next === 'daily' ? 'Daily set' : 'Practice set'} · round 1 of ${ROUNDS}.`;
  }

  el.confirm.addEventListener('click', submit);
  el.hintBtn.addEventListener('click', useHint);
  el.switchBtn.addEventListener('click', toggleMode);
  el.center.addEventListener('click', () => {
    if (map) placeGuess(map.getCenter());
  });

  loadLeaflet().then((L) => {
    if (destroyed) return;
    map = L.map(el.mapEl, {
      center: [28.3949, 84.124],
      zoom: 7,
      minZoom: 5,
      maxZoom: 13,
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: false,
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      opacity: 0.9,
    }).addTo(map);
    map.on('click', (e) => placeGuess(e.latlng));
    observer = new ResizeObserver(() => map && map.invalidateSize({ pan: false }));
    observer.observe(el.mapEl);
    setTimeout(() => map && map.invalidateSize({ pan: false }), 120);
    renderRound();
  }).catch(() => {
    el.mapEl.innerHTML = `<div style="padding:28px;color:var(--mut);font-size:13px">The map could not load. Check your connection and reload — the photos still work.</div>`;
  });

  renderRound();

  return () => {
    destroyed = true;
    if (observer) observer.disconnect();
    if (map) { map.remove(); map = null; }
  };
}
