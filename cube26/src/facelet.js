// 3x3 facelet model (54 stickers), exposed as named exports.

import { createFaceletModel, FACE_INDEX, FACE_BY_INDEX } from './facelet-model.js';

export { FACE_INDEX, FACE_BY_INDEX };

const model = createFaceletModel(3);

export const SIZE = 3;
export const SLOTS = model.SLOTS;
export const SLOT_INDEX = model.SLOT_INDEX;
export const SOLVED = model.SOLVED;
export const MOVE_PERM = model.MOVE_PERM;
export const MOVE_TOKENS = model.MOVE_TOKENS;
export const idx = model.idx;
export const applyMove = model.applyMove;
export const applyMoves = model.applyMoves;
export const fromCube = model.fromCube;
export const faceletIndices = model.faceletIndices;
export const pieceIndices = model.pieceIndices;
export const isPieceSolved = model.isPieceSolved;
export const isFaceSolved = model.isFaceSolved;
export const isSolved = model.isSolved;
export const keyOf = model.keyOf;
export const netPos = model.netPos;
export const gridIndex = model.gridIndex;

export function toUint8Colors(state) {
  return state;
}

export const COLOR_NAME = ['U', 'R', 'F', 'D', 'L', 'B'];
