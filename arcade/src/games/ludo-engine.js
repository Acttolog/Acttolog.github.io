// Ludo Himalaya — pure rules engine. No DOM, no randomness except the CPU AI.
// Board: 15×15 grid. The outer ring holds 52 squares; four 6×6 yards sit in the
// corners. Each token walks 51 ring squares, then 5 coloured home squares, then
// the centre (progress 56). A player's start is 13 ring squares after the last.

export const VERSION = 1;
export const COLORS = ['red', 'green', 'yellow', 'blue'];
export const PATH_STEPS = 56;
export const RING_LEN = 52;

export const META = {
  red: { name: 'Red', ne: 'लाल', hex: '#c0443b', light: '#e46a5f', dark: '#76231d' },
  green: { name: 'Green', ne: 'हरियो', hex: '#2f8151', light: '#5cae77', dark: '#174a2c' },
  yellow: { name: 'Yellow', ne: 'पहेँलो', hex: '#c8992c', light: '#efc962', dark: '#7d5c12' },
  blue: { name: 'Blue', ne: 'निलो', hex: '#2f62a8', light: '#5f92d8', dark: '#173a69' },
};

// Clockwise ring, starting at red's first square (1,6). [col, row]
export const RING = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];

export const START = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE_RINGS = [0, 8, 13, 21, 26, 34, 39, 47];
export const CENTER = [7, 7];

export const HOME_COL = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

export const HOME_QUADRANT = {
  red: [0, 0],
  green: [9, 0],
  yellow: [9, 9],
  blue: [0, 9],
};

// Token parking spots inside each yard, in board units (15 = full board).
export const BASE_SLOTS = {
  red: [[2.25, 2.25], [3.75, 2.25], [2.25, 3.75], [3.75, 3.75]],
  green: [[11.25, 2.25], [12.75, 2.25], [11.25, 3.75], [12.75, 3.75]],
  yellow: [[11.25, 11.25], [12.75, 11.25], [11.25, 12.75], [12.75, 12.75]],
  blue: [[2.25, 11.25], [3.75, 11.25], [2.25, 12.75], [3.75, 12.75]],
};

// Finished tokens sit inside their colour's centre triangle.
export const FINISH_SLOTS = {
  red: [[6.52, 6.92], [6.52, 7.31], [6.52, 7.7], [6.52, 8.09]],
  green: [[6.92, 6.52], [7.31, 6.52], [7.7, 6.52], [8.09, 6.52]],
  yellow: [[8.48, 6.92], [8.48, 7.31], [8.48, 7.7], [8.48, 8.09]],
  blue: [[6.92, 8.48], [7.31, 8.48], [7.7, 8.48], [8.09, 8.48]],
};

export const DEFAULT_OPTIONS = {
  blockades: false,
  threeSixes: true,
  autoSelect: true,
};

export const PLAYER_SETS = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: COLORS,
};

export const mod = (n, m) => ((n % m) + m) % m;

export function ringIndex(color, progress) {
  return mod(START[color] + progress, RING_LEN);
}

export function cellAt(color, progress) {
  if (progress < 0) return null;
  if (progress <= 50) return RING[ringIndex(color, progress)];
  if (progress <= 55) return HOME_COL[color][progress - 51];
  return CENTER;
}

/** Board-unit coordinates (0..15) for a token, including a parking or centre slot. */
export function xyAt(color, progress, tokenIndex = 0) {
  if (progress < 0) return BASE_SLOTS[color][tokenIndex] || BASE_SLOTS[color][0];
  if (progress >= PATH_STEPS) return FINISH_SLOTS[color][tokenIndex] || FINISH_SLOTS[color][0];
  const cell = cellAt(color, progress);
  return [cell[0] + 0.5, cell[1] + 0.5];
}

export function isSafeProgress(color, progress) {
  if (progress >= 51) return true;
  if (progress < 0) return true;
  return SAFE_RINGS.includes(ringIndex(color, progress));
}

export function tokenCount(player) {
  return player.tokens.filter((t) => t >= PATH_STEPS).length;
}

export function progressSum(player) {
  return player.tokens.reduce((sum, t) => sum + (t > 0 ? t : 0), 0);
}

