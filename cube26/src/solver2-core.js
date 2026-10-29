// 2x2 corner model and two-phase solver core.
// Phase 1 orients every corner (full move set). Phase 2 permutes home using
// only face turns that preserve orientation, so each phase has an exact table.

import { Cube } from './cube-engine.js';
import { FACE_BY_INDEX, idx } from './facelet2.js';

const FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];
const CORNER_ORDER = {
  '1,1,1': ['U', 'R', 'F'], '-1,1,1': ['U', 'F', 'L'],
  '-1,1,-1': ['U', 'L', 'B'], '1,1,-1': ['U', 'B', 'R'],
  '1,-1,1': ['D', 'F', 'R'], '-1,-1,1': ['D', 'L', 'F'],
  '-1,-1,-1': ['D', 'B', 'L'], '1,-1,-1': ['D', 'R', 'B'],
};
const isUD = (face) => face === 'U' || face === 'D';

const CORNER_POSITIONS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNER_POSITIONS.push([x, y, z]);

const SLOT_FACES = CORNER_POSITIONS.map((pos) => CORNER_ORDER[pos.join(',')]);
const SLOT_KEYS = SLOT_FACES.map((faces) => [...faces].sort().join(''));
const HOME_INDEX = new Map(SLOT_KEYS.map((key, index) => [key, index]));
const SLOT_INDICES = SLOT_FACES.map((faces, s) =>
  faces.map((face) => idx(CORNER_POSITIONS[s], face))
);

const TOKENS = [];
for (const face of FACE_NAMES) for (const suffix of ['', "'", '2']) TOKENS.push(face + suffix);
const TOKEN_FACE = TOKENS.map((token) => token[0]);
const FACE_ORDER_INDEX = { U: 0, D: 1, R: 2, L: 3, F: 4, B: 5 };
const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

// Build the per-move corner tables from the geometric engine.
const MOVE_PERM = [];
const MOVE_DELTA = [];
for (const token of TOKENS) {
  const moved = new Cube(2).applyMove(token);
  const perm = new Int8Array(8);
  const delta = new Int8Array(8);
  for (let s = 0; s < 8; s++) {
    const colors = SLOT_FACES[s];
    let dest = -1;
    for (let d = 0; d < 8; d++) {
      const destPos = CORNER_POSITIONS[d];
      const cubie = moved.cubieAt(destPos[0], destPos[1], destPos[2]);
      const have = SLOT_FACES[d].map((face) => cubie.stickers[face]).sort().join('');
      if (have === [...colors].sort().join('')) { dest = d; break; }
    }
    if (dest < 0) throw new Error(`2x2 move table: no destination for ${token} slot ${s}`);
    const cubie = moved.cubieAt(...CORNER_POSITIONS[dest]);
    const ud = colors.find(isUD);
    perm[s] = dest;
    delta[s] = SLOT_FACES[dest].findIndex((face) => cubie.stickers[face] === ud);
  }
  MOVE_PERM.push(perm);
  MOVE_DELTA.push(delta);
}

// Phase-2 moves keep every corner's U/D sticker on a U/D face.
const PERM_TOKEN_INDEX = TOKENS
  .map((token, index) => index)
  .filter((index) => {
    const face = TOKENS[index][0];
    return face === 'U' || face === 'D' || TOKENS[index].endsWith('2');
  });

export { TOKENS, MOVE_PERM, MOVE_DELTA, SLOT_FACES, SLOT_KEYS, CORNER_POSITIONS };

export function cornerStateFromFacelet(state) {
  if (state.length !== 24) throw new Error('2x2 state must have 24 stickers');
  const cp = new Int8Array(8);
  const co = new Int8Array(8);
  const seen = new Set();
  for (let s = 0; s < 8; s++) {
    const colors = SLOT_INDICES[s].map((index) => FACE_BY_INDEX[state[index]]);
    const home = HOME_INDEX.get([...colors].sort().join(''));
    if (home === undefined) throw new Error('2x2 state has an impossible corner');
    if (seen.has(home)) throw new Error('2x2 state repeats a corner');
    seen.add(home);
    cp[s] = home;
    const ud = colors.find(isUD);
    co[s] = colors.indexOf(ud);
  }
  let twist = 0;
  for (const value of co) twist += value;
  if (twist % 3 !== 0) throw new Error('2x2 state has an impossible corner twist');
  return { cp, co };
}

