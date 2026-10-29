// Layer-by-layer solver on the compact 54-facelet model.
// Cross is solved optimally with BFS. Later stages search over verified
// algorithm macros using only the piece being solved as search state.

import { FACES, FACE_VECTORS, OPPOSITE } from './cube-engine.js';
import {
  FACE_BY_INDEX, FACE_INDEX, MOVE_TOKENS, SOLVED, applyMove, fromCube, isSolved,
  isPieceSolved, idx,
} from './facelet.js';

const FACE_AXIS_INDEX = { x: 0, y: 1, z: 2 };
const FACE_AXIS = { U: ['y', 1], D: ['y', -1], R: ['x', 1], L: ['x', -1], F: ['z', 1], B: ['z', -1] };

function outwardFaces(pos) {
  return FACES.filter((face) => {
    const [axis, layer] = FACE_AXIS[face];
    return pos[FACE_AXIS_INDEX[axis]] === layer;
  });
}
function slotIndexOf(pos) {
  return pos.join(',');
}
function posOfColors(...faces) {
  return faces.reduce((acc, f) => acc.map((v, i) => v + FACE_VECTORS[f][i]), [0, 0, 0]);
}

const CROSS_EDGES = [
  { colors: ['D', 'F'], pos: posOfColors('D', 'F') },
  { colors: ['D', 'R'], pos: posOfColors('D', 'R') },
  { colors: ['D', 'B'], pos: posOfColors('D', 'B') },
  { colors: ['D', 'L'], pos: posOfColors('D', 'L') },
];
const D_CORNERS = [
  { colors: ['D', 'F', 'R'], pos: posOfColors('D', 'F', 'R'), right: 'R' },
  { colors: ['D', 'B', 'R'], pos: posOfColors('D', 'R', 'B'), right: 'B' },
  { colors: ['D', 'B', 'L'], pos: posOfColors('D', 'B', 'L'), right: 'L' },
  { colors: ['D', 'F', 'L'], pos: posOfColors('D', 'F', 'L'), right: 'F' },
];
const MIDDLE_EDGES = [
  { colors: ['F', 'R'], pos: posOfColors('F', 'R') },
  { colors: ['R', 'B'], pos: posOfColors('R', 'B') },
  { colors: ['B', 'L'], pos: posOfColors('B', 'L') },
  { colors: ['F', 'L'], pos: posOfColors('F', 'L') },
];

const EDGE_SLOTS = [];
const CORNER_SLOTS = [];
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      const pos = [x, y, z];
      if (pos.every((v) => v === 0)) continue;
      const faces = outwardFaces(pos);
      const entry = {
        pos,
        faces,
        indices: faces.map((f) => idx(pos, f)),
      };
      if (faces.length === 2) EDGE_SLOTS.push(entry);
      if (faces.length === 3) CORNER_SLOTS.push(entry);
    }
  }
}

function colorAt(state, slot, i) {
  return FACE_BY_INDEX[state[slot.indices[i]]];
}
function findEdgeSlot(state, colors) {
  const [a, b] = colors;
  for (let s = 0; s < EDGE_SLOTS.length; s++) {
    const slot = EDGE_SLOTS[s];
    const c0 = colorAt(state, slot, 0);
    const c1 = colorAt(state, slot, 1);
    if ((c0 === a && c1 === b) || (c0 === b && c1 === a)) {
      const aFace = c0 === a ? slot.faces[0] : slot.faces[1];
      return { slot: s, upDown: aFace === 'D' || aFace === 'U' };
    }
  }
  return null;
}
function findCornerSlot(state, colors) {
  for (let s = 0; s < CORNER_SLOTS.length; s++) {
    const slot = CORNER_SLOTS[s];
    const cs = slot.faces.map((_, i) => colorAt(state, slot, i));
    if (colors.every((c) => cs.includes(c)) && new Set(cs).size === 3) {
      const dIndex = cs.indexOf('D');
      return { slot: s, dFace: slot.faces[dIndex] };
    }
  }
  return null;
}
function edgePieceKey(state, colors) {
  const loc = findEdgeSlot(state, colors);
  return `${loc.slot}:${loc.upDown ? 1 : 0}`;
}
function cornerPieceKey(state, colors) {
  const loc = findCornerSlot(state, colors);
  return `${loc.slot}:${loc.dFace}`;
}