export function createGame(config = {}) {
  const colors = (config.colors && config.colors.length >= 2
    ? config.colors
    : PLAYER_SETS[config.players] || PLAYER_SETS[2]
  ).slice(0, 4);
  const players = colors.map((color, i) => ({
    color,
    type: config.types && config.types[i] === 'cpu' ? 'cpu' : config.types ? 'human' : i === 0 ? 'human' : 'cpu',
    tokens: [-1, -1, -1, -1],
    captures: 0,
  }));
  return {
    v: VERSION,
    players,
    turn: 0,
    dice: null,
    sixes: 0,
    phase: 'rolling',
    winner: null,
    options: { ...DEFAULT_OPTIONS, ...(config.options || {}) },
    rolls: 0,
    startedAt: Date.now(),
  };
}

export function currentPlayer(state) {
  return state.players[state.turn] || null;
}

function playerAt(state, color) {
  return state.players.find((p) => p.color === color) || null;
}

function tokensOnRing(state, color, ring) {
  const player = state.players.find((p) => p.color === color);
  if (!player) return [];
  const out = [];
  player.tokens.forEach((pos, i) => {
    if (pos >= 0 && pos <= 50 && ringIndex(color, pos) === ring) out.push(i);
  });
  return out;
}

function enemyBlockade(state, selfColor, ring) {
  return state.players.some(
    (p) => p.color !== selfColor && tokensOnRing(state, p.color, ring).length >= 2,
  );
}

/** All legal moves for the player whose turn it is, using state.dice. */
export function legalMoves(state) {
  const player = currentPlayer(state);
  if (!player || !state.dice) return [];
  if (state.phase === 'forfeit' || state.phase === 'over') return [];
  const out = [];

  player.tokens.forEach((from, token) => {
    let to;
    if (from < 0) {
      if (state.dice !== 6) return;
      to = 0;
    } else {
      to = from + state.dice;
      if (to > PATH_STEPS || from >= PATH_STEPS) return;
    }

    if (state.options.blockades) {
      const first = from < 0 ? 0 : from + 1;
      const last = Math.min(to, 50);
      for (let step = first; step <= last; step++) {
        if (enemyBlockade(state, player.color, ringIndex(player.color, step))) return;
      }
    }

    let captures = [];
    if (to <= 50 && !SAFE_RINGS.includes(ringIndex(player.color, to))) {
      const destRing = ringIndex(player.color, to);
      for (const rival of state.players) {
        if (rival.color === player.color) continue;
        rival.tokens.forEach((rpos, ri) => {
          if (rpos >= 0 && rpos <= 50 && ringIndex(rival.color, rpos) === destRing) {
            captures.push({ color: rival.color, token: ri, pos: rpos });
          }
        });
      }
    }

    out.push({
      token,
      from,
      to,
      captures,
      finish: to === PATH_STEPS,
      safe: to >= 51 || SAFE_RINGS.includes(ringIndex(player.color, to)),
      ring: to <= 50 ? ringIndex(player.color, to) : null,
    });
  });

  return out;
}

/** Roll the dice for the current player. Returns what the UI should do next. */
export function rollDice(state, value) {
  const rolled = Math.trunc(Number(value));
  if (state.phase !== 'rolling') return { ok: false, error: 'Not ready to roll' };
  if (!(rolled >= 1 && rolled <= 6)) return { ok: false, error: 'Dice must be 1–6' };

  state.dice = rolled;
  state.rolls += 1;
  state.sixes = rolled === 6 ? state.sixes + 1 : 0;

  if (rolled === 6 && state.options.threeSixes && state.sixes >= 3) {
    state.phase = 'forfeit';
    return { ok: true, value: rolled, forfeit: true, moves: [], phase: state.phase };
  }

  const moves = legalMoves(state);
  if (!moves.length) {
    state.phase = 'no-move';
    return { ok: true, value: rolled, forfeit: false, moves, phase: state.phase };
  }

  state.phase = 'choosing';
  return { ok: true, value: rolled, forfeit: false, moves, phase: state.phase };
}

export function endTurn(state) {
  state.turn = (state.turn + 1) % state.players.length;
  state.dice = null;
  state.sixes = 0;
  state.phase = 'rolling';
  return currentPlayer(state);
}

