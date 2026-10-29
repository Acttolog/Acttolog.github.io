// Facelet tables for 2x2 and 3x3 cubes. Colors are indexed 0..5 in the
// order U, R, F, D, L, B. A model exposes slot tables and move permutations.

import { FACES, FACE_AXIS, FACE_VECTORS, vecToFace } from './cube-engine.js';

export const FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
export const FACE_BY_INDEX = FACES;

function rotQuarter(pos, dir, axis, sign) {
  const r = (v) => {
    const [x, y, z] = v;
    if (axis === 'x') return sign > 0 ? [x, -z, y] : [x, z, -y];
    if (axis === 'y') return sign > 0 ? [z, y, -x] : [-z, y, x];
    return sign > 0 ? [-y, x, z] : [y, -x, z];
  };
  return [r(pos), vecToFace(r(FACE_VECTORS[dir]))];
}

export function cellCoord(index, size) {
  return size === 2 ? (index === 0 ? -1 : 1) : index - 1;
}

export function createFaceletModel(size = 3) {
  if (size !== 2 && size !== 3) throw new Error(`unsupported cube size ${size}`);
  const coords = size === 2 ? [-1, 1] : [-1, 0, 1];

  const SLOTS = [];
  const SLOT_INDEX = new Map();
  for (const x of coords) {
    for (const y of coords) {
      for (const z of coords) {
        if (x === 0 && y === 0 && z === 0) continue;
        for (const face of FACES) {
          const [axis, layer] = FACE_AXIS[face];
          if ({ x, y, z }[axis] !== layer) continue;
          SLOT_INDEX.set(`${x},${y},${z}:${face}`, SLOTS.length);
          SLOTS.push({ pos: [x, y, z], face, color: FACE_INDEX[face] });
        }
      }
    }
  }

  const SOLVED = Uint8Array.from(SLOTS.map((slot) => slot.color));

  function slotKey(pos, face) {
    return `${pos[0]},${pos[1]},${pos[2]}:${face}`;
  }

  function idx(pos, face) {
    const i = SLOT_INDEX.get(slotKey(pos, face));
    if (i === undefined) throw new Error(`no facelet ${slotKey(pos, face)}`);
    return i;
  }

  const MOVE_PERM = {};
  const MOVE_TOKENS = [];
  for (const face of FACES) {
    const [axis, layer] = FACE_AXIS[face];
    for (const amount of [1, -1, 2]) {
      const token = amount === 1 ? face : amount === -1 ? `${face}'` : `${face}2`;
      MOVE_TOKENS.push(token);
      const turns = amount === 2 ? 2 : amount === 1 ? 1 : 3;
      const dest = new Uint8Array(SLOTS.length);
      for (let i = 0; i < SLOTS.length; i++) {
        const slot = SLOTS[i];
        let pos = slot.pos.slice();
        let dir = slot.face;
        if (pos[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] === layer) {
          for (let t = 0; t < turns; t++) {
            const [np, nd] = rotQuarter(pos, dir, axis, -layer);
            pos = np;
            dir = nd;
          }
        }
        dest[i] = SLOT_INDEX.get(slotKey(pos, dir));
      }
      MOVE_PERM[token] = dest;
    }
  }

  function applyMove(state, token) {
    const perm = MOVE_PERM[token];
    const out = new Uint8Array(state.length);
    for (let i = 0; i < state.length; i++) out[perm[i]] = state[i];
    return out;
  }

  function applyMoves(state, tokens) {
    let s = state;
    for (const token of tokens) s = applyMove(s, token);
    return s;
  }

  function fromCube(cube) {
    if (cube.size !== size) throw new Error(`cube is ${cube.size}x${cube.size}, model is ${size}x${size}`);
    const out = new Uint8Array(SLOTS.length);
    for (let i = 0; i < SLOTS.length; i++) {
      const { pos, face } = SLOTS[i];
      const cubie = cube.cubieAt(pos[0], pos[1], pos[2]);
      out[i] = FACE_INDEX[cubie.stickers[face]];
    }
    return out;
  }

  function pieceSlots(pos) {
    return FACES.filter((face) => {
      const [axis, layer] = FACE_AXIS[face];
      return pos[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] === layer;
    });
  }

  function faceletIndices(pos, faces) {
    return faces.map((face) => idx(pos, face));
  }

  function pieceIndices(pos) {
    return pieceSlots(pos).map((face) => idx(pos, face));
  }

  function isPieceSolved(state, pos) {
    for (const face of pieceSlots(pos)) {
      if (state[idx(pos, face)] !== FACE_INDEX[face]) return false;
    }
    return true;
  }

  function isFaceSolved(state, face) {
    const fi = FACE_INDEX[face];
    for (let i = 0; i < SLOTS.length; i++) {
      if (SLOTS[i].face === face && state[i] !== fi) return false;
    }
    return true;
  }

  function isSolved(state) {
    for (let i = 0; i < SLOTS.length; i++) if (state[i] !== SLOTS[i].color) return false;
    return true;
  }

  function keyOf(state, indices = null) {
    let s = '';
    if (!indices) {
      for (let i = 0; i < state.length; i++) s += String.fromCharCode(48 + state[i]);
      return s;
    }
    for (const i of indices) s += String.fromCharCode(48 + state[i]);
    return s;
  }

  // Unfolded net: U over F; L F R B across; D under F.
  function netPos(face, row, col) {
    const u = cellCoord(col, size);
    const v = cellCoord(row, size);
    switch (face) {
      case 'U': return [u, 1, v];
      case 'D': return [u, -1, -v];
      case 'F': return [u, -v, 1];
      case 'B': return [-u, -v, -1];
      case 'R': return [1, -v, -u];
      case 'L': return [-1, -v, u];
      default: return null;
    }
  }

  function gridIndex(face, row, col) {
    const pos = netPos(face, row, col);
    if (!pos || row < 0 || row >= size || col < 0 || col >= size) {
      throw new Error(`bad net cell ${face}${row},${col}`);
    }
    return idx(pos, face);
  }

  return {
    size,
    SLOTS,
    SLOT_INDEX,
    SOLVED,
    MOVE_PERM,
    MOVE_TOKENS,
    idx,
    applyMove,
    applyMoves,
    fromCube,
    faceletIndices,
    pieceIndices,
    isPieceSolved,
    isFaceSolved,
    isSolved,
    keyOf,
    netPos,
    gridIndex,
  };
}
