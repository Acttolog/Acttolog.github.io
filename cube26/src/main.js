import { Cube, FACES, STICKER_HEX } from './cube-engine.js';
import { solve, scramble } from './solver.js';
import { isSolid2, planSolve2 } from './solver2.js';
import { CubeView } from './cube-view.js';
import { SoundEngine } from './sound.js';
import { FACE_BY_INDEX, FACE_INDEX } from './facelet-model.js';
import {
  COLOR_LABEL, NET_LAYOUT, PALETTE_ORDER, applyStateToCube, puzzleFor,
} from './custom-state.js';

const SIZE_META = {
  2: {
    label: '2×2',
    name: 'pocket cube',
    method: 'Two-phase corners',
    note: 'Full orient + permute tables · ~8 moves',
    scrambleLength: 14,
    stepPhases: ['Orient', 'Permute'],
    stepTags: { Orient: '8 corners', Permute: 'places' },
  },
  3: {
    label: '3×3',
    name: 'classic cube',
    method: 'Layer-by-layer',
    note: 'Optimal cross · verified macro search',
    scrambleLength: 24,
    stepPhases: ['Cross', 'Corners', 'F2L', 'OLL', 'PLL'],
    stepTags: { Cross: '4 edges', Corners: '4 slots', F2L: '4 edges', OLL: 'orient', PLL: 'permute' },
  },
};

const PHASE_COPY = {
  Cross: {
    title: 'Building the cross',
    desc: 'Four white edges, placed optimally by breadth-first search.',
  },
  Corners: {
    title: 'Solving the corners',
    desc: 'White corners drop into the first layer with verified insert macros.',
  },
  F2L: {
    title: 'Finishing F2L',
    desc: 'Middle-layer edges pair with the first layer — two layers locked in.',
  },
  OLL: {
    title: 'Orienting the last layer',
    desc: 'Three edge cases, Sune and Anti-sune bring all nine yellow stickers up.',
  },
  PLL: {
    title: 'Permuting the last layer',
    desc: 'A-perm, U-perm and T-perm land every last-layer piece home.',
  },
  Orient: {
    title: 'Orienting the corners',
    desc: 'All eight corners twisted upright — solved with an exact orientation table.',
  },
  Permute: {
    title: 'Placing the corners',
    desc: 'The permutation table sends every corner home; on a 2×2, solid faces count as solved.',
  },
};

const PHASE_COLOR = {
  Cross: '#5eead4',
  Corners: '#a78bfa',
  F2L: '#f472b6',
  OLL: '#fbbf24',
  PLL: '#4ade80',
  Orient: '#5eead4',
  Permute: '#a78bfa',
  Scramble: '#f59e0b',
};
const PHASE_RGB = {
  Cross: '94 234 212',
  Corners: '167 139 250',
  F2L: '244 114 182',
  OLL: '251 191 36',
  PLL: '74 222 128',
  Orient: '94 234 212',
  Permute: '167 139 250',
  Scramble: '245 158 11',
};
const STATUS_TEXT = {
  booting: 'Booting',
  ready: 'Ready',
  scrambling: 'Scrambling',
  solving: 'Solving',
  solved: 'Solved',
  manual: 'Manual',
};
const FACE_KEYS = {
  KeyU: 'U',
  KeyR: 'R',
  KeyF: 'F',
  KeyD: 'D',
  KeyL: 'L',
  KeyB: 'B',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const canvas = $('#stage');
const statusEl = $('#status');
const statusLabel = $('#statusLabel');
const methodLabel = $('#methodLabel');
const methodNote = $('#methodNote');
const titleEl = $('#phaseTitle');
const descEl = $('#phaseDesc');
const metricMoves = $('#metricMoves');
const metricTime = $('#metricTime');
const metricRate = $('#metricRate');
const stepsEl = $('#steps');
const progressFill = $('#progressFill');
const sequencePanel = $('#sequencePanel');
const sequenceTitle = $('#sequenceTitle');
const sequenceCount = $('#sequenceCount');
const sequenceScroll = $('#sequenceScroll');
const solveBtn = $('#solveBtn');
const scrambleBtn = $('#scrambleBtn');
const resetBtn = $('#resetBtn');
const paceEl = $('#pace');
const paceValue = $('#paceValue');
const autoToggle = $('#autoToggle');
const soundBtn = $('#soundBtn');
const helpBtn = $('#helpBtn');
const guide = $('#guide');
const guideClose = $('#guideClose');
const customBtn = $('#customBtn');
const toastEl = $('#toast');
const fallback = $('#fallback');
const fallbackText = $('#fallbackText');
const sizeSwitches = $$('[data-size-switch]');

const labDialog = $('#labDialog');
const labCloseBtn = $('#labClose');
const labFaceTabs = $('#labFaceTabs');
const labNet = $('#labNet');
const labPalette = $('#labPalette');
const labUndoBtn = $('#labUndo');
const labRedoBtn = $('#labRedo');
const labLoadBtn = $('#labLoad');
const labFillBtn = $('#labFill');
const labPresetEl = $('#labPreset');
const labSizeEl = $('#labSize');
const labStatusEl = $('#labStatus');
const labChecksEl = $('#labChecks');
const labStatsEl = $('#labStats');
const labPlanEl = $('#labPlan');
const labPieceEl = $('#labPiece');
const labCodeEl = $('#labCode');
const labCopyBtn = $('#labCopy');
const labApplyCodeBtn = $('#labApplyCode');
const labCancelBtn = $('#labCancel');
const labShowBtn = $('#labShow3D');
const labSolveBtn = $('#labSolve');
const labToastEl = $('#labToast');
const labModeButtons = $$('[data-lab-mode]');
const labPanelTabs = $$('[data-lab-panel]');
const labPanelBodies = $$('[data-lab-panel-body]');
const labToolButtons = $$('[data-lab-tool]');
const labTurnGrid = $('#labTurnGrid');
const labSeqEl = $('#labSeq');
const labSeqApplyBtn = $('#labSeqApply');
const labSeqInvertBtn = $('#labSeqInvert');
const labSeqRandomBtn = $('#labSeqRandom');
const labSaveName = $('#labSaveName');
const labSaveBtn = $('#labSaveBtn');
const labLibraryList = $('#labLibraryList');
const labLibraryCount = $('#labLibraryCount');
const labExportBtn = $('#labExport');
const labImportBtn = $('#labImportBtn');
const labImportFile = $('#labImportFile');
const labPlanCopyBtn = $('#labPlanCopy');
const labHistoryEl = $('#labHistory');
const labHistoryCount = $('#labHistoryCount');
const labPreviewCanvas = $('#labPreviewCanvas');

function readPref(key, fallbackValue) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallbackValue : value;
  } catch {
    return fallbackValue;
  }
}

function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
}

const initialSize = Number(readPref('cube26:size', '3')) === 2 ? 2 : 3;
let activeCube = new Cube(initialSize);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sound = new SoundEngine();

const state = {
  size: initialSize,
  mode: 'booting',
  auto: readPref('cube26:auto', 'on') !== 'off',
  pace: Math.min(2.5, Math.max(0.5, Number(readPref('cube26:pace', '1')) || 1)),
  soundOn: readPref('cube26:sound', 'on') !== 'off',
  busy: false,
  runId: 0,
  phase: null,
  total: 0,
  done: 0,
  startedAt: 0,
  elapsed: 0,
  timer: null,
  autoTimer: null,
  toastTimer: null,
  chips: [],
};

const lab = {
  open: false,
  size: initialSize,
  mode: readPref('cube26:labMode', 'easy') === 'pro' ? 'pro' : 'easy',
  state: null,
  result: null,
  brush: 'F',
  face: 'F',
  tool: 'brush',
  panel: 'paint',
  faceTabs: new Map(),
  timeline: [],
  index: 0,
  cells: [],
  swatches: new Map(),
  selected: null,
  plan: null,
  planPending: false,
  planError: null,
  planToken: 0,
  planTimer: null,
  toastTimer: null,
};

const LAB_LIBRARY_KEY = 'cube26:lab:library:v1';
let labLibrary = readLabLibrary();
let labDeleteArmed = null;
let labDeleteTimer = null;
let labPreviewView = null;
let labPreviewCube = null;
let labStroke = null;

let view = null;
let activeChip = null;
let stageIndex = -1;
let stepEls = [];

try {
  view = new CubeView(canvas, activeCube, { reducedMotion });
} catch (error) {
  console.error('CUBE/26: WebGL initialisation failed', error);
  fallbackText.textContent =
    'The 3D renderer could not start. Enable hardware acceleration or try a WebGL-capable browser, then reload.';
  fallback.hidden = false;
  statusLabel.textContent = 'No WebGL';
}