/** Apply a chosen move. The UI animates first, then commits. */
export function commitMove(state, token) {
  if (state.phase !== 'choosing') return { ok: false, error: 'Not choosing a move' };
  const player = currentPlayer(state);
  if (!player) return { ok: false, error: 'No player' };
  const moves = legalMoves(state);
  const move = moves.find((m) => m.token === token);
  if (!move) return { ok: false, error: 'That token cannot move' };

  player.tokens[token] = move.to;
  const captures = move.captures.map((c) => {
    const rival = playerAt(state, c.color);
    if (rival) rival.tokens[c.token] = -1;
    return { color: c.color, token: c.token, pos: c.pos };
  });
  player.captures += captures.length;

  const finished = move.to === PATH_STEPS;
  const won = player.tokens.every((t) => t === PATH_STEPS);
  const extra = state.dice === 6 || captures.length > 0 || finished;
  const wasSix = state.dice === 6;

  let nextTurn = player;
  if (won) {
    state.phase = 'over';
    state.winner = player.color;
    state.dice = null;
  } else if (extra) {
    if (!wasSix) state.sixes = 0;
    state.phase = 'rolling';
    state.dice = null;
  } else {
    state.dice = null;
    state.sixes = 0;
    nextTurn = endTurn(state);
  }

  return {
    ok: true,
    player: player.color,
    token,
    from: move.from,
    to: move.to,
    captures,
    finished,
    won,
    extra: !won && extra,
    nextTurn: nextTurn ? nextTurn.color : null,
    phase: state.phase,
  };
}

/** Forfeit the current roll (three sixes, or no legal move). */
export function passTurn(state) {
  return endTurn(state);
}

function threatsAt(state, selfColor, move) {
  if (move.to >= 51 || move.safe) return 0;
  const dest = move.ring;
  let n = 0;
  for (const rival of state.players) {
    if (rival.color === selfColor) continue;
    rival.tokens.forEach((pos) => {
      if (pos < 0 || pos > 50) return;
      const behind = mod(dest - ringIndex(rival.color, pos), RING_LEN);
      if (behind >= 1 && behind <= 6) n += 1;
    });
  }
  return n;
}

/** Pick a move for the computer. `easy` plays loosely; `sharp` plays the odds. */
export function cpuPickMove(state, moves = legalMoves(state), difficulty = 'sharp', rand = Math.random) {
  if (!moves.length) return null;
  if (difficulty === 'easy' && rand() < 0.62) {
    return moves[Math.floor(rand() * moves.length)];
  }
  const player = currentPlayer(state);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    let score = move.to * 2.2;
    if (move.from < 0) score += state.dice === 6 ? 130 : 0;
    if (move.captures.length) {
      score += 760 + Math.max(...move.captures.map((c) => c.pos)) * 5;
    }
    if (move.finish) score += 1200;
    if (move.to >= 51) score += 140 + (move.to - 51) * 12;
    if (move.safe && move.to <= 50) score += 80;
    if (move.to <= 50 && player.tokens.some((t) => t === move.to)) score += 40;
    if (move.from >= 0 && move.from <= 50 && !move.safe && move.to <= 50) {
      score -= 6;
    }
    score -= threatsAt(state, player.color, move) * Math.min(72, 18 + move.to * 1.4);
    score += rand() * 6;
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}

export function standings(state) {
  return state.players
    .map((p, index) => ({
      color: p.color,
      index,
      home: tokenCount(p),
      progress: progressSum(p),
      captures: p.captures || 0,
      isWinner: p.color === state.winner,
    }))
    .sort((a, b) => Number(b.isWinner) - Number(a.isWinner) || b.home - a.home || b.progress - a.progress || b.captures - a.captures);
}

export function isValidGame(g) {
  return Boolean(
    g
      && g.v === VERSION
      && Array.isArray(g.players)
      && g.players.length >= 2
      && g.players.length <= 4
      && g.players.every((p) => META[p.color]
        && (p.type === 'human' || p.type === 'cpu')
        && Array.isArray(p.tokens)
        && p.tokens.length === 4
        && p.tokens.every((t) => Number.isInteger(t) && t >= -1 && t <= PATH_STEPS))
      && ['rolling', 'choosing', 'no-move', 'forfeit', 'over'].includes(g.phase)
      && Number.isInteger(g.turn)
      && g.turn >= 0
      && g.turn < g.players.length,
  );
}