function crossKey(state) {
  let key = '';
  for (const edge of CROSS_EDGES) key += edgePieceKey(state, edge.colors) + '|';
  return key;
}

const uFaceIndices = [];
for (let x = -1; x <= 1; x++) {
  for (let z = -1; z <= 1; z++) uFaceIndices.push(idx([x, 1, z], 'U'));
}

const FACE_RIGHT = { F: 'R', R: 'B', B: 'L', L: 'F' };
const FACE_LEFT = { F: 'L', L: 'B', B: 'R', R: 'F' };

function macro(name, phase, moves, extra = {}) {
  return { name, phase, moves, ...extra };
}

function shiftAlg(alg, faceMap) {
  return alg.split(' ').map((token) => (faceMap[token[0]] || token[0]) + token.slice(1));
}

function yRotVariants(alg) {
  const variants = [];
  let map = { U: 'U', D: 'D', F: 'F', R: 'R', B: 'B', L: 'L' };
  for (let i = 0; i < 4; i++) {
    variants.push(shiftAlg(alg, map));
    map = { U: 'U', D: 'D', F: map.R, R: map.B, B: map.L, L: map.F };
  }
  return variants;
}

const OLL_EDGE_ALG = "F R U R' U' F'";
const SUNE_ALG = "R U R' U R U2 R'";
const ANTISUNE_ALG = "R U2 R' U' R U' R'";
const APERM_ALG = "R' F R' B2 R F' R' B2 R2";
const UPERM_ALG = "R U' R U R U R U' R' U' R2";
const TPERM_ALG = "R U R' U' R' F R2 U' R' U' R U R' F'";

const U_TURNS = [
  macro('U', 'U', ['U']),
  macro("U'", 'U', ["U'"]),
  macro('U2', 'U', ['U2']),
];

function rightInsert(front) {
  const right = FACE_RIGHT[front];
  return macro(
    `insertR-${front}`,
    'F2L',
    ['U', right, "U'", `${right}'`, "U'", `${front}'`, 'U', front],
    { slot: posOfColors(front, right) }
  );
}
function leftInsert(front) {
  const left = FACE_LEFT[front];
  return macro(
    `insertL-${front}`,
    'F2L',
    ["U'", `${left}'`, 'U', left, 'U', front, "U'", `${front}'`],
    { slot: posOfColors(front, left) }
  );
}

function ollMacros() {
  const out = [...U_TURNS];
  for (const alg of yRotVariants(OLL_EDGE_ALG)) out.push(macro('OLL-edge', 'OLL', alg));
  for (const alg of yRotVariants(SUNE_ALG)) out.push(macro('Sune', 'OLL', alg));
  for (const alg of yRotVariants(ANTISUNE_ALG)) out.push(macro('Anti-sune', 'OLL', alg));
  return out;
}

function pllMacros() {
  const out = [...U_TURNS];
  for (const alg of yRotVariants(APERM_ALG)) out.push(macro('A-perm', 'PLL', alg));
  for (const alg of yRotVariants(UPERM_ALG)) out.push(macro('U-perm', 'PLL', alg));
  for (const alg of yRotVariants(TPERM_ALG)) out.push(macro('T-perm', 'PLL', alg));
  return out;
}

function cornerMacros(right) {
  const macros = [...U_TURNS];
  for (const c of D_CORNERS) {
    macros.push(macro(`extract-${c.right}`, 'Corners', [c.right, 'U', `${c.right}'`], { slot: c.pos, kind: 'extract' }));
  }
  macros.push(macro('insert', 'Corners', [right, 'U', `${right}'`, "U'"], { kind: 'insert' }));
  macros.push(macro('insertB', 'Corners', [right, "U'", `${right}'`, 'U'], { kind: 'insert' }));
  return macros;
}

const middleMacros = [...U_TURNS];
for (const front of ['F', 'R', 'B', 'L']) {
  middleMacros.push(rightInsert(front));
  middleMacros.push(leftInsert(front));
}

