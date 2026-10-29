// Custom sticker positions for 2x2 and 3x3: net mapping, legality checks,
// progress stats, facelet-code import/export, and piece inspection.

import { FACES, FACE_AXIS } from './cube-engine.js';
import { FACE_BY_INDEX, FACE_INDEX } from './facelet-model.js';
import * as model2 from './facelet2.js';
import * as model3 from './facelet.js';

export const COLOR_LABEL = {
  U: 'Yellow',
  R: 'Red',
  F: 'Green',
  D: 'White',
  L: 'Orange',
  B: 'Blue',
};
export const PALETTE_ORDER = ['U', 'D', 'F', 'B', 'R', 'L'];

const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const CORNER_ORDER = {
  '1,1,1': ['U', 'R', 'F'], '-1,1,1': ['U', 'F', 'L'],
  '-1,1,-1': ['U', 'L', 'B'], '1,1,-1': ['U', 'B', 'R'],
  '1,-1,1': ['D', 'F', 'R'], '-1,-1,1': ['D', 'L', 'F'],
  '-1,-1,-1': ['D', 'B', 'L'], '1,-1,-1': ['D', 'R', 'B'],
};
const isUD = (face) => face === 'U' || face === 'D';
const isFB = (face) => face === 'F' || face === 'B';

function outwardFaces(pos, size) {
  return FACES.filter((face) => {
    const [axis, layer] = FACE_AXIS[face];
    return pos[AXIS_INDEX[axis]] === layer;
  });
}

function prettyName(colors) {
  return [...colors].sort(mapColorOrder).map((color) => COLOR_LABEL[color]).join('-');
}

function mapColorOrder(a, b) {
  return PALETTE_ORDER.indexOf(a) - PALETTE_ORDER.indexOf(b);
}

function parity(permutation) {
  let inversions = 0;
  for (let i = 0; i < permutation.length; i += 1) {
    for (let j = i + 1; j < permutation.length; j += 1) {
      if (permutation[i] > permutation[j]) inversions += 1;
    }
  }
  return inversions % 2;
}

