// Pure cube state model. No rendering dependencies.
// Faces: U(yellow, +y), D(white, -y), R(red, +x), L(orange, -x), F(green, +z), B(blue, -z).
// A sticker's value is the face-color key it carries ('U' = yellow, 'D' = white, ...).

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const FACE_VECTORS = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};
export const FACE_AXIS = {
  U: ['y', 1],
  D: ['y', -1],
  R: ['x', 1],
  L: ['x', -1],
  F: ['z', 1],
  B: ['z', -1],
};
export const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
export const STICKER_HEX = {
  U: '#ffbf00',
  R: '#e5383b',
  F: '#00a86b',
  D: '#f4f5f0',
  L: '#ff7a00',
  B: '#1d5bff',
};

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

export function vecToFace(v) {
  if (v[1] === 1) return 'U';
  if (v[1] === -1) return 'D';
  if (v[0] === 1) return 'R';
  if (v[0] === -1) return 'L';
  if (v[2] === 1) return 'F';
  if (v[2] === -1) return 'B';
  return null;
}

// Right-handed +90 degree rotation.
function rot90(v, axis, sign) {
  const [x, y, z] = v;
  if (axis === 'x') return sign > 0 ? [x, -z, y] : [x, z, -y];
  if (axis === 'y') return sign > 0 ? [z, y, -x] : [-z, y, x];
  return sign > 0 ? [-y, x, z] : [y, -x, z];
}

export function parseMove(move) {
  const face = move[0].toUpperCase();
  if (!(face in FACE_AXIS)) throw new Error(`bad move ${move}`);
  const suffix = move.slice(1);
  let amount = 1;
  if (suffix === "'") amount = -1;
  else if (suffix === '2' || suffix === "2'") amount = 2;
  else if (suffix !== '') throw new Error(`bad move ${move}`);
  return { face, amount };
}

export function formatMove(face, amount) {
  if (amount === 2) return `${face}2`;
  return amount === 1 ? face : `${face}'`;
}

export function inverseMove(move) {
  const { face, amount } = parseMove(move);
  return formatMove(face, amount === 2 ? 2 : -amount);
}

export function simplifyMoves(moves) {
  const out = [];
  for (const m of moves) {
    const next = typeof m === 'string' ? m : formatMove(m.face, m.amount);
    if (!out.length) { out.push(next); continue; }
    const last = parseMove(out[out.length - 1]);
    const cur = parseMove(next);
    if (last.face === cur.face) {
      let amount = (((last.amount + cur.amount) % 4) + 4) % 4;
      if (amount > 2) amount -= 4;
      out.pop();
      if (amount !== 0) out.push(formatMove(cur.face, amount));
    } else {
      out.push(next);
    }
  }
  return out;
}

export class Cube {
  constructor(size = 3) {
    this.size = size;
    this.reset();
  }

  reset() {
    this.cubies = [];
    const coords = this.size === 2 ? [-1, 1] : [-1, 0, 1];
    for (const x of coords) {
      for (const y of coords) {
        for (const z of coords) {
          if (x === 0 && y === 0 && z === 0) continue;
          const stickers = {};
          if (y === 1) stickers.U = 'U';
          if (y === -1) stickers.D = 'D';
          if (x === 1) stickers.R = 'R';
          if (x === -1) stickers.L = 'L';
          if (z === 1) stickers.F = 'F';
          if (z === -1) stickers.B = 'B';
          this.cubies.push({ pos: [x, y, z], stickers });
        }
      }
    }
  }

  clone() {
    const c = Object.create(Cube.prototype);
    c.size = this.size;
    c.cubies = this.cubies.map((cu) => ({ pos: cu.pos.slice(), stickers: { ...cu.stickers } }));
    return c;
  }

  cubieAt(x, y, z) {
    return this.cubies.find((c) => c.pos[0] === x && c.pos[1] === y && c.pos[2] === z) || null;
  }

  findPiece(colors) {
    const want = [...colors].sort().join('');
    return (
      this.cubies.find((c) => {
        const have = Object.values(c.stickers).sort().join('');
        return have === want;
      }) || null
    );
  }

  stickerFaceOf(cubie, color) {
    for (const [face, c] of Object.entries(cubie.stickers)) {
      if (c === color) return face;
    }
    return null;
  }

  solvedPiece(pos) {
    const c = this.cubieAt(pos[0], pos[1], pos[2]);
    if (!c) return false;
    for (const [face, color] of Object.entries(c.stickers)) {
      if (color !== face) return false;
    }
    return true;
  }

  isSolved() {
    return this.cubies.every((c) => Object.entries(c.stickers).every(([face, color]) => face === color));
  }

  // Apply a single quarter/half turn. axis/sign are derived from face geometry.
  applyMove(move) {
    const { face, amount } = typeof move === 'string' ? parseMove(move) : move;
    const [axis, layer] = FACE_AXIS[face];
    const turns = amount === 2 ? 2 : 1;
    const sign = amount === 2 ? -layer : -layer * amount;
    const axisIdx = AXIS_INDEX[axis];
    for (let t = 0; t < turns; t++) {
      for (const cubie of this.cubies) {
        if (cubie.pos[axisIdx] !== layer) continue;
        cubie.pos = rot90(cubie.pos, axis, sign);
        const stickers = {};
        for (const [dir, color] of Object.entries(cubie.stickers)) {
          const nd = vecToFace(rot90(FACE_VECTORS[dir], axis, sign));
          stickers[nd] = color;
        }
        cubie.stickers = stickers;
      }
    }
    return this;
  }

  applyMoves(moves) {
    for (const m of moves) this.applyMove(m);
    return this;
  }

  key() {
    let s = '';
    for (const c of this.cubies) {
      s += c.pos.join('') + ':';
      for (const f of FACE_ORDER) s += c.stickers[f] ?? '.';
      s += '|';
    }
    return s;
  }

  pieceKey(colors) {
    const p = this.findPiece(colors);
    if (!p) return null;
    const dirs = colors.map((color) => this.stickerFaceOf(p, color)).sort();
    return p.pos.join(',') + ':' + dirs.join('');
  }

  sticker(face, row, col) {
    // row/col 0..size-1, top->bottom / left->right as seen looking at the face.
    const coord = this.size === 2 ? (i) => (i === 0 ? -1 : 1) : (i) => i - 1;
    const axis = ['x', 'y', 'z'].indexOf(FACE_AXIS[face][0]);
    let uAxis, vAxis, uSign, vSign;
    switch (face) {
      case 'U': uAxis = 0; uSign = 1; vAxis = 2; vSign = 1; break;
      case 'D': uAxis = 0; uSign = 1; vAxis = 2; vSign = -1; break;
      case 'F': uAxis = 0; uSign = 1; vAxis = 1; vSign = -1; break;
      case 'B': uAxis = 0; uSign = -1; vAxis = 1; vSign = -1; break;
      case 'R': uAxis = 2; uSign = -1; vAxis = 1; vSign = -1; break;
      case 'L': uAxis = 2; uSign = 1; vAxis = 1; vSign = -1; break;
    }
    const pos = [0, 0, 0];
    pos[axis] = FACE_AXIS[face][1];
    pos[uAxis] = coord(col) * uSign;
    pos[vAxis] = -coord(row) * vSign;
    const cubie = this.cubieAt(pos[0], pos[1], pos[2]);
    return cubie ? cubie.stickers[face] : null;
  }
}

export const ROTATIONS = {
  x: [['U', 'F', 'D', 'B'], 1],
  y: [['F', 'L', 'B', 'R'], 1],
  z: [['U', 'R', 'D', 'L'], 1],
};