/* ---------- small helpers ---------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cancelled = (id) => id !== state.runId;
const prettyMove = (move) => move.replace("'", '′');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(ms) {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(mode, label = STATUS_TEXT[mode] || mode) {
  statusEl.dataset.state = mode;
  statusLabel.textContent = label;
}

function setCopy(copy) {
  titleEl.textContent = copy.title;
  descEl.textContent = copy.desc;
}

function stepPhases() {
  return SIZE_META[state.size].stepPhases;
}

function buildSteps() {
  const tags = SIZE_META[state.size].stepTags;
  stepsEl.innerHTML = '';
  stepEls = stepPhases().map((phase, index) => {
    const item = makeEl('li', 'step');
    item.dataset.step = phase;
    item.append(
      makeEl('span', 'step__num', String(index + 1).padStart(2, '0')),
      makeEl('span', 'step__name', phase),
      makeEl('span', 'step__tag', tags[phase] || ''),
      makeEl('span', 'step__state')
    );
    item.lastChild.setAttribute('aria-hidden', 'true');
    stepsEl.appendChild(item);
    return item;
  });
  paintSteps(false);
}

function paintSteps(allDone = false) {
  stepEls.forEach((step, index) => {
    let next = 'pending';
    if (allDone) next = 'done';
    else if (stageIndex >= 0) {
      if (index < stageIndex) next = 'done';
      else if (index === stageIndex) next = 'active';
    }
    step.dataset.state = next;
  });
}

function setStage(stage) {
  state.phase = stage;
  stageIndex = stepPhases().indexOf(stage);
  document.documentElement.dataset.phase = stage;
  setCopy(PHASE_COPY[stage]);
  paintSteps(false);
}

function moodCopy(mood) {
  const meta = SIZE_META[state.size];
  switch (mood) {
    case 'Scramble':
      return {
        title: 'Scrambling',
        desc: `${meta.scrambleLength} random turns. The solver reads the full ${state.size === 2 ? 24 : 54}-facelet state.`,
      };
    case 'Solving':
      return state.size === 2
        ? {
          title: 'Computing solution',
          desc: 'Reading 24 facelets, then looking up the exact orient + permute corner solution.',
        }
        : {
          title: 'Computing solution',
          desc: 'Reading 54 facelets, then searching cross, corners, F2L and the last layer.',
        };
    case 'Solved':
      return {
        title: 'Solved',
        desc: state.auto
          ? 'Every sticker home. The studio will loop again shortly.'
          : 'Every sticker home. Press Scramble for a new position.',
      };
    case 'Manual':
      return {
        title: 'Manual play',
        desc: 'Turn any layer with U R F D L B. Hold Shift for a counter-clockwise turn.',
      };
    case 'Idle':
    default:
      return {
        title: 'Standing by',
        desc: `A studio-grade ${meta.label} ${meta.name} that scrambles and solves itself. Drag to orbit, or open the Lab to paint a position.`,
      };
  }
}

function setMood(mood, copy = moodCopy(mood)) {
  state.phase = mood;
  stageIndex = -1;
  document.documentElement.dataset.phase = mood;
  setCopy(copy);
  paintSteps(mood === 'Solved');
}

function setProgress(done, total) {
  const percent = total > 0 ? clamp((done / total) * 100, 0, 100) : 0;
  progressFill.style.width = `${percent}%`;
}

function updateCounters() {
  metricMoves.textContent = state.total > 0
    ? `${String(state.done).padStart(2, '0')} / ${state.total}`
    : '—';
  setProgress(state.done, state.total);
}

function resetTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.startedAt = 0;
  state.elapsed = 0;
  metricTime.textContent = '0:00.0';
  metricRate.textContent = '—';
}

function tickTimer() {
  if (!state.startedAt) return;
  state.elapsed = performance.now() - state.startedAt;
  metricTime.textContent = formatTime(state.elapsed);
  if (state.done > 1) {
    metricRate.textContent = `${(state.done / (state.elapsed / 1000)).toFixed(1)}/s`;
  }
}

function startTimer() {
  resetTimer();
  state.startedAt = performance.now();
  tickTimer();
  state.timer = setInterval(tickTimer, 83);
}

function stopTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (state.startedAt) {
    state.elapsed = performance.now() - state.startedAt;
    metricTime.textContent = formatTime(state.elapsed);
    if (state.done > 0) {
      metricRate.textContent = `${(state.done / (state.elapsed / 1000)).toFixed(1)}/s`;
    }
  }
}

function resetMetrics() {
  state.total = 0;
  state.done = 0;
  updateCounters();
  resetTimer();
}

function scrambleDuration() {
  return Math.round(clamp(120 / state.pace, 55, 200));
}

function solveDuration() {
  return Math.round(clamp(240 / state.pace, 75, 400));
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', isError);
  toastEl.classList.add('is-visible');
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    state.toastTimer = null;
  }, 2800);
}

/* ---------- sequence panel ---------- */

function clearSequence(
  message = 'Awaiting a run.',
  sub = 'Scramble or solve to populate the queue.'
) {
  sequenceTitle.textContent = 'Sequence';
  sequenceCount.textContent = '000';
  sequenceScroll.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'sequence__empty';
  empty.append(document.createTextNode(message), document.createElement('br'));
  const note = document.createElement('span');
  note.textContent = sub;
  empty.append(note);
  sequenceScroll.appendChild(empty);
  state.chips = [];
  activeChip = null;
}

function renderSequence(items, title) {
  sequenceScroll.innerHTML = '';
  sequenceTitle.textContent = title;
  sequenceCount.textContent = String(items.length).padStart(3, '0');
  state.chips = [];
  activeChip = null;

  let index = 0;
  while (index < items.length) {
    const phase = items[index].phase || 'F2L';
    let end = index;
    while (end < items.length && (items[end].phase || 'F2L') === phase) end += 1;
    const color = PHASE_COLOR[phase] || '#94a3b8';

    const group = document.createElement('section');
    group.className = 'seq-group';

    const head = document.createElement('div');
    head.className = 'seq-group__head';
    const dot = document.createElement('span');
    dot.className = 'seq-group__dot';
    dot.style.setProperty('--chip', color);
    dot.style.setProperty('--chip-rgb', PHASE_RGB[phase] || '148 163 184');
    const name = document.createElement('span');
    name.className = 'seq-group__name';
    name.textContent = phase === 'Scramble' ? 'Moves' : phase;
    const count = document.createElement('span');
    count.className = 'seq-group__count';
    count.textContent = String(end - index).padStart(2, '0');
    head.append(dot, name, count);

    const chips = document.createElement('div');
    chips.className = 'seq-group__chips';
    for (; index < end; index += 1) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = prettyMove(items[index].move);
      chip.style.setProperty('--chip', color);
      chip.style.setProperty('--chip-rgb', PHASE_RGB[phase] || '148 163 184');
      chips.appendChild(chip);
      state.chips.push(chip);
    }

    group.append(head, chips);
    sequenceScroll.appendChild(group);
  }

  sequenceScroll.scrollTop = 0;
}

function activateChip(index) {
  if (activeChip) {
    activeChip.classList.remove('is-active');
    activeChip.classList.add('is-done');
  }
  const chip = state.chips[index];
  if (!chip) return;
  chip.classList.remove('is-done');
  chip.classList.add('is-active');
  activeChip = chip;

  if (sequencePanel.offsetParent === null) return;
  const chipRect = chip.getBoundingClientRect();
  const boxRect = sequenceScroll.getBoundingClientRect();
  if (chipRect.top < boxRect.top + 20 || chipRect.bottom > boxRect.bottom - 20) {
    sequenceScroll.scrollTop += chipRect.top - boxRect.top - boxRect.height * 0.32;
  }
}

function finishChips() {
  for (const chip of state.chips) {
    chip.classList.remove('is-active');
    chip.classList.add('is-done');
  }
  activeChip = null;
}

/* ---------- puzzle size ---------- */

function syncSizeButtons() {
  for (const group of sizeSwitches) {
    for (const button of group.querySelectorAll('[data-size]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.size) === state.size));
    }
  }
}

function syncSizeMeta() {
  methodLabel.textContent = SIZE_META[state.size].method;
  methodNote.textContent = SIZE_META[state.size].note;
}

function applyPuzzleSize(size, { silent = false } = {}) {
  const next = Number(size) === 2 ? 2 : 3;
  if (next === state.size) {
    syncSizeButtons();
    return;
  }
  if (state.busy) {
    if (!silent) showToast('Let the current run finish first', true);
    return;
  }

  state.runId += 1;
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }

  state.size = next;
  savePref('cube26:size', String(next));
  activeCube = new Cube(next);
  if (view) view.setCube(activeCube);

  buildSteps();
  syncSizeMeta();
  syncSizeButtons();
  resetMetrics();
  clearSequence();
  setProgress(0, 0);
  state.mode = 'ready';
  setStatus('ready', 'Ready');
  setMood('Idle');

  if (lab.open) resetLabForSize(next, { label: `Switched to ${SIZE_META[next].label}` });

  if (!silent) showToast(`Switched to the ${SIZE_META[next].label} ${SIZE_META[next].name}`);
  if (state.auto) scheduleAuto(1200);
}

/* ---------- run control ---------- */

function beginRun() {
  state.runId += 1;
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }
  state.busy = true;
  return state.runId;
}

async function waitForIdle() {
  let guard = 0;
  while (view && view.animating && guard < 240) {
    await wait(25);
    guard += 1;
  }
}

async function paint() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function resetCubeInstant() {
  activeCube.reset();
  view.resetToState();
}

function puzzleIsSolved() {
  if (state.size === 2) {
    return isSolid2(puzzleFor(2).model.fromCube(activeCube));
  }
  return activeCube.isSolved();
}

function scheduleAuto(delay = 3600) {
  if (!state.auto) return;
  if (state.autoTimer) clearTimeout(state.autoTimer);
  state.autoTimer = setTimeout(() => {
    state.autoTimer = null;
    if (!state.auto || state.busy) return;
    autoCycle();
  }, delay);
}

async function doScramble(id) {
  resetCubeInstant();
  const meta = SIZE_META[state.size];
  const moves = scramble(meta.scrambleLength);

  state.mode = 'scrambling';
  setStatus('scrambling');
  setMood('Scramble');
  clearSequence('Building a scramble…', `${meta.scrambleLength} random turns.`);
  resetMetrics();
  renderSequence(moves.map((move) => ({ move, phase: 'Scramble' })), 'Scramble');
  state.total = moves.length;
  state.done = 0;
  updateCounters();
  startTimer();

  for (let index = 0; index < moves.length; index += 1) {
    if (cancelled(id)) return false;
    activateChip(index);
    await view.animateMove(moves[index], scrambleDuration());
    if (cancelled(id)) return false;
    state.done += 1;
    updateCounters();
    tickTimer();
    sound.move(moves[index], { soft: true });
  }

  stopTimer();
  state.busy = false;
  state.mode = 'ready';
  setStatus('ready', 'Scrambled');
  setMood('Idle', {
    title: 'Position set',
    desc: `${meta.scrambleLength}-move scramble ready. Press Solve, or let Auto finish the loop.`,
  });
  return true;
}