function createPuzzle(size) {
  const model = size === 2 ? model2 : model3;
  const coords = size === 2 ? [-1, 1] : [-1, 0, 1];
  const corners = [];
  const edges = [];
  const centers = [];
  const pieceBySticker = new Array(model.SLOTS.length).fill(null);

  for (const x of coords) {
    for (const y of coords) {
      for (const z of coords) {
        if (x === 0 && y === 0 && z === 0) continue;
        const pos = [x, y, z];
        const outward = outwardFaces(pos, size);
        if (outward.length === 3) {
          const faces = CORNER_ORDER[pos.join(',')];
          const piece = {
            kind: 'corner',
            pos,
            faces,
            indices: faces.map((face) => model.idx(pos, face)),
            homeKey: [...faces].sort().join(''),
          };
          corners.push(piece);
          piece.indices.forEach((index) => { pieceBySticker[index] = piece; });
        } else if (outward.length === 2) {
          const refFace = outward.find(isUD) || outward.find(isFB);
          const piece = {
            kind: 'edge',
            pos,
            faces: outward,
            indices: outward.map((face) => model.idx(pos, face)),
            homeKey: [...outward].sort().join(''),
            refFace,
          };
          edges.push(piece);
          piece.indices.forEach((index) => { pieceBySticker[index] = piece; });
        } else if (outward.length === 1) {
          const piece = {
            kind: 'center',
            pos,
            faces: outward,
            indices: outward.map((face) => model.idx(pos, face)),
            homeKey: outward[0],
          };
          centers.push(piece);
          pieceBySticker[piece.indices[0]] = piece;
        }
      }
    }
  }

  const cornerHome = new Map(corners.map((piece, index) => [piece.homeKey, index]));
  const edgeHome = new Map(edges.map((piece, index) => [piece.homeKey, index]));

  function colorAt(state, piece, index) {
    return FACE_BY_INDEX[state[piece.indices[index]]];
  }

  function statsOf(state) {
    let misplacedStickers = 0;
    const perFace = {};
    for (const face of FACES) {
      let done = 0;
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const index = model.gridIndex(face, row, col);
          if (state[index] === FACE_INDEX[face]) done += 1;
          else misplacedStickers += 1;
        }
      }
      perFace[face] = { done, total: size * size, complete: done === size * size };
    }
    let cornersSolved = 0;
    for (const piece of corners) {
      if (piece.indices.every((index, k) => state[index] === FACE_INDEX[piece.faces[k]])) {
        cornersSolved += 1;
      }
    }
    let edgesSolved = 0;
    for (const piece of edges) {
      if (piece.indices.every((index, k) => state[index] === FACE_INDEX[piece.faces[k]])) {
        edgesSolved += 1;
      }
    }
    const solidFaces = FACES.filter((face) => {
      let single = true;
      let first = null;
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const value = state[model.gridIndex(face, row, col)];
          if (first === null) first = value;
          else if (value !== first) single = false;
        }
      }
      return single;
    }).length;
    return {
      size,
      perFace,
      misplacedStickers,
      totalStickers: size * size * 6,
      cornersSolved,
      cornersTotal: 8,
      edgesSolved,
      edgesTotal: edges.length,
      piecesSolved: cornersSolved + edgesSolved,
      piecesTotal: corners.length + edges.length,
      solidFaces,
      isSolved: model.isSolved(state),
      isSolid: solidFaces === 6,
    };
  }

  function validate(state) {
    const errors = [];
    const checks = [];
    const counts = new Array(FACES.length).fill(0);
    for (let i = 0; i < state.length; i += 1) counts[state[i]] += 1;

    const wrongCounts = [];
    for (let color = 0; color < FACES.length; color += 1) {
      if (counts[color] !== size * size) {
        wrongCounts.push(`${COLOR_LABEL[FACE_BY_INDEX[color]]} ${counts[color]}/${size * size}`);
      }
    }
    if (wrongCounts.length) {
      errors.push(`Every color needs ${size * size} stickers (${wrongCounts.join(', ')}).`);
    }
    checks.push({
      id: 'counts',
      label: 'Sticker counts',
      status: wrongCounts.length ? 'error' : 'ok',
      detail: wrongCounts.length ? wrongCounts.join(' · ') : `${size * size} of each color`,
    });

    if (size === 3) {
      const badCenters = centers.filter((piece) => FACE_BY_INDEX[state[piece.indices[0]]] !== piece.faces[0]);
      if (badCenters.length) errors.push('The six centers must stay on their own faces.');
      checks.push({
        id: 'centers',
        label: 'Centers',
        status: badCenters.length ? 'error' : 'ok',
        detail: badCenters.length ? `${badCenters.length} center(s) recolored` : 'Six centered colors intact',
      });
    } else {
      checks.push({
        id: 'centers',
        label: 'Centers',
        status: 'na',
        detail: 'A 2×2 has no fixed centers — each face can land anywhere',
      });
    }

    let twist = 0;
    let flip = 0;
    let badPieces = 0;
    const cornerPerm = [];
    const edgePerm = [];
    const seenCorners = new Set();
    const seenEdges = new Set();
    let twistedPieces = 0;

    for (let i = 0; i < corners.length; i += 1) {
      const piece = corners[i];
      const colors = piece.indices.map((index) => FACE_BY_INDEX[state[index]]);
      const home = cornerHome.get([...colors].sort().join(''));
      if (home === undefined) {
        errors.push(`A corner has impossible colors (${prettyName(colors)}).`);
        badPieces += 1;
        continue;
      }
      if (seenCorners.has(home)) {
        errors.push(`The ${prettyName(colors)} corner appears twice.`);
        badPieces += 1;
      }
      seenCorners.add(home);
      cornerPerm[i] = home;
      const twistValue = colors.findIndex((color) => isUD(color));
      twist += twistValue;
      if (twistValue !== 0) twistedPieces += 1;
    }

    for (let i = 0; i < edges.length; i += 1) {
      const piece = edges[i];
      const colors = piece.indices.map((index) => FACE_BY_INDEX[state[index]]);
      const home = edgeHome.get([...colors].sort().join(''));
      if (home === undefined) {
        errors.push(`An edge has impossible colors (${prettyName(colors)}).`);
        badPieces += 1;
        continue;
      }
      if (seenEdges.has(home)) {
        errors.push(`The ${prettyName(colors)} edge appears twice.`);
        badPieces += 1;
      }
      seenEdges.add(home);
      edgePerm[i] = home;
      const refColor = colors.find((color) => isUD(color)) || colors.find((color) => isFB(color));
      flip += piece.faces[colors.indexOf(refColor)] === piece.refFace ? 0 : 1;
    }

    const pieceSummary = badPieces
      ? `${badPieces} impossible or repeated piece${badPieces === 1 ? '' : 's'}`
      : size === 2
        ? 'Eight legal corners, each once'
        : 'Eight corners and twelve edges, each once';
    checks.push({
      id: 'pieces',
      label: 'Pieces',
      status: badPieces ? 'error' : 'ok',
      detail: pieceSummary,
    });

    if (badPieces === 0) {
      if (twist % 3 !== 0) {
        errors.push('A corner is twisted — this position cannot exist on a real cube.');
      }
      checks.push({
        id: 'twist',
        label: 'Corner twist',
        status: twist % 3 === 0 ? 'ok' : 'error',
        detail: twist % 3 === 0
          ? twistedPieces ? `${twistedPieces} corners turned — total balances` : 'All corners aligned'
          : 'Twist total does not divide by three',
      });

      if (size === 3) {
        if (flip % 2 !== 0) {
          errors.push('An edge is flipped — this position cannot exist on a real cube.');
        }
        checks.push({
          id: 'flip',
          label: 'Edge flips',
          status: flip % 2 === 0 ? 'ok' : 'error',
          detail: flip % 2 === 0 ? `${flip} flipped, even total` : 'Odd number of flipped edges',
        });
        const sameParity = parity(cornerPerm) === parity(edgePerm);
        if (!sameParity) errors.push('Two pieces are swapped — this position cannot exist on a real cube.');
        checks.push({
          id: 'parity',
          label: 'Permutation parity',
          status: sameParity ? 'ok' : 'error',
          detail: sameParity ? 'Corner and edge parity match' : 'Corner and edge parity differ',
        });
      }
    } else {
      checks.push({
        id: 'twist',
        label: 'Corner twist',
        status: 'na',
        detail: 'Needs legal pieces first',
      });
      if (size === 3) {
        checks.push({ id: 'flip', label: 'Edge flips', status: 'na', detail: 'Needs legal pieces first' });
        checks.push({ id: 'parity', label: 'Permutation parity', status: 'na', detail: 'Needs legal pieces first' });
      }
    }

    return { ok: errors.length === 0, errors, checks, stats: statsOf(state) };
  }

  function codeOf(state) {
    let code = '';
    for (const face of FACES) {
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          code += FACE_BY_INDEX[state[model.gridIndex(face, row, col)]];
        }
      }
    }
    return code;
  }

  function fromCode(text) {
    const code = String(text || '').toUpperCase().replace(/\s+/g, '');
    const expected = size * size * 6;
    const bad = [...new Set([...code].filter((ch) => FACE_INDEX[ch] === undefined))];
    if (bad.length) {
      return {
        ok: false,
        error: `Invalid character${bad.length === 1 ? '' : 's'} ${bad.join(' ')} — stick to U R F D L B.`,
      };
    }
    if (code.length !== expected) {
      return { ok: false, error: `Expected ${expected} letters (U R F D L B), got ${code.length}.` };
    }
    const order = [];
    for (const face of FACES) {
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) order.push(model.gridIndex(face, row, col));
      }
    }
    const state = new Uint8Array(model.SLOTS.length);
    order.forEach((index, i) => { state[index] = FACE_INDEX[code[i]]; });
    return { ok: true, state };
  }

  function pieceAt(index, state) {
    const piece = pieceBySticker[index];
    if (!piece) return null;
    const colors = piece.indices.map((i) => FACE_BY_INDEX[state[i]]);
    const currentKey = [...colors].sort().join('');
    const correctPiece = currentKey === piece.homeKey;
    const solved = piece.indices.every((i, k) => FACE_BY_INDEX[state[i]] === piece.faces[k]);
    return {
      kind: piece.kind,
      faces: piece.faces,
      indices: piece.indices,
      colors,
      currentName: prettyName(colors),
      homeName: prettyName(piece.faces),
      correctPiece,
      solved,
    };
  }

  // Exact difficulty when the solve plan is known; otherwise a sticker-ratio guess.
  function difficultyOf(stats, moveCount = null) {
    if (stats.isSolved) return { label: 'Solved', tone: 'solved' };
    if (stats.isSolid) return { label: 'Rotated-solved', tone: 'solved' };
    if (Number.isInteger(moveCount) && moveCount > 0) {
      if (moveCount === 1) return { label: 'One turn away', tone: 'easy' };
      if (moveCount <= 5) return { label: 'Easy', tone: 'easy' };
      if (moveCount <= 11) return { label: 'Medium', tone: 'medium' };
      return { label: 'Hard', tone: 'hard' };
    }
    const ratio = stats.misplacedStickers / stats.totalStickers;
    if (ratio <= 0.3) return { label: 'Easy', tone: 'easy' };
    if (ratio <= 0.55) return { label: 'Medium', tone: 'medium' };
    return { label: 'Hard', tone: 'hard' };
  }

  return {
    size,
    model,
    corners,
    edges,
    centers,
    validate,
    statsOf,
    codeOf,
    fromCode,
    pieceAt,
    difficultyOf,
  };
}

// Standard unfolded net: U above F, D below F; L F R B in a row.
export const NET_LAYOUT = [
  { face: 'U', column: 2, row: 1 },
  { face: 'L', column: 1, row: 2 },
  { face: 'F', column: 2, row: 2 },
  { face: 'R', column: 3, row: 2 },
  { face: 'B', column: 4, row: 2 },
  { face: 'D', column: 2, row: 3 },
];

export const PUZZLES = {
  2: createPuzzle(2),
  3: createPuzzle(3),
};

export function puzzleFor(size) {
  return PUZZLES[size];
}

export function applyStateToCube(cube, state) {
  const puzzle = puzzleFor(cube.size);
  for (const cubie of cube.cubies) {
    const stickers = {};
    for (const face of Object.keys(cubie.stickers)) {
      stickers[face] = FACE_BY_INDEX[state[puzzle.model.idx(cubie.pos, face)]];
    }
    cubie.stickers = stickers;
  }
  return cube;
}