export function stateFromCorner(cp, co) {
  const state = new Uint8Array(24);
  for (let s = 0; s < 8; s += 1) {
    const piece = cp[s];
    const twist = co[s];
    const homeFaces = SLOT_FACES[piece];
    const destFaces = SLOT_FACES[s];
    for (let i = 0; i < 3; i += 1) {
      const k = (twist + i) % 3;
      state[SLOT_INDICES[s][k]] = FACE_INDEX[homeFaces[i]];
    }
  }
  return state;
}

export function applyCornerMove(cp, co, tokenIndex) {
  const perm = MOVE_PERM[tokenIndex];
  const delta = MOVE_DELTA[tokenIndex];
  const ncp = new Int8Array(8);
  const nco = new Int8Array(8);
  for (let s = 0; s < 8; s += 1) {
    const d = perm[s];
    ncp[d] = cp[s];
    nco[d] = (co[s] + delta[s]) % 3;
  }
  return { cp: ncp, co: nco };
}

export function isCornerSolved(cp, co) {
  for (let s = 0; s < 8; s += 1) if (cp[s] !== s || co[s] !== 0) return false;
  return true;
}

function permIndex(cp) {
  let index = 0;
  let used = 0;
  for (let i = 0; i < 8; i += 1) {
    let count = 0;
    const v = cp[i];
    for (let j = 0; j < v; j += 1) if (!(used & (1 << j))) count += 1;
    index = index * (8 - i) + count;
    used |= 1 << v;
  }
  return index;
}

function permFromIndex(index) {
  const weights = [5040, 720, 120, 24, 6, 2, 1];
  const digits = [];
  let rest = index;
  for (let i = 0; i < 7; i += 1) { digits.push(Math.floor(rest / weights[i])); rest %= weights[i]; }
  digits.push(0);
  const perm = new Int8Array(8);
  const used = new Array(8).fill(false);
  for (let i = 0; i < 8; i += 1) {
    const avail = [];
    for (let v = 0; v < 8; v += 1) if (!used[v]) avail.push(v);
    perm[i] = avail[digits[i]];
    used[perm[i]] = true;
  }
  return perm;
}

function oriIndex(co) {
  let index = 0;
  for (let i = 0; i < 7; i += 1) index = index * 3 + co[i];
  return index;
}

function oriFromIndex(index) {
  const co = new Int8Array(8);
  let rest = index;
  let sum = 0;
  for (let s = 6; s >= 0; s -= 1) { co[s] = rest % 3; sum += co[s]; rest = Math.floor(rest / 3); }
  co[7] = (3 - (sum % 3)) % 3;
  return co;
}

function buildOrientationTable() {
  const N = 2187;
  const dist = new Int8Array(N).fill(-1);
  const queue = new Int16Array(N);
  let head = 0;
  let tail = 0;
  dist[0] = 0;
  queue[tail++] = 0;
  while (head < tail) {
    const index = queue[head++];
    const co = oriFromIndex(index);
    for (let t = 0; t < TOKENS.length; t += 1) {
      const perm = MOVE_PERM[t];
      const delta = MOVE_DELTA[t];
      const next = new Int8Array(8);
      for (let s = 0; s < 8; s += 1) next[perm[s]] = (co[s] + delta[s]) % 3;
      const ni = oriIndex(next);
      if (dist[ni] < 0) {
        dist[ni] = dist[index] + 1;
        queue[tail++] = ni;
      }
    }
  }
  return dist;
}

function buildPermutationTable() {
  const N = 40320;
  const dist = new Int8Array(N).fill(-1);
  const queue = new Int32Array(N);
  const cache = new Int8Array(N * 8);
  for (let i = 0; i < N; i += 1) cache.set(permFromIndex(i), i * 8);
  let head = 0;
  let tail = 0;
  dist[0] = 0;
  queue[tail++] = 0;
  while (head < tail) {
    const index = queue[head++];
    const base = index * 8;
    for (const t of PERM_TOKEN_INDEX) {
      const map = MOVE_PERM[t];
      const next = new Int8Array(8);
      for (let s = 0; s < 8; s += 1) next[map[s]] = cache[base + s];
      const ni = permIndex(next);
      if (dist[ni] < 0) {
        dist[ni] = dist[index] + 1;
        queue[tail++] = ni;
      }
    }
  }
  return dist;
}