function crossSolved(state) {
  return CROSS_EDGES.every((p) => isPieceSolved(state, p.pos));
}
function f2lSolved(state) {
  return crossSolved(state) && D_CORNERS.every((c) => isPieceSolved(state, c.pos));
}
function ollSolved(state) {
  return uFaceIndices.every((i) => state[i] === FACE_INDEX.U);
}
function samePos(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function fullKey(state) {
  let s = '';
  for (let i = 0; i < 54; i++) s += String.fromCharCode(65 + state[i]);
  return s;
}

function bfs(state, moves, goal, keyFn, maxDepth = 8) {
  if (goal(state)) return [];
  const visited = new Set([keyFn(state)]);
  let frontier = [{ state, path: [] }];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      const lastFace = node.path.length ? node.path[node.path.length - 1][0] : null;
      for (const mv of moves) {
        if (mv[0] === lastFace) continue;
        const child = applyMove(node.state, mv);
        if (goal(child)) return [...node.path, mv];
        const key = keyFn(child);
        if (visited.has(key)) continue;
        visited.add(key);
        next.push({ state: child, path: [...node.path, mv] });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return null;
}

function applyMacro(state, m) {
  let s = state;
  for (const mv of m.moves) s = applyMove(s, mv);
  return s;
}

function macroBfs(state, macros, goal, keyFn, maxDepth = 6, allowed = null) {
  if (goal(state)) return [];
  const visited = new Set([keyFn(state)]);
  let frontier = [{ state, path: [] }];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      const lastMacro = node.path.length ? node.path[node.path.length - 1] : null;
      for (const m of macros) {
        if (m === lastMacro) continue;
        if (allowed && !allowed(node.state, m)) continue;
        const child = applyMacro(node.state, m);
        if (goal(child)) return [...node.path, m];
        const key = keyFn(child);
        if (visited.has(key)) continue;
        visited.add(key);
        next.push({ state: child, path: [...node.path, m] });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return null;
}

function invertToken(token) {
  if (token.endsWith('2')) return token;
  if (token.endsWith("'")) return token[0];
  return token + "'";
}

// A cached pattern database for the white cross: keys of every white-edge
// configuration within four moves of solved, mapped to the moves that solve it.
let crossBook = null;
function getCrossBook(depth = 4) {
  if (crossBook) return crossBook;
  const book = new Map();
  book.set(crossKey(SOLVED), []);
  let frontier = [{ state: SOLVED, lastFace: null }];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const node of frontier) {
      for (const token of MOVE_TOKENS) {
        if (token[0] === node.lastFace) continue;
        const child = applyMove(node.state, token);
        const key = crossKey(child);
        if (book.has(key)) continue;
        book.set(key, [invertToken(token), ...book.get(crossKey(node.state))]);
        next.push({ state: child, lastFace: token[0] });
      }
    }
    frontier = next;
  }
  crossBook = book;
  return book;
}

function crossSolve(state) {
  if (crossSolved(state)) return [];
  const book = getCrossBook();
  const visited = new Set([crossKey(state)]);
  let frontier = [{ state, path: [] }];
  for (let depth = 0; depth < 5; depth++) {
    const next = [];
    for (const node of frontier) {
      const lastFace = node.path.length ? node.path[node.path.length - 1][0] : null;
      for (const mv of MOVE_TOKENS) {
        if (mv[0] === lastFace) continue;
        const child = applyMove(node.state, mv);
        const key = crossKey(child);
        if (book.has(key)) {
          const tail = book.get(key);
          const candidate = [...node.path, mv, ...tail];
          // Verify against the real cross (guards the abstraction).
          let check = state;
          for (const t of candidate) check = applyMove(check, t);
          if (crossSolved(check)) return candidate;
          continue;
        }
        if (visited.has(key)) continue;
        visited.add(key);
        next.push({ state: child, path: [...node.path, mv] });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return bfs(state, MOVE_TOKENS, crossSolved, crossKey, 8);
}

function simplifySolution(moves) {
  const stack = [];
  const amtOf = (m) => (m.endsWith("'") ? 3 : m.endsWith('2') ? 2 : 1);
  for (const item of moves) {
    if (stack.length && stack[stack.length - 1].move[0] === item.move[0]) {
      const last = stack.pop();
      const amt = (amtOf(last.move) + amtOf(item.move)) % 4;
      if (amt !== 0) {
        const face = item.move[0];
        stack.push({
          move: amt === 1 ? face : amt === 2 ? `${face}2` : `${face}'`,
          phase: item.phase,
        });
      }
    } else {
      stack.push({ ...item });
    }
  }
  return stack;
}

function flatten(path, phaseName) {
  const out = [];
  for (const m of path) {
    const phase = m.phase === 'U' ? phaseName : m.phase;
    for (const mv of m.moves) out.push({ move: mv, phase });
  }
  return out;
}

function profile() {
  return typeof process !== 'undefined' && process.env && process.env.SOLVE_PROFILE;
}

export function solve(cube) {
  let state = fromCube(cube);
  const tagged = [];
  const t0 = Date.now();

  const crossPath = crossSolve(state);
  if (!crossPath) throw new Error('cross solver failed');
  for (const mv of crossPath) {
    state = applyMove(state, mv);
    tagged.push({ move: mv, phase: 'Cross' });
  }
  if (profile()) console.error('cross', Date.now() - t0, crossPath.length);

  const solvedCorners = [];
  for (const corner of D_CORNERS) {
    if (!isPieceSolved(state, corner.pos)) {
      const cornerKeyFn = (s) => cornerPieceKey(s, corner.colors);
      const allowed = (s, m) => {
        if (m.kind === 'extract') {
          const loc = findCornerSlot(s, corner.colors);
          return samePos(CORNER_SLOTS[loc.slot].pos, m.slot);
        }
        return true;
      };
      const goal = (s) => isPieceSolved(s, corner.pos);
      const path = macroBfs(state, cornerMacros(corner.right), goal, cornerKeyFn, 8, allowed);
      if (!path) throw new Error('corner solver failed ' + corner.pos.join(','));
      const flat = flatten(path, 'Corners');
      for (const item of flat) state = applyMove(state, item.move);
      tagged.push(...flat);
    }
    solvedCorners.push(corner);
    if (profile()) console.error('corner', corner.right, 'after', Date.now() - t0);
  }
  if (!f2lSolved(state)) throw new Error('corner stage broke the first layer');

  const solvedEdges = [];
  for (const edge of MIDDLE_EDGES) {
    if (!isPieceSolved(state, edge.pos)) {
      const edgeKey = (s) => edgePieceKey(s, edge.colors);
      const allowed = (s, m) => {
        if (!m.slot) return true;
        if (samePos(m.slot, edge.pos)) return true;
        const loc = findEdgeSlot(s, edge.colors);
        return samePos(EDGE_SLOTS[loc.slot].pos, m.slot);
      };
      const goal = (s) => isPieceSolved(s, edge.pos);
      const path = macroBfs(state, middleMacros, goal, edgeKey, 7, allowed);
      if (!path) throw new Error('middle solver failed ' + edge.pos.join(','));
      const flat = flatten(path, 'F2L');
      for (const item of flat) state = applyMove(state, item.move);
      tagged.push(...flat);
    }
    solvedEdges.push(edge);
    if (profile()) console.error('middle', edge.pos.join(','), 'after', Date.now() - t0);
  }
  if (!f2lSolved(state)) throw new Error('middle stage broke F2L');

  if (!ollSolved(state)) {
    const path = macroBfs(state, ollMacros(), ollSolved, fullKey, 5);
    if (!path) throw new Error('OLL solver failed');
    const flat = flatten(path, 'OLL');
    for (const item of flat) state = applyMove(state, item.move);
    tagged.push(...flat);
  }
  if (profile()) console.error('oll', 'after', Date.now() - t0);

  if (!isSolved(state)) {
    const path = macroBfs(state, pllMacros(), isSolved, fullKey, 5);
    if (!path) throw new Error('PLL solver failed');
    const flat = flatten(path, 'PLL');
    for (const item of flat) state = applyMove(state, item.move);
    tagged.push(...flat);
  }
  if (profile()) console.error('pll', 'after', Date.now() - t0);

  if (!isSolved(state)) throw new Error('solver ended unsolved');
  return simplifySolution(tagged);
}

export function scramble(length = 24, random = Math.random) {
  const moves = [];
  let lastFace = null;
  let beforeLast = null;
  for (let i = 0; i < length; i++) {
    let face;
    do {
      face = FACES[Math.floor(random() * 6)];
    } while (face === lastFace || (beforeLast && face === OPPOSITE[lastFace] && face === beforeLast));
    const r = random();
    const amount = r < 0.34 ? 1 : r < 0.67 ? -1 : 2;
    moves.push(amount === 1 ? face : amount === -1 ? `${face}'` : `${face}2`);
    beforeLast = lastFace;
    lastFace = face;
  }
  return moves;
}