async function doSolve(id) {
  state.mode = 'solving';
  setStatus('solving', 'Solving');
  setMood('Solving');
  clearSequence('Computing…', 'Solving from the current position.');
  resetMetrics();
  await paint();
  if (cancelled(id)) return false;

  let solution;
  try {
    solution = state.size === 2 ? planSolve2(activeCube).phases : solve(activeCube);
  } catch (error) {
    console.error('CUBE/26: solver failure', error);
    state.busy = false;
    state.mode = 'ready';
    setStatus('ready', 'Solver error');
    setMood('Idle', {
      title: 'Could not solve',
      desc: 'Something went wrong while searching. Reset the cube and try again.',
    });
    showToast('Solver error — reset and retry', true);
    return false;
  }
  if (cancelled(id)) return false;

  if (solution.length === 0) {
    state.busy = false;
    state.mode = 'solved';
    setStatus('solved', 'Solved');
    setMood('Solved', {
      title: 'Already solved',
      desc: 'Every sticker is home. Open the Lab to paint a position or press Scramble.',
    });
    resetMetrics();
    showToast('Cube is already solved');
    return true;
  }

  renderSequence(solution, 'Solution');
  state.total = solution.length;
  state.done = 0;
  updateCounters();
  startTimer();

  for (let index = 0; index < solution.length; index += 1) {
    if (cancelled(id)) return false;
    const item = solution[index];
    if (item.phase !== state.phase) setStage(item.phase);
    activateChip(index);
    await view.animateMove(item.move, solveDuration());
    if (cancelled(id)) return false;
    state.done += 1;
    updateCounters();
    tickTimer();
    sound.move(item.move);
  }

  stopTimer();
  finishChips();
  state.busy = false;
  state.mode = 'solved';
  setStatus('solved', 'Solved');
  setMood('Solved');
  setProgress(state.total, state.total);
  view.celebrate();
  sound.chime();
  showToast(`Solved in ${formatTime(state.elapsed)} · ${solution.length} moves`);
  return true;
}

async function solveAction() {
  if (!view || labDialog.open) return;
  const id = beginRun();
  await waitForIdle();
  if (cancelled(id)) return;
  const ok = await doSolve(id);
  if (ok && state.auto) scheduleAuto(3800);
}

async function scrambleAction() {
  if (!view || labDialog.open) return;
  const id = beginRun();
  await waitForIdle();
  if (cancelled(id)) return;
  const ok = await doScramble(id);
  if (!ok) return;

  if (state.auto) {
    await wait(900);
    if (cancelled(id) || !state.auto) return;
    const solvedOk = await doSolve(id);
    if (solvedOk && state.auto) scheduleAuto(3800);
  }
}

async function resetAction() {
  if (!view) return;
  const id = beginRun();
  await waitForIdle();
  if (cancelled(id)) return;
  resetCubeInstant();
  clearSequence();
  resetMetrics();
  state.mode = 'ready';
  state.busy = false;
  setStatus('ready', 'Ready');
  setMood('Idle', {
    title: 'Cube reset',
    desc: 'Every piece home. Scramble or solve to begin.',
  });
  setProgress(0, 0);
  if (state.auto) scheduleAuto(1400);
}

async function autoCycle() {
  if (!view || !state.auto || state.busy || labDialog.open) return;
  const id = beginRun();
  await waitForIdle();
  if (cancelled(id)) return;
  const ok = await doScramble(id);
  if (!ok) return;
  await wait(850);
  if (cancelled(id) || !state.auto) return;
  const solvedOk = await doSolve(id);
  if (solvedOk && state.auto) scheduleAuto(3800);
}

async function manualTurn(face, prime) {
  if (!view || state.busy || state.mode === 'booting' || labDialog.open) return;
  if (state.auto) {
    setAuto(false, { silent: true });
    showToast('Auto paused — manual turns on');
  }
  const id = beginRun();
  await waitForIdle();
  if (cancelled(id)) return;
  clearSequence('Manual play.', 'Turn layers with U R F D L B — hold Shift to reverse.');
  resetMetrics();
  state.mode = 'manual';
  setStatus('manual', 'Manual');
  setMood('Manual');
  const token = `${face}${prime ? "'" : ''}`;
  await view.animateMove(token, Math.max(90, Math.round(170 / state.pace)));
  if (cancelled(id)) return;
  state.busy = false;
  sound.move(token);
  if (puzzleIsSolved()) {
    state.mode = 'solved';
    setStatus('solved', 'Solved');
    setMood('Solved', state.size === 2
      ? {
        title: 'Solved by hand',
        desc: 'Every face is one color. With no fixed centers, that counts as solved on a 2×2.',
      }
      : {
        title: 'Solved by hand',
        desc: 'Every sticker home. Toggle Auto on to resume the loop.',
      });
    view.celebrate();
    sound.chime();
  } else {
    setMood('Manual');
  }
}

/* ---------- settings ---------- */

function setAuto(enabled, { silent = false } = {}) {
  state.auto = enabled;
  autoToggle.checked = enabled;
  savePref('cube26:auto', enabled ? 'on' : 'off');
  if (!enabled) {
    if (state.autoTimer) {
      clearTimeout(state.autoTimer);
      state.autoTimer = null;
    }
    if (!silent) showToast('Auto loop paused');
    return;
  }
  if (!silent) showToast('Auto loop on');
  if (!state.busy && state.mode !== 'booting') scheduleAuto(700);
}

function setPace(value) {
  state.pace = clamp(Number(value) || 1, 0.5, 2.5);
  paceEl.value = String(state.pace);
  paceValue.textContent = `${state.pace.toFixed(1)}×`;
  paceEl.style.setProperty('--pct', `${((state.pace - 0.5) / 2) * 100}%`);
  savePref('cube26:pace', String(state.pace));
}

function applySound(enabled) {
  state.soundOn = enabled;
  document.body.classList.toggle('sound-off', !enabled);
  soundBtn.setAttribute('aria-pressed', String(enabled));
  sound.setMuted(!enabled);
  savePref('cube26:sound', enabled ? 'on' : 'off');
}

function setSound(enabled) {
  applySound(enabled);
  if (enabled) {
    sound.ensure();
    sound.move('U', { soft: true });
  }
  showToast(enabled ? 'Sound on' : 'Sound muted');
}

function openGuide() {
  if (!guide.open) guide.showModal();
}

/* ---------- cube lab: state ---------- */

function currentPuzzle() {
  return puzzleFor(lab.size);
}

function showLabToast(message, isError = false) {
  labToastEl.textContent = message;
  labToastEl.classList.toggle('is-error', isError);
  labToastEl.classList.add('is-visible');
  if (lab.toastTimer) clearTimeout(lab.toastTimer);
  lab.toastTimer = setTimeout(() => {
    labToastEl.classList.remove('is-visible');
    lab.toastTimer = null;
  }, 2600);
}

function cancelLabPlan() {
  lab.planToken += 1;
  if (lab.planTimer) {
    clearTimeout(lab.planTimer);
    lab.planTimer = null;
  }
  lab.planPending = false;
}

