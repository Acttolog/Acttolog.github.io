// Public 2x2 solving API. Tables are built once, lazily, and reused.

import { FACES } from './cube-engine.js';
import * as model2 from './facelet2.js';
import {
  buildTwoPhaseTables, cornerStateFromFacelet, isCornerSolved, solveTwoPhase,
} from './solver2-core.js';

let tables = null;

export function prepareSolver2() {
  if (!tables) tables = buildTwoPhaseTables();
  return tables;
}

export function planSolve2(cube) {
  prepareSolver2();
  const state = model2.fromCube(cube);
  const { cp, co } = cornerStateFromFacelet(state);
  if (isCornerSolved(cp, co)) return { state, moves: [], boundary: 0, phases: [] };
  const { moves, boundary } = solveTwoPhase(cp, co, tables);
  let check = state;
  for (const move of moves) check = model2.applyMove(check, move);
  if (!model2.isSolved(check)) throw new Error('2x2 solver produced an unverified solution');
  return { state, moves, boundary, phases: phaseTags(moves, boundary) };
}

export function solve2(cube) {
  return planSolve2(cube).phases;
}

export function phaseTags(moves, boundary) {
  return moves.map((move, index) => ({
    move,
    phase: index < boundary ? 'Orient' : 'Permute',
  }));
}

// A 2x2 has no fixed centers: solid faces count as solved even when the whole
// cube is rotated. Used for status/celebration checks.
export function isSolid2(state) {
  const size = 2;
  for (const face of FACES) {
    const first = state[model2.gridIndex(face, 0, 0)];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (state[model2.gridIndex(face, row, col)] !== first) return false;
      }
    }
  }
  return true;
}