export function buildTwoPhaseTables() {
  return {
    ori: buildOrientationTable(),
    perm: buildPermutationTable(),
  };
}

const PHASE1_SOLUTION_CAP = 4000;

function collectOrientationSolutions(co, depth, tables, out) {
  const state = Int8Array.from(co);
  const path = [];
  const dfs = (cur, remaining, lastFace) => {
    if (out.length >= PHASE1_SOLUTION_CAP) return;
    if (tables.ori[oriIndex(cur)] > remaining) return;
    if (remaining === 0) {
      if (tables.ori[oriIndex(cur)] === 0) out.push(path.slice());
      return;
    }
    for (let t = 0; t < TOKENS.length; t += 1) {
      const face = TOKEN_FACE[t];
      if (face === lastFace) continue;
      if (lastFace && OPPOSITE[face] === lastFace && FACE_ORDER_INDEX[face] < FACE_ORDER_INDEX[lastFace]) continue;
      const perm = MOVE_PERM[t];
      const delta = MOVE_DELTA[t];
      const next = new Int8Array(8);
      for (let s = 0; s < 8; s += 1) next[perm[s]] = (cur[s] + delta[s]) % 3;
      path.push(t);
      dfs(next, remaining - 1, face);
      path.pop();
      if (out.length >= PHASE1_SOLUTION_CAP) return;
    }
  };
  dfs(state, depth, null);
  return out;
}

function solvePermutation(cp, tables) {
  let d = tables.perm[permIndex(cp)];
  if (d < 0) throw new Error('2x2 permutation phase reached an unreachable state');
  const moves = [];
  while (d > 0) {
    let advanced = false;
    for (const t of PERM_TOKEN_INDEX) {
      const { cp: next } = applyCornerMove(cp, new Int8Array(8), t);
      if (tables.perm[permIndex(next)] === d - 1) {
        cp = next;
        moves.push(t);
        d -= 1;
        advanced = true;
        break;
      }
    }
    if (!advanced) throw new Error('2x2 permutation phase stalled');
  }
  return moves;
}

export function solveTwoPhase(cp, co, tables) {
  if (isCornerSolved(cp, co)) return { moves: [], boundary: 0 };
  const start = tables.ori[oriIndex(co)];
  let best = null;
  const maxDepth = Math.min(start + 1, 7);
  for (let depth = start; depth <= maxDepth; depth += 1) {
    const solutions = collectOrientationSolutions(co, depth, tables, []);
    for (const path of solutions) {
      let cpAfter = cp;
      for (const t of path) cpAfter = applyCornerMove(cpAfter, new Int8Array(8), t).cp;
      const d2 = tables.perm[permIndex(cpAfter)];
      if (d2 < 0) continue;
      const total = path.length + d2;
      if (!best || total < best.total) best = { total, path: path.slice(), cpAfter };
    }
    if (best && best.total === start) break;
  }
  if (!best) throw new Error('2x2 two-phase search found no solution');

  const phase2 = solvePermutation(best.cpAfter, tables);
  const sequence = [...best.path, ...phase2].map((t) => TOKENS[t]);
  const simplified = simplifyTokens(sequence);

  const boundary = orientationBoundary(cp, co, simplified);
  return { moves: simplified, boundary };
}

function simplifyTokens(tokens) {
  const out = [];
  const amountOf = (token) => (token.endsWith("'") ? 3 : token.endsWith('2') ? 2 : 1);
  for (const token of tokens) {
    if (out.length && out[out.length - 1][0] === token[0]) {
      const last = out.pop();
      const amount = (amountOf(last) + amountOf(token)) % 4;
      if (amount !== 0) {
        const face = token[0];
        out.push(amount === 1 ? face : amount === 2 ? `${face}2` : `${face}'`);
      }
    } else {
      out.push(token);
    }
  }
  return out;
}

function orientationBoundary(cp, co, tokens) {
  let cpCur = cp;
  let coCur = co;
  if (coCur.every((v) => v === 0)) return 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = TOKENS.indexOf(tokens[i]);
    const next = applyCornerMove(cpCur, coCur, t);
    cpCur = next.cp;
    coCur = next.co;
    if (coCur.every((v) => v === 0)) return i + 1;
  }
  return tokens.length;
}