function newLabId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLabLibrary() {
  try {
    const raw = localStorage.getItem(LAB_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.presets;
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry) => {
        const size = Number(entry?.size);
        return (
          (size === 2 || size === 3)
          && typeof entry.code === 'string'
          && entry.code.length === size * size * 6
          && typeof entry.name === 'string'
        );
      })
      .slice(0, 60)
      .map((entry) => ({
        id: String(entry.id || newLabId()),
        name: entry.name.slice(0, 40),
        size: Number(entry.size),
        code: entry.code,
        savedAt: Number(entry.savedAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

function persistLabLibrary() {
  try {
    localStorage.setItem(LAB_LIBRARY_KEY, JSON.stringify(labLibrary));
  } catch {
    showLabToast('Browser storage is full — export a backup', true);
  }
}

function commitLab(label) {
  if (!lab.state) return;
  if (lab.index < lab.timeline.length - 1) lab.timeline.length = lab.index + 1;
  lab.timeline.push({ state: Uint8Array.from(lab.state), label });
  if (lab.timeline.length > 60) lab.timeline.shift();
  lab.index = lab.timeline.length - 1;
}

function restoreLabTimeline() {
  lab.state = Uint8Array.from(lab.timeline[lab.index].state);
  lab.selected = null;
  refreshLab({ immediate: true });
}

function jumpLabEntry(index) {
  if (!lab.timeline.length) return;
  const next = clamp(index, 0, lab.timeline.length - 1);
  if (next === lab.index) return;
  lab.index = next;
  restoreLabTimeline();
}

function startLabTimeline(label) {
  lab.timeline = [{ state: Uint8Array.from(lab.state), label }];
  lab.index = 0;
}

function solvedWithMoves(puzzle, moves) {
  return Uint8Array.from(
    puzzle.model.applyMoves(Uint8Array.from(puzzle.model.SOLVED), moves)
  );
}

function randomLabState(puzzle) {
  const fresh = new Cube(puzzle.size);
  fresh.applyMoves(scramble(puzzle.size === 2 ? 9 : 12));
  return Uint8Array.from(puzzle.model.fromCube(fresh));
}

function superflipState(puzzle) {
  const next = Uint8Array.from(puzzle.model.SOLVED);
  for (const edge of puzzle.edges) {
    const [a, b] = edge.indices;
    const swap = next[a];
    next[a] = next[b];
    next[b] = swap;
  }
  return next;
}

function twistedCornerState(puzzle) {
  const next = Uint8Array.from(puzzle.model.SOLVED);
  const corner = puzzle.corners[0];
  const [i0, i1, i2] = corner.indices;
  const [, f1, f2] = corner.faces;
  const f0 = corner.faces[0];
  next[i0] = FACE_INDEX[f1];
  next[i1] = FACE_INDEX[f2];
  next[i2] = FACE_INDEX[f0];
  return next;
}

function flippedEdgeState(puzzle) {
  const next = Uint8Array.from(puzzle.model.SOLVED);
  const edge = puzzle.edges[0];
  const [a, b] = edge.indices;
  next[a] = FACE_INDEX[edge.faces[1]];
  next[b] = FACE_INDEX[edge.faces[0]];
  return next;
}

function swappedEdgesState(puzzle) {
  const next = Uint8Array.from(puzzle.model.SOLVED);
  const [first, second] = puzzle.edges;
  for (let k = 0; k < first.indices.length; k += 1) {
    const a = first.indices[k];
    const b = second.indices[k];
    const swap = next[a];
    next[a] = next[b];
    next[b] = swap;
  }
  return next;
}

function labPresetGroups() {
  const size = lab.size;
  const puzzle = puzzleFor(size);
  const positions = [
    {
      id: 'solved',
      label: 'Solved cube',
      build: () => Uint8Array.from(puzzle.model.SOLVED),
    },
    {
      id: 'one',
      label: 'One move away (R)',
      build: () => solvedWithMoves(puzzle, ['R']),
    },
    {
      id: 'scramble',
      label: `Random scramble (${size === 2 ? 9 : 12})`,
      build: () => randomLabState(puzzle),
    },
    {
      id: 'checker',
      label: 'Checkerboard',
      only: 3,
      build: () => solvedWithMoves(puzzle, ['U2', 'D2', 'R2', 'L2', 'F2', 'B2']),
    },
    {
      id: 'sixspot',
      label: 'Six spot',
      only: 3,
      build: () => solvedWithMoves(puzzle, ['U', "D'", 'R', "L'", 'F', "B'", 'U', "D'"]),
    },
    {
      id: 'superflip',
      label: 'Superflip',
      only: 3,
      build: () => superflipState(puzzle),
    },
    {
      id: 'turned',
      label: 'Turned but solid',
      only: 2,
      build: () => solvedWithMoves(puzzle, ['U', "D'"]),
    },
  ].filter((preset) => !preset.only || preset.only === size);

  const demos = [
    {
      id: 'twist',
      label: 'Twisted corner (illegal)',
      build: () => twistedCornerState(puzzle),
    },
    {
      id: 'flip',
      label: 'Flipped edge (illegal)',
      only: 3,
      build: () => flippedEdgeState(puzzle),
    },
    {
      id: 'parity',
      label: 'Swapped edges (illegal)',
      only: 3,
      build: () => swappedEdgesState(puzzle),
    },
  ].filter((preset) => !preset.only || preset.only === size);

  return { positions, demos };
}

/* ---------- cube lab: build ---------- */

function buildLabFaceTabs() {
  labFaceTabs.innerHTML = '';
  lab.faceTabs.clear();

  for (const face of FACES) {
    const tab = makeEl('button', 'lab__face-tab');
    tab.type = 'button';
    tab.dataset.face = face;
    tab.style.setProperty('--face', STICKER_HEX[face]);
    tab.setAttribute('aria-label', `Paint the ${COLOR_LABEL[face]} ${face} face`);
    tab.append(makeEl('i', ''), makeEl('b', '', face), makeEl('small', '', `0/${lab.size * lab.size}`));
    tab.addEventListener('click', () => setLabFace(face));
    lab.faceTabs.set(face, tab);
    labFaceTabs.appendChild(tab);
  }
}

function setLabFace(face) {
  if (lab.face === face) return;
  lab.face = face;
  lab.selected = null;
  paintLabNet();
  renderLabPiece();
  syncLabFaceTabs(lab.result ? lab.result.stats : null);
  const tab = lab.faceTabs.get(face);
  if (tab) tab.setAttribute('aria-pressed', 'true');
}

function syncLabFaceTabs(stats) {
  for (const face of FACES) {
    const tab = lab.faceTabs.get(face);
    if (!tab) continue;
    const active = face === lab.face;
    tab.setAttribute('aria-pressed', String(active));
    tab.classList.toggle('is-active', active);
    if (stats) {
      const info = stats.perFace[face];
      tab.querySelector('small').textContent = `${info.done}/${info.total}`;
      tab.classList.toggle('is-done', info.complete);
    }
    const faceBox = labNet.querySelector(`.custom-face[data-face="${face}"]`);
    if (faceBox) faceBox.classList.toggle('is-active', active);
  }
}

function buildLabNet() {
  const size = lab.size;
  const puzzle = puzzleFor(size);
  labNet.innerHTML = '';
  labNet.classList.add('is-tabbed');
  lab.cells = [];

  for (const { face, column, row } of NET_LAYOUT) {
    const faceBox = makeEl('div', 'custom-face');
    faceBox.dataset.face = face;
    faceBox.classList.toggle('is-active', face === lab.face);
    faceBox.style.gridColumn = String(column);
    faceBox.style.gridRow = String(row);
    faceBox.style.setProperty('--face', STICKER_HEX[face]);

    const label = makeEl('span', 'custom-face__label', face);
    const cells = makeEl('div', 'custom-face__cells');
    cells.style.setProperty('--n', String(size));

    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const index = puzzle.model.gridIndex(face, r, c);
        const cell = makeEl('button', 'net__cell');
        cell.type = 'button';
        cell.dataset.index = String(index);
        cell.dataset.face = face;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        if (size === 3 && r === 1 && c === 1) {
          cell.dataset.fixed = 'true';
          cell.disabled = true;
          cell.title = `${COLOR_LABEL[face]} center — fixed`;
          cell.setAttribute('aria-label', `${COLOR_LABEL[face]} center sticker — fixed`);
        } else {
          cell.addEventListener('mouseenter', () => selectLabPiece(index));
          cell.addEventListener('focus', () => selectLabPiece(index));
        }

        lab.cells[index] = cell;
        cells.appendChild(cell);
      }
    }

    faceBox.append(label, cells);
    labNet.appendChild(faceBox);
  }
}

function buildLabPalette() {
  labPalette.innerHTML = '';
  lab.swatches.clear();

  for (const face of PALETTE_ORDER) {
    const swatch = makeEl('button', 'swatch');
    swatch.type = 'button';
    swatch.dataset.face = face;
    swatch.style.setProperty('--swatch', STICKER_HEX[face]);
    swatch.setAttribute('aria-label', `Paint ${COLOR_LABEL[face].toLowerCase()}`);

    const dot = makeEl('span', 'swatch__dot');
    dot.setAttribute('aria-hidden', 'true');
    const name = makeEl('span', 'swatch__name', COLOR_LABEL[face]);
    const count = makeEl('span', 'swatch__count', '0');
    swatch.append(dot, name, count);

    swatch.addEventListener('click', () => {
      lab.brush = face;
      syncLabBrush();
    });

    lab.swatches.set(face, { button: swatch, count });
    labPalette.appendChild(swatch);
  }

  syncLabBrush();
}

function buildLabPresets() {
  labPresetEl.innerHTML = '';
  const placeholder = makeEl('option', '', 'Choose a preset…');
  placeholder.value = '';
  labPresetEl.appendChild(placeholder);

  const addGroup = (label, items) => {
    if (!items.length) return;
    const group = document.createElement('optgroup');
    group.label = label;
    for (const preset of items) {
      const option = makeEl('option', '', preset.label);
      option.value = preset.id;
      group.appendChild(option);
    }
    labPresetEl.appendChild(group);
  };

  const { positions, demos } = labPresetGroups();
  addGroup('Positions', positions);
  if (lab.mode === 'pro') addGroup('Rule demos — illegal on purpose', demos);

  const saved = labLibrary.filter((entry) => entry.size === lab.size);
  if (saved.length) {
    const group = document.createElement('optgroup');
    group.label = 'Saved positions';
    for (const entry of saved) {
      const option = makeEl('option', '', entry.name);
      option.value = `saved:${entry.id}`;
      group.appendChild(option);
    }
    labPresetEl.appendChild(group);
  }
  labPresetEl.value = '';
}

function buildLabTurns() {
  labTurnGrid.innerHTML = '';
  for (const prime of [false, true]) {
    for (const face of FACES) {
      const move = `${face}${prime ? "'" : ''}`;
      const button = makeEl('button', 'lab__turn');
      button.type = 'button';
      button.dataset.move = move;
      button.style.setProperty('--turn', STICKER_HEX[face]);
      button.setAttribute('aria-label', `Turn the ${face} layer ${prime ? 'counter-clockwise' : 'clockwise'}`);
      button.title = `${face}${prime ? '′' : ''} — ${COLOR_LABEL[face]} layer ${prime ? 'counter-clockwise' : 'clockwise'}`;
      button.append(
        makeEl('i', ''),
        makeEl('span', '', prime ? `${face}′` : face),
        makeEl('small', '', prime ? '↺' : '↻')
      );
      button.addEventListener('click', () => applyLabTurns([move]));
      labTurnGrid.appendChild(button);
    }
  }
}

function syncLabTool() {
  for (const button of labToolButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.labTool === lab.tool));
  }
  labNet.dataset.tool = lab.tool;
}

function setLabPanel(panel) {
  const next = ['paint', 'turns', 'library'].includes(panel) ? panel : 'paint';
  lab.panel = next;
  for (const button of labPanelTabs) {
    const active = button.dataset.labPanel === next;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const body of labPanelBodies) {
    body.hidden = body.dataset.labPanelBody !== next;
  }
}

function buildLabUi() {
  buildLabFaceTabs();
  buildLabNet();
  buildLabPalette();
  buildLabTurns();
  buildLabPresets();
  syncLabTool();
  setLabPanel(lab.panel);
  renderLabLibrary();
  renderLabHistory();
  syncLabFaceTabs(null);
  labSizeEl.textContent = `${lab.size}×${lab.size} · ${lab.size * lab.size * 6} stickers`;
  syncSizeButtons();
}

/* ---------- cube lab: render ---------- */

function paintLabNet() {
  const puzzle = currentPuzzle();
  for (let index = 0; index < lab.state.length; index += 1) {
    const cell = lab.cells[index];
    if (!cell) continue;
    const colorFace = FACE_BY_INDEX[lab.state[index]];
    cell.style.setProperty('--cell', STICKER_HEX[colorFace]);
    const face = cell.dataset.face;
    const row = Number(cell.dataset.row) + 1;
    const col = Number(cell.dataset.col) + 1;
    const fixed = cell.dataset.fixed === 'true' ? ' — fixed' : '';
    cell.setAttribute(
      'aria-label',
      `${COLOR_LABEL[colorFace]} sticker on the ${face} face, row ${row}, column ${col}${fixed}`
    );
  }

  const piece = lab.selected === null ? null : puzzle.pieceAt(lab.selected, lab.state);
  const members = new Set(piece ? piece.indices : []);
  for (const cell of lab.cells) {
    if (cell) cell.classList.toggle('is-piece', members.has(Number(cell.dataset.index)));
  }
}

function syncLabBrush() {
  for (const [face, { button }] of lab.swatches) {
    button.setAttribute('aria-pressed', String(face === lab.brush));
  }
}

function renderLabPalette() {
  const counts = new Array(FACES.length).fill(0);
  for (const value of lab.state) counts[value] += 1;
  for (const [face, { button, count }] of lab.swatches) {
    const total = counts[FACE_INDEX[face]];
    count.textContent = String(total);
    button.classList.toggle('is-off', total !== lab.size * lab.size);
    button.setAttribute('aria-pressed', String(face === lab.brush));
  }
}

function renderLabStatus(result) {
  if (!result.ok) {
    labStatusEl.dataset.state = 'error';
    const extra = result.errors.length > 1 ? ` (+${result.errors.length - 1} more)` : '';
    labStatusEl.textContent = `${result.errors[0]}${extra}`;
    return;
  }

  labStatusEl.dataset.state = 'ok';
  const stats = result.stats;
  if (stats.isSolved) {
    labStatusEl.textContent = 'Solved cube — paint any sticker to start a position.';
  } else if (stats.isSolid) {
    labStatusEl.textContent = 'Every face is one color — solid but rotated. Solve will orient the corners home.';
  } else {
    labStatusEl.textContent = `Reachable position — ${stats.misplacedStickers} sticker${stats.misplacedStickers === 1 ? '' : 's'} away from solved.`;
  }
}

function renderLabChecks(result) {
  labChecksEl.innerHTML = '';
  for (const check of result.checks) {
    const item = makeEl(
      'li',
      `lab__check${check.status === 'ok' ? ' is-ok' : check.status === 'error' ? ' is-error' : ''}`
    );
    const icon = makeEl(
      'span',
      'lab__check__icon',
      check.status === 'ok' ? '✓' : check.status === 'error' ? '!' : '–'
    );
    icon.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.append(
      makeEl('b', '', check.label),
      makeEl('small', '', check.detail)
    );
    item.append(icon, body);
    labChecksEl.appendChild(item);
  }
}

function renderLabStats(result) {
  const stats = result.stats;
  const moveCount = lab.plan ? lab.plan.moves.length : null;
  const difficulty = currentPuzzle().difficultyOf(stats, moveCount);

  labStatsEl.innerHTML = '';

  const row = (label, value) => {
    const item = makeEl('div', 'lab__stat');
    item.append(makeEl('span', '', label));
    const bold = document.createElement('b');
    if (value instanceof Node) bold.appendChild(value);
    else bold.textContent = value;
    item.appendChild(bold);
    labStatsEl.appendChild(item);
  };

  row('Misplaced stickers', `${stats.misplacedStickers} / ${stats.totalStickers}`);

  const bar = makeEl('div', 'lab__bar');
  const fill = document.createElement('span');
  const kept = stats.totalStickers - stats.misplacedStickers;
  fill.style.width = `${(kept / stats.totalStickers) * 100}%`;
  bar.appendChild(fill);
  labStatsEl.appendChild(bar);

  row('Pieces home', `${stats.piecesSolved} / ${stats.piecesTotal}`);
  row('Faces complete', `${stats.solidFaces} / 6`);
  row('Difficulty', makeEl('span', `lab__diff is-${difficulty.tone}`, difficulty.label));

  const faces = makeEl('div', 'lab__faces');
  for (const face of FACES) {
    const info = stats.perFace[face];
    const item = makeEl('span', `lab__face${info.complete ? ' is-done' : ''}`);
    item.style.setProperty('--face', STICKER_HEX[face]);
    item.append(makeEl('i', ''), makeEl('span', '', face), makeEl('b', '', `${info.done}/${info.total}`));
    faces.appendChild(item);
  }
  labStatsEl.appendChild(faces);
  syncLabFaceTabs(stats);
}

function renderLabPlan(result) {
  labPlanEl.innerHTML = '';
  const muted = (text) => labPlanEl.appendChild(makeEl('p', 'lab__muted', text));

  if (!result.ok) {
    muted('Fix the rule errors to unlock a solve.');
    return;
  }
  if (lab.planPending) {
    muted('Computing the solution…');
    return;
  }
  if (lab.planError) {
    muted(lab.planError);
    return;
  }
  if (!lab.plan) {
    muted('No plan yet.');
    return;
  }

  const moves = lab.plan.moves;
  if (!moves.length) {
    muted('Already solved — paint a sticker to build a position.');
    return;
  }

  const head = makeEl('div', 'lab__plan-head');
  head.append(
    makeEl('b', '', `${moves.length} move${moves.length === 1 ? '' : 's'}`),
    makeEl(
      'span',
      '',
      `${lab.size === 2 ? 'two-phase' : 'layer-by-layer'} · ${Math.max(1, Math.round(lab.plan.ms))} ms`
    )
  );

  const meta = makeEl('div', 'lab__plan-meta');
  meta.appendChild(
    makeEl(
      'span',
      `lab__verify${lab.plan.verified ? '' : ' is-error'}`,
      lab.plan.verified ? '✓ plan replayed and solved' : '! plan failed verification'
    )
  );

  const phases = makeEl('div', 'lab__plan-phases');
  const groups = [];
  for (const item of moves) {
    const phase = item.phase || (lab.size === 2 ? 'Permute' : 'F2L');
    let group = groups.find((entry) => entry.phase === phase);
    if (!group) {
      group = { phase, count: 0 };
      groups.push(group);
    }
    group.count += 1;
  }
  for (const group of groups) {
    const chip = makeEl('span', 'lab__phase', `${group.phase} ${group.count}`);
    chip.style.setProperty('--chip', PHASE_COLOR[group.phase] || '#94a3b8');
    phases.appendChild(chip);
  }

  const chips = makeEl('div', 'lab__chips');
  const limit = 80;
  for (let index = 0; index < Math.min(moves.length, limit); index += 1) {
    const item = moves[index];
    const chip = makeEl('span', 'chip', prettyMove(item.move));
    chip.style.setProperty('--chip', PHASE_COLOR[item.phase] || '#94a3b8');
    chip.style.setProperty('--chip-rgb', PHASE_RGB[item.phase] || '148 163 184');
    chips.appendChild(chip);
  }
  if (moves.length > limit) {
    chips.appendChild(makeEl('span', 'lab__more', `+${moves.length - limit}`));
  }

  labPlanEl.append(head, meta, phases, chips);
}

function renderLabPiece() {
  labPieceEl.innerHTML = '';
  if (lab.selected === null || !lab.cells[lab.selected]) {
    labPieceEl.appendChild(
      makeEl('p', 'lab__muted', 'Hover, focus or tap a sticker to inspect its piece.')
    );
    return;
  }

  const piece = currentPuzzle().pieceAt(lab.selected, lab.state);
  if (!piece) {
    labPieceEl.appendChild(makeEl('p', 'lab__muted', 'No piece sits on that sticker.'));
    return;
  }

  const chips = makeEl('div', 'lab__piece__chips');
  piece.colors.forEach((face) => {
    const chip = makeEl('span', 'lab__piece__chip');
    const dot = document.createElement('i');
    dot.style.setProperty('--c', STICKER_HEX[face]);
    chip.append(dot, document.createTextNode(COLOR_LABEL[face]));
    chips.appendChild(chip);
  });

  const line = makeEl('p', 'lab__piece__line');
  if (!piece.correctPiece) {
    line.textContent = `These colors form no real ${piece.kind} — that is why the rules fail.`;
  } else if (piece.solved) {
    line.textContent = `Home — the ${piece.homeName} ${piece.kind} is placed and oriented correctly.`;
  } else {
    line.textContent = `The ${piece.homeName} ${piece.kind} is here, but out of place or twisted.`;
  }

  const rows = makeEl('dl', 'lab__piece__rows');
  const addRow = (label, value) => {
    rows.append(makeEl('dt', '', label));
    const dd = document.createElement('dd');
    dd.textContent = value;
    rows.appendChild(dd);
  };
  addRow('Piece', piece.homeName);
  addRow('Kind', piece.kind);
  addRow('Slot faces', piece.faces.join(' '));
  addRow('State', !piece.correctPiece ? 'Impossible' : piece.solved ? 'Home' : 'Out of place');

  labPieceEl.append(chips, line, rows);
}

function renderLabTools() {
  const result = lab.result;
  const valid = Boolean(result && result.ok);
  const solved = Boolean(result && result.stats.isSolved);
  labSolveBtn.disabled = !valid || solved;
  labSolveBtn.setAttribute('aria-disabled', String(!valid || solved));
  labShowBtn.disabled = !valid;
  labShowBtn.setAttribute('aria-disabled', String(!valid));
  labPlanCopyBtn.disabled = !lab.plan || lab.plan.moves.length === 0;
  labUndoBtn.disabled = lab.index <= 0;
  labRedoBtn.disabled = lab.index >= lab.timeline.length - 1;
}

function renderLabHistory() {
  const steps = Math.max(0, lab.timeline.length - 1);
  labHistoryCount.textContent = `${steps} step${steps === 1 ? '' : 's'}`;
  labHistoryEl.innerHTML = '';

  for (let index = lab.timeline.length - 1; index >= 0; index -= 1) {
    const entry = lab.timeline[index];
    const row = makeEl(
      'button',
      `lab__hist${index === lab.index ? ' is-current' : ''}${index > lab.index ? ' is-future' : ''}`
    );
    row.type = 'button';
    row.disabled = index === lab.index;
    row.dataset.index = String(index);
    row.title = `${entry.label} — step ${index} of ${steps}`;
    row.append(
      makeEl('i', '', String(index).padStart(2, '0')),
      makeEl('span', '', entry.label)
    );
    if (index === lab.index) row.appendChild(makeEl('b', '', 'now'));
    row.addEventListener('click', () => jumpLabEntry(index));
    labHistoryEl.appendChild(row);
  }
}

function formatSavedAt(stamp) {
  try {
    return new Date(stamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function renderLabLibrary() {
  labLibraryCount.textContent = String(labLibrary.length);
  labLibraryList.innerHTML = '';

  if (!labLibrary.length) {
    labLibraryList.appendChild(
      makeEl('p', 'lab__muted', 'Nothing saved yet — name a position and press Save.')
    );
    return;
  }

  for (const entry of labLibrary) {
    const row = makeEl('div', 'lab__lib-item');
    const load = makeEl('button', 'lab__lib-load');
    load.type = 'button';
    load.title = `Load “${entry.name}” (${entry.size}×${entry.size})`;
    load.append(
      makeEl('b', '', entry.name),
      makeEl('small', '', `${entry.size}×${entry.size} · ${formatSavedAt(entry.savedAt)}`)
    );
    load.addEventListener('click', () => loadLabLibraryEntry(entry.id));

    const remove = makeEl('button', 'lab__lib-del', labDeleteArmed === entry.id ? 'Delete?' : 'Delete');
    remove.type = 'button';
    remove.classList.toggle('is-armed', labDeleteArmed === entry.id);
    remove.setAttribute('aria-label', labDeleteArmed === entry.id ? `Confirm delete ${entry.name}` : `Delete ${entry.name}`);
    remove.addEventListener('click', () => deleteLabLibraryEntry(entry.id));

    row.append(load, remove);
    labLibraryList.appendChild(row);
  }
}

function syncLabCode() {
  if (document.activeElement !== labCodeEl) {
    labCodeEl.value = currentPuzzle().codeOf(lab.state);
  }
}

function scheduleLabPlan({ immediate = false } = {}) {
  lab.plan = null;
  lab.planError = null;
  lab.planPending = true;
  lab.planToken += 1;
  const token = lab.planToken;
  if (lab.result) renderLabPlan(lab.result);
  renderLabTools();
  if (lab.planTimer) {
    clearTimeout(lab.planTimer);
    lab.planTimer = null;
  }
  if (immediate) {
    computeLabPlan(token);
    return;
  }
  const delay = lab.size === 2 ? 140 : 320;
  lab.planTimer = setTimeout(() => {
    lab.planTimer = null;
    computeLabPlan(token);
  }, delay);
}

function computeLabPlan(token) {
  if (token !== lab.planToken) return;
  const puzzle = currentPuzzle();
  const result = puzzle.validate(lab.state);
  lab.result = result;
  lab.planPending = false;

  if (!result.ok) {
    lab.plan = null;
    lab.planError = null;
    renderLabPlan(result);
    renderLabStats(result);
    renderLabTools();
    return;
  }

  let phases = [];
  let ms = 0;
  let verified = false;
  try {
    const working = new Cube(lab.size);
    applyStateToCube(working, lab.state);
    const started = performance.now();
    phases = lab.size === 2 ? planSolve2(working).phases : solve(working);
    ms = performance.now() - started;

    if (phases.length === 0) {
      verified = true;
    } else {
      const probe = new Cube(lab.size);
      applyStateToCube(probe, lab.state);
      probe.applyMoves(phases.map((item) => item.move));
      verified = lab.size === 2 ? isSolid2(puzzleFor(2).model.fromCube(probe)) : probe.isSolved();
    }
  } catch (error) {
    console.error('CUBE/26: lab planner failed', error);
    lab.plan = null;
    lab.planError = 'The planner could not solve this position.';
    renderLabPlan(result);
    renderLabStats(result);
    renderLabTools();
    return;
  }

  if (token !== lab.planToken) return;
  lab.plan = { moves: phases, ms, verified };
  renderLabPlan(result);
  renderLabStats(result);
  renderLabTools();
}

function refreshLab({ immediate = false } = {}) {
  const result = currentPuzzle().validate(lab.state);
  lab.result = result;
  paintLabNet();
  renderLabPalette();
  renderLabStatus(result);
  renderLabChecks(result);
  renderLabStats(result);
  renderLabPiece();
  syncLabCode();
  syncLabPreview();
  renderLabHistory();
  renderLabTools();
  scheduleLabPlan({ immediate });
}

/* ---------- cube lab: actions ---------- */

function labCellMeta(cell) {
  return {
    index: Number(cell.dataset.index),
    face: cell.dataset.face,
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col),
    fixed: cell.dataset.fixed === 'true',
  };
}

function labCellFromEvent(event) {
  const target = event.target instanceof Element ? event.target.closest('.net__cell') : null;
  if (!target || !labNet.contains(target)) return null;
  return target;
}

function labCellName(index) {
  const cell = lab.cells[index];
  if (!cell) return 'sticker';
  return `${cell.dataset.face}${Number(cell.dataset.row) + 1}${Number(cell.dataset.col) + 1}`;
}

function selectLabPiece(index) {
  if (lab.selected === index) return;
  lab.selected = index;
  paintLabNet();
  renderLabPiece();
}

function paintSingleLabCell(index) {
  if (!lab.state) return false;
  const color = FACE_INDEX[lab.brush];
  if (lab.state[index] === color) {
    selectLabPiece(index);
    return false;
  }
  lab.state[index] = color;
  lab.selected = index;
  commitLab(`Painted ${labCellName(index)} · ${COLOR_LABEL[lab.brush]}`);
  refreshLab({ immediate: true });
  return true;
}

function fillLabFace(face) {
  if (!lab.state) return false;
  const color = FACE_INDEX[lab.brush];
  let changed = 0;
  for (const cell of lab.cells) {
    if (!cell || cell.dataset.face !== face || cell.dataset.fixed === 'true') continue;
    const index = Number(cell.dataset.index);
    if (lab.state[index] !== color) {
      lab.state[index] = color;
      changed += 1;
    }
  }
  if (!changed) {
    showLabToast('That face already has this color');
    return false;
  }
  lab.selected = null;
  commitLab(`Filled the ${face} face · ${COLOR_LABEL[lab.brush]}`);
  refreshLab({ immediate: true });
  return true;
}

function pickLabColor(index) {
  const color = FACE_BY_INDEX[lab.state[index]];
  lab.brush = color;
  lab.selected = index;
  syncLabBrush();
  paintLabNet();
  renderLabPiece();
  showLabToast(`Brush set to ${COLOR_LABEL[color].toLowerCase()}`);
}

function paintStrokeCell(index) {
  if (!labStroke) return;
  const color = FACE_INDEX[labStroke.color];
  if (lab.state[index] === color) {
    selectLabPiece(index);
    return;
  }
  lab.state[index] = color;
  lab.selected = index;
  labStroke.count += 1;
  paintLabNet();
  renderLabPiece();
  syncLabPreview();
}

function beginLabPointer(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const cell = labCellFromEvent(event);
  if (!cell) return;
  const meta = labCellMeta(cell);
  if (meta.fixed) return;

  if (lab.tool === 'pick') {
    event.preventDefault();
    pickLabColor(meta.index);
    return;
  }
  if (lab.tool === 'face') {
    event.preventDefault();
    fillLabFace(meta.face);
    return;
  }

  event.preventDefault();
  labStroke = { pointerId: event.pointerId, color: lab.brush, count: 0 };
  paintStrokeCell(meta.index);
}

function moveLabPointer(event) {
  if (!labStroke) return;
  if (event.pointerType === 'mouse' && event.buttons === 0) {
    endLabStroke();
    return;
  }
  const point = document.elementFromPoint(event.clientX, event.clientY);
  const cell = point instanceof Element ? point.closest('.net__cell') : null;
  if (!cell || !labNet.contains(cell) || cell.dataset.fixed === 'true') return;
  paintStrokeCell(Number(cell.dataset.index));
}

function endLabStroke() {
  if (!labStroke) return;
  const { count, color } = labStroke;
  labStroke = null;
  if (!count) return;
  commitLab(`Painted ${count} sticker${count === 1 ? '' : 's'} · ${COLOR_LABEL[color]}`);
  refreshLab({ immediate: true });
}

function activateLabToolCell(cell) {
  if (!cell || !lab.state) return;
  const meta = labCellMeta(cell);
  if (meta.fixed) return;
  if (lab.tool === 'pick') pickLabColor(meta.index);
  else if (lab.tool === 'face') fillLabFace(meta.face);
  else paintSingleLabCell(meta.index);
}

function undoLabs() {
  jumpLabEntry(lab.index - 1);
}

function redoLabs() {
  jumpLabEntry(lab.index + 1);
}

function shortLabSequence(text) {
  return text.length > 30 ? `${text.slice(0, 27)}…` : text;
}

function applyLabTurns(moves, label = null) {
  if (!lab.state || !moves.length) return;
  const puzzle = currentPuzzle();
  lab.state = Uint8Array.from(puzzle.model.applyMoves(lab.state, moves));
  lab.selected = null;
  const text = moves.join(' ');
  commitLab(
    label || (moves.length === 1 ? `Turn ${prettyMove(moves[0])}` : `Sequence ${shortLabSequence(text)}`)
  );
  refreshLab();
  if (moves.length === 1) sound.move(moves[0], { soft: true });
}

function parseLabSequence(text) {
  const cleaned = String(text || '')
    .toUpperCase()
    .replace(/[’′`´]/g, "'")
    .replace(/[\s,;|]+/g, '');
  if (!cleaned) return { ok: false, error: 'Type moves like R U R′ U′.' };

  const moves = [];
  const token = /([URFDLB])(2|')?/y;
  let index = 0;
  while (index < cleaned.length) {
    token.lastIndex = index;
    const match = token.exec(cleaned);
    if (!match) {
      return {
        ok: false,
        error: `Can’t read “${cleaned.slice(index)}” — use U R F D L B with ′ or 2.`,
      };
    }
    moves.push(match[1] + (match[2] || ''));
    index = token.lastIndex;
  }
  return { ok: true, moves };
}

function applyLabSequence() {
  const parsed = parseLabSequence(labSeqEl.value);
  if (!parsed.ok) {
    showLabToast(parsed.error, true);
    labSeqEl.focus();
    return;
  }
  applyLabTurns(parsed.moves, `Sequence ${shortLabSequence(parsed.moves.join(' '))}`);
  showLabToast(`Applied ${parsed.moves.length} turn${parsed.moves.length === 1 ? '' : 's'}`);
}

function invertLabSequence() {
  const parsed = parseLabSequence(labSeqEl.value);
  if (!parsed.ok) {
    showLabToast(parsed.error, true);
    return;
  }
  const inverted = parsed.moves.slice().reverse().map((move) => {
    if (move.endsWith('2')) return move;
    return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
  });
  labSeqEl.value = inverted.join(' ');
  labSeqEl.focus();
  showLabToast('Sequence inverted — apply to undo it');
}

function randomLabSequence() {
  const moves = scramble(8);
  labSeqEl.value = moves.join(' ');
  applyLabTurns(moves, `Random ${moves.length}-turn scramble`);
  showLabToast(`Random ${moves.length}-turn scramble applied`);
}

function fillLabSolved() {
  lab.state = Uint8Array.from(currentPuzzle().model.SOLVED);
  lab.selected = null;
  commitLab('Filled with the solved cube');
  refreshLab({ immediate: true });
  showLabToast('Filled with the solved cube');
}

function loadLabFromCube() {
  const puzzle = currentPuzzle();
  lab.state = Uint8Array.from(puzzle.model.fromCube(activeCube));
  lab.selected = null;
  commitLab('Loaded the 3D cube');
  refreshLab({ immediate: true });
  showLabToast(`Loaded the current ${SIZE_META[state.size].label} cube`);
}

function defaultLabPositionName() {
  const stamp = new Date();
  const hours = String(stamp.getHours()).padStart(2, '0');
  const minutes = String(stamp.getMinutes()).padStart(2, '0');
  return `Position ${hours}:${minutes}`;
}

function saveLabPosition() {
  if (!lab.state) return;
  const name = (labSaveName.value || '').trim().slice(0, 40) || defaultLabPositionName();
  const code = currentPuzzle().codeOf(lab.state);
  const size = lab.size;
  const existing = labLibrary.findIndex(
    (entry) => entry.size === size && entry.name.toLowerCase() === name.toLowerCase()
  );
  const entry = {
    id: existing >= 0 ? labLibrary[existing].id : newLabId(),
    name,
    size,
    code,
    savedAt: Date.now(),
  };
  if (existing >= 0) labLibrary[existing] = entry;
  else labLibrary.unshift(entry);
  labLibrary = labLibrary.slice(0, 60);
  persistLabLibrary();
  labSaveName.value = '';
  buildLabPresets();
  renderLabLibrary();
  showLabToast(existing >= 0 ? `Updated “${name}”` : `Saved “${name}”`);
}

function loadLabLibraryEntry(id) {
  const entry = labLibrary.find((item) => item.id === id);
  if (!entry) return;

  if (entry.size !== lab.size) {
    applyPuzzleSize(entry.size);
  }
  const parsed = puzzleFor(entry.size).fromCode(entry.code);
  if (!parsed.ok) {
    showLabToast('That saved position is unreadable', true);
    return;
  }
  lab.state = Uint8Array.from(parsed.state);
  lab.selected = null;
  commitLab(`Loaded “${entry.name}”`);
  refreshLab({ immediate: true });
  showLabToast(`Loaded “${entry.name}”`);
}

function deleteLabLibraryEntry(id) {
  if (labDeleteArmed !== id) {
    labDeleteArmed = id;
    if (labDeleteTimer) clearTimeout(labDeleteTimer);
    labDeleteTimer = setTimeout(() => {
      labDeleteTimer = null;
      labDeleteArmed = null;
      renderLabLibrary();
    }, 2600);
    renderLabLibrary();
    return;
  }

  if (labDeleteTimer) {
    clearTimeout(labDeleteTimer);
    labDeleteTimer = null;
  }
  labDeleteArmed = null;
  const entry = labLibrary.find((item) => item.id === id);
  labLibrary = labLibrary.filter((item) => item.id !== id);
  persistLabLibrary();
  buildLabPresets();
  renderLabLibrary();
  showLabToast(entry ? `Deleted “${entry.name}”` : 'Position deleted');
}

function exportLabLibrary() {
  if (!labLibrary.length) {
    showLabToast('Save a position before exporting', true);
    return;
  }
  const payload = {
    app: 'CUBE/26',
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: labLibrary,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'cube26-lab-positions.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showLabToast(`Exported ${labLibrary.length} position${labLibrary.length === 1 ? '' : 's'}`);
}

async function importLabLibrary(file) {
  let entries;
  try {
    const parsed = JSON.parse(await file.text());
    entries = Array.isArray(parsed) ? parsed : parsed?.presets;
  } catch {
    showLabToast('Could not read that JSON file', true);
    return;
  }
  if (!Array.isArray(entries)) {
    showLabToast('No positions found in that JSON file', true);
    return;
  }

  let added = 0;
  for (const raw of entries.slice(0, 100)) {
    const size = Number(raw?.size);
    const name = String(raw?.name || '').trim().slice(0, 40);
    const code = String(raw?.code || '');
    if (size !== 2 && size !== 3) continue;
    const puzzle = puzzleFor(size);
    const parsed = puzzle.fromCode(code);
    if (!parsed.ok) continue;
    const normalized = puzzle.codeOf(parsed.state);
    const duplicate = labLibrary.some(
      (entry) => entry.size === size && entry.code === normalized
    );
    if (duplicate) continue;
    labLibrary.unshift({
      id: newLabId(),
      name: name || `Imported ${size}×${size}`,
      size,
      code: normalized,
      savedAt: Date.now(),
    });
    added += 1;
  }

  labLibrary = labLibrary.slice(0, 60);
  persistLabLibrary();
  buildLabPresets();
  renderLabLibrary();
  showLabToast(
    added ? `Imported ${added} position${added === 1 ? '' : 's'}` : 'No new positions found',
    !added
  );
}

function applyLabPreset(id) {
  if (id.startsWith('saved:')) {
    loadLabLibraryEntry(id.slice(6));
    labPresetEl.value = '';
    return;
  }
  const { positions, demos } = labPresetGroups();
  const preset = [...positions, ...demos].find((entry) => entry.id === id);
  if (!preset) return;
  lab.state = preset.build();
  lab.selected = null;
  commitLab(`Preset — ${preset.label}`);
  refreshLab({ immediate: true });
  labPresetEl.value = '';
  const result = currentPuzzle().validate(lab.state);
  showLabToast(
    result.ok ? `${preset.label} loaded` : `${preset.label} — see the rule errors`,
    !result.ok
  );
}

function applyLabCode() {
  const puzzle = currentPuzzle();
  const parsed = puzzle.fromCode(labCodeEl.value);
  if (!parsed.ok) {
    showLabToast(parsed.error, true);
    return;
  }
  lab.state = parsed.state;
  lab.selected = null;
  commitLab('Applied facelet code');
  refreshLab({ immediate: true });
  labCodeEl.value = puzzle.codeOf(lab.state);
  showLabToast('Facelet code applied');
}

async function copyLabCode() {
  const code = currentPuzzle().codeOf(lab.state);
  try {
    await navigator.clipboard.writeText(code);
    showLabToast('Facelet code copied');
  } catch {
    labCodeEl.focus();
    labCodeEl.select();
    showLabToast('Copy failed — code selected, press Ctrl+C', true);
  }
}

function ensureLabPreview() {
  if (labPreviewView || !labPreviewCanvas) return;
  try {
    labPreviewCube = new Cube(lab.size);
    applyStateToCube(labPreviewCube, lab.state);
    labPreviewView = new CubeView(labPreviewCanvas, labPreviewCube, { reducedMotion });
    syncLabPreview();
  } catch (error) {
    console.warn('CUBE/26: live preview unavailable', error);
    labPreviewView = null;
    labPreviewCube = null;
  }
}

function syncLabPreview() {
  if (!labPreviewView || !labPreviewCube || !lab.state) return;
  if (labPreviewCube.size !== lab.size) {
    labPreviewCube = new Cube(lab.size);
    labPreviewView.setCube(labPreviewCube);
  }
  applyStateToCube(labPreviewCube, lab.state);
  labPreviewView.resetToState();
  labPreviewView.syncStickers();
}

function setLabViewsActive(active) {
  if (active) {
    ensureLabPreview();
    labPreviewView?.setPaused(false);
    view?.setPaused(true);
  } else {
    labPreviewView?.setPaused(true);
    view?.setPaused(false);
  }
}

async function copyLabPlan() {
  if (!lab.plan || !lab.plan.moves.length) return;
  const text = lab.plan.moves.map((item) => item.move).join(' ');
  try {
    await navigator.clipboard.writeText(text);
    showLabToast('Solution copied');
  } catch {
    setLabPanel('turns');
    labSeqEl.value = text;
    labSeqEl.focus();
    labSeqEl.select();
    showLabToast('Copy failed — moves selected, press Ctrl+C', true);
  }
}

function syncLabModeButtons() {
  for (const button of labModeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.labMode === lab.mode));
  }
}

function resetLabForSize(size, { label = 'Starting position' } = {}) {
  lab.size = size;
  const puzzle = puzzleFor(size);
  lab.state = Uint8Array.from(puzzle.model.fromCube(activeCube));
  lab.selected = null;
  lab.plan = null;
  lab.planError = null;
  lab.planPending = false;
  labStroke = null;
  cancelLabPlan();
  startLabTimeline(label);
  buildLabUi();
  refreshLab({ immediate: true });
}

function openLab() {
  if (!view) return;
  if (labDialog.open) return;
  if (state.busy) {
    showToast('Let the current run finish first', true);
    return;
  }
  if (guide.open) guide.close();
  if (state.auto) {
    setAuto(false, { silent: true });
    showToast('Auto paused for the Cube Lab');
  }
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }

  lab.mode = readPref('cube26:labMode', 'easy') === 'pro' ? 'pro' : 'easy';
  labDialog.dataset.mode = lab.mode;
  syncLabModeButtons();
  resetLabForSize(state.size, { label: 'Loaded the 3D cube' });
  labDialog.showModal();
  lab.open = true;
  setLabViewsActive(true);
}

function closeLab() {
  cancelLabPlan();
  lab.open = false;
  labToastEl.classList.remove('is-visible');
  setLabViewsActive(false);
  if (labDialog.open) labDialog.close();
}

async function showLabPosition() {
  if (!view || state.busy) return;
  const result = currentPuzzle().validate(lab.state);
  if (!result.ok) {
    showLabToast(result.errors[0], true);
    return;
  }
  const target = Uint8Array.from(lab.state);
  const size = lab.size;
  closeLab();
  await waitForIdle();
  if (size !== state.size) return;

  state.runId += 1;
  activeCube.reset();
  applyStateToCube(activeCube, target);
  view.resetToState();
  view.syncStickers();
  resetMetrics();
  clearSequence('Custom position.', 'Press Solve to run the plan, or turn layers by hand.');
  setProgress(0, 0);

  if (result.stats.isSolved) {
    state.mode = 'solved';
    setStatus('solved', 'Solved');
    setMood('Solved', {
      title: 'Painted cube loaded',
      desc: 'Every sticker is home. Reopen the Lab to paint a different position.',
    });
    view.celebrate();
    sound.chime();
  } else {
    state.mode = 'ready';
    setStatus('ready', 'Custom');
    setMood('Idle', {
      title: 'Painted cube on stage',
      desc: 'Your Lab position is on the 3D cube. Press Solve, or turn layers with U R F D L B.',
    });
  }
  showToast('Painted position loaded onto the 3D cube');
}

async function solveLabPosition() {
  if (!view || state.busy) return;
  const result = currentPuzzle().validate(lab.state);
  if (!result.ok) {
    showLabToast(result.errors[0], true);
    return;
  }
  if (result.stats.isSolved) {
    showLabToast('That position is already solved', true);
    return;
  }

  const target = Uint8Array.from(lab.state);
  const size = lab.size;
  const id = beginRun();
  closeLab();
  await waitForIdle();
  if (cancelled(id)) return;
  if (size !== state.size) return;

  activeCube.reset();
  applyStateToCube(activeCube, target);
  view.resetToState();
  view.syncStickers();
  showToast('Custom position loaded — solving step by step');
  await doSolve(id);
}

/* ---------- wiring ---------- */

function wire() {
  solveBtn.addEventListener('click', solveAction);
  scrambleBtn.addEventListener('click', scrambleAction);
  resetBtn.addEventListener('click', resetAction);

  for (const group of sizeSwitches) {
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-size]');
      if (!button) return;
      applyPuzzleSize(Number(button.dataset.size));
    });
  }

  customBtn.addEventListener('click', openLab);
  labCloseBtn.addEventListener('click', closeLab);
  labCancelBtn.addEventListener('click', closeLab);
  labDialog.addEventListener('click', (event) => {
    if (event.target === labDialog) closeLab();
  });
  labDialog.addEventListener('close', () => {
    lab.open = false;
    cancelLabPlan();
    labToastEl.classList.remove('is-visible');
    labStroke = null;
    setLabViewsActive(false);
  });

  for (const button of labModeButtons) {
    button.addEventListener('click', () => {
      lab.mode = button.dataset.labMode === 'pro' ? 'pro' : 'easy';
      labDialog.dataset.mode = lab.mode;
      syncLabModeButtons();
      buildLabPresets();
      savePref('cube26:labMode', lab.mode);
    });
  }

  for (const button of labPanelTabs) {
    button.addEventListener('click', () => setLabPanel(button.dataset.labPanel));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const index = labPanelTabs.indexOf(button);
      const next = labPanelTabs[(index + step + labPanelTabs.length) % labPanelTabs.length];
      setLabPanel(next.dataset.labPanel);
      next.focus();
    });
  }

  for (const button of labToolButtons) {
    button.addEventListener('click', () => {
      lab.tool = button.dataset.labTool;
      syncLabTool();
    });
  }

  labNet.addEventListener('pointerdown', beginLabPointer);
  labNet.addEventListener('pointermove', moveLabPointer);
  labNet.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    const cell = labCellFromEvent(event);
    if (cell) activateLabToolCell(cell);
  });
  window.addEventListener('pointerup', endLabStroke);
  window.addEventListener('pointercancel', endLabStroke);

  labSeqApplyBtn.addEventListener('click', applyLabSequence);
  labSeqInvertBtn.addEventListener('click', invertLabSequence);
  labSeqRandomBtn.addEventListener('click', randomLabSequence);
  labSeqEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyLabSequence();
  });

  labSaveBtn.addEventListener('click', saveLabPosition);
  labSaveName.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveLabPosition();
  });
  labExportBtn.addEventListener('click', exportLabLibrary);
  labImportBtn.addEventListener('click', () => labImportFile.click());
  labImportFile.addEventListener('change', async () => {
    const file = labImportFile.files?.[0];
    labImportFile.value = '';
    if (file) await importLabLibrary(file);
  });

  labUndoBtn.addEventListener('click', undoLabs);
  labRedoBtn.addEventListener('click', redoLabs);
  labFillBtn.addEventListener('click', fillLabSolved);
  labLoadBtn.addEventListener('click', loadLabFromCube);
  labPresetEl.addEventListener('change', () => applyLabPreset(labPresetEl.value));
  labCopyBtn.addEventListener('click', copyLabCode);
  labApplyCodeBtn.addEventListener('click', applyLabCode);
  labPlanCopyBtn.addEventListener('click', copyLabPlan);
  labShowBtn.addEventListener('click', showLabPosition);
  labSolveBtn.addEventListener('click', solveLabPosition);

  paceEl.addEventListener('input', (event) => setPace(event.target.value));
  autoToggle.addEventListener('change', () => setAuto(autoToggle.checked));

  soundBtn.addEventListener('click', () => setSound(!state.soundOn));
  helpBtn.addEventListener('click', openGuide);
  guideClose.addEventListener('click', () => guide.close());
  guide.addEventListener('click', (event) => {
    if (event.target === guide) guide.close();
  });

  window.addEventListener('resize', () => view?.resize());

  window.addEventListener('pointerdown', () => sound.ensure(), {
    once: true,
    capture: true,
    passive: true,
  });
  window.addEventListener('keydown', () => sound.ensure(), { once: true, capture: true });

  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (labDialog.open) {
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) redoLabs();
        else undoLabs();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const face = FACE_KEYS[event.code];
      if (face) {
        event.preventDefault();
        applyLabTurns([`${face}${event.shiftKey ? "'" : ''}`]);
      }
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (guide.open) return;

    if (event.code === 'Space') {
      event.preventDefault();
      setAuto(!state.auto);
      return;
    }
    if (event.code === 'KeyS' && !event.shiftKey) {
      event.preventDefault();
      solveAction();
      return;
    }
    if (event.code === 'KeyN') {
      event.preventDefault();
      scrambleAction();
      return;
    }
    if (event.code === 'KeyC') {
      event.preventDefault();
      openLab();
      return;
    }
    if (event.code === 'KeyM') {
      event.preventDefault();
      setSound(!state.soundOn);
      return;
    }
    if (event.code === 'KeyH' || (event.shiftKey && event.code === 'Slash')) {
      event.preventDefault();
      openGuide();
      return;
    }
    if (event.code === 'Backspace') {
      event.preventDefault();
      resetAction();
      return;
    }
    const face = FACE_KEYS[event.code];
    if (face) {
      event.preventDefault();
      manualTurn(face, event.shiftKey);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.autoTimer) {
        clearTimeout(state.autoTimer);
        state.autoTimer = null;
      }
    } else if (state.auto && !state.busy) {
      scheduleAuto(1500);
    }
  });
}

/* ---------- boot ---------- */

function boot() {
  applySound(state.soundOn);
  setAuto(state.auto, { silent: true });
  setPace(state.pace);
  buildSteps();
  syncSizeMeta();
  syncSizeButtons();
  resetMetrics();
  setProgress(0, 0);

  if (!view) {
    clearSequence('WebGL is unavailable.', 'This studio needs a WebGL-capable browser.');
    return;
  }

  wire();
  state.mode = 'ready';
  clearSequence();
  setStatus('ready', 'Ready');
  setMood('Idle');
  setProgress(0, 0);

  if (state.auto) scheduleAuto(1600);

  window.cube26 = {
    get cube() { return activeCube; },
    get view() { return view; },
    get labLibrary() { return labLibrary; },
    state,
    lab,
    scramble,
    plan: () => (state.size === 2 ? planSolve2(activeCube).phases : solve(activeCube)),
    actions: {
      solve: solveAction,
      scramble: scrambleAction,
      reset: resetAction,
      openLab,
      closeLab,
      setSize: (size) => applyPuzzleSize(size),
      labSolve: solveLabPosition,
      labShow: showLabPosition,
      labTurns: (moves) => applyLabTurns(moves),
    },
  };
}

boot();
