// Wall Clash game engine — shared by the browser client and the Node server.
// Rules: 9x9 grid, one pawn (ball) per player, 7 walls each by default.
// On a turn a player either moves the pawn one cell (orthogonally) or places
// a two-cell wall. Walls may not overlap, cross at the same centre point, or
// leave any player without a route to their goal.

export const SIZE = 9;
export const WALL_SLOTS = SIZE - 1;
export const DEFAULT_WALLS = 7;
export const DEFAULT_TIME = 3 * 60 * 1000; // 3:00 per player
export const CENTER = 4;

export const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export const PERPENDICULARS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
];

export const AI_NAMES = ['Nova', 'Kiara', 'Zara', 'Milo', 'Aria', 'Theo', 'Luna', 'Finn'];

const key = (x, y) => x + ',' + y;

export function createGame(options = {}) {
  const {
    mode = 'classic',
    wallsPerPlayer = DEFAULT_WALLS,
    timeMs = DEFAULT_TIME,
    names = ['Player 1', 'Player 2'],
    avatars = [0, 1],
  } = options;

  return {
    mode,
    size: SIZE,
    wallsPerPlayer,
    positions: [
      { x: CENTER, y: SIZE - 1 },
      { x: CENTER, y: 0 },
    ],
    wallsLeft: [wallsPerPlayer, wallsPerPlayer],
    timeLeft: [timeMs, timeMs],
    turn: 0,
    walls: [],
    status: 'playing',
    winner: null,
    winReason: null,
    moveCount: 0,
    lastMove: null,
    names: [names[0] || 'Player 1', names[1] || 'Player 2'],
    avatars: [avatars[0] ?? 0, avatars[1] ?? 1],
  };
}

export function cloneGame(state) {
  return {
    ...state,
    positions: state.positions.map((p) => ({ ...p })),
    wallsLeft: [...state.wallsLeft],
    timeLeft: [...state.timeLeft],
    walls: state.walls.map((w) => ({ ...w })),
    lastMove: state.lastMove ? JSON.parse(JSON.stringify(state.lastMove)) : null,
    names: [...state.names],
    avatars: [...state.avatars],
  };
}

export function buildWallMap(walls) {
  const h = new Set();
  const v = new Set();
  for (const wall of walls) {
    if (wall.o === 'h') h.add(key(wall.x, wall.y));
    else v.add(key(wall.x, wall.y));
  }
  return { h, v };
}

export function inBounds(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

export function goalFor(state, player) {
  if (state.mode === 'star') return { x: CENTER, y: CENTER };
  return player === 0 ? { x: -1, y: 0 } : { x: -1, y: SIZE - 1 };
}

function isGoal(state, player, x, y) {
  if (state.mode === 'star') return x === CENTER && y === CENTER;
  return player === 0 ? y === 0 : y === SIZE - 1;
}

// Is the step from (x1,y1) to an adjacent (x2,y2) open?
// A wall at (wx, wy) covers two cells, so either of the two wall slots
// alongside the crossed edge may block the step.
export function edgeOpen(spots, x1, y1, x2, y2) {
  if (y2 === y1 - 1) {
    return !spots.h.has(key(x1, y1 - 1)) && !spots.h.has(key(x1 - 1, y1 - 1));
  }
  if (y2 === y1 + 1) {
    return !spots.h.has(key(x1, y1)) && !spots.h.has(key(x1 - 1, y1));
  }
  if (x2 === x1 - 1) {
    return !spots.v.has(key(x1 - 1, y1)) && !spots.v.has(key(x1 - 1, y1 - 1));
  }
  if (x2 === x1 + 1) {
    return !spots.v.has(key(x1, y1)) && !spots.v.has(key(x1, y1 - 1));
  }
  return false;
}

export function wallFits(walls, x, y, o) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= WALL_SLOTS || y < 0 || y >= WALL_SLOTS) return false;
  if (o !== 'h' && o !== 'v') return false;

  for (const w of walls) {
    if (w.o === o) {
      // Same orientation: share any part of the two-cell groove.
      if (o === 'h' && w.y === y && Math.abs(w.x - x) <= 1) return false;
      if (o === 'v' && w.x === x && Math.abs(w.y - y) <= 1) return false;
    } else {
      // Perpendicular walls cross only when they share the same centre post.
      if (w.x === x && w.y === y) return false;
    }
  }
  return true;
}

export function shortestPath(state, player, extraWalls = null) {
  const walls = extraWalls ? state.walls.concat(extraWalls) : state.walls;
  const spots = buildWallMap(walls);
  const start = state.positions[player];
  if (isGoal(state, player, start.x, start.y)) return 0;

  const seen = new Uint8Array(SIZE * SIZE);
  const queue = new Int16Array(SIZE * SIZE * 2);
  let head = 0;
  let tail = 0;
  const startIndex = start.y * SIZE + start.x;
  seen[startIndex] = 1;
  queue[tail++] = start.x;
  queue[tail++] = start.y;

  while (head < tail) {
    const cx = queue[head++];
    const cy = queue[head++];
    const dist = seen[cy * SIZE + cx];
    for (const d of DIRECTIONS) {
      const nx = cx + d.dx;
      const ny = cy + d.dy;
      if (!inBounds(nx, ny)) continue;
      if (!edgeOpen(spots, cx, cy, nx, ny)) continue;
      const index = ny * SIZE + nx;
      if (seen[index]) continue;
      seen[index] = dist + 1;
      if (isGoal(state, player, nx, ny)) return dist;
      queue[tail++] = nx;
      queue[tail++] = ny;
    }
  }
  return -1;
}

export function canPlaceWall(state, x, y, o, player = state.turn) {
  if (state.status !== 'playing') return false;
  if (state.wallsLeft[player] <= 0) return false;
  if (!wallFits(state.walls, x, y, o)) return false;

  const wall = { x, y, o };
  const walls = state.walls.concat([wall]);
  const spots = buildWallMap(walls);

  for (let p = 0; p < 2; p++) {
    let reachable = false;
    // Inline BFS so both players are checked against the same wall map.
    const start = state.positions[p];
    const seen = new Uint8Array(SIZE * SIZE);
    const queue = [];
    const startIndex = start.y * SIZE + start.x;
    seen[startIndex] = 1;
    queue.push(start.x, start.y);
    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++];
      const cy = queue[head++];
      for (const d of DIRECTIONS) {
        const nx = cx + d.dx;
        const ny = cy + d.dy;
        if (!inBounds(nx, ny)) continue;
        if (!edgeOpen(spots, cx, cy, nx, ny)) continue;
        const index = ny * SIZE + nx;
        if (seen[index]) continue;
        seen[index] = 1;
        if (isGoal(state, p, nx, ny)) {
          reachable = true;
          break;
        }
        queue.push(nx, ny);
      }
      if (reachable) break;
    }
    if (!reachable) return false;
  }
  return true;
}

export function legalMoves(state, player = state.turn) {
  if (state.status !== 'playing') return [];
  if (player !== state.turn) return [];

  const me = state.positions[player];
  const opp = state.positions[1 - player];
  const spots = buildWallMap(state.walls);
  const moves = [];

  for (const d of DIRECTIONS) {
    const nx = me.x + d.dx;
    const ny = me.y + d.dy;
    if (!inBounds(nx, ny)) continue;
    if (!edgeOpen(spots, me.x, me.y, nx, ny)) continue;

    if (nx !== opp.x || ny !== opp.y) {
      moves.push({ x: nx, y: ny });
      continue;
    }

    // Adjacent to the opponent: jump straight if possible.
    const jx = opp.x + d.dx;
    const jy = opp.y + d.dy;
    if (
      inBounds(jx, jy) &&
      (jx !== me.x || jy !== me.y) &&
      edgeOpen(spots, opp.x, opp.y, jx, jy)
    ) {
      moves.push({ x: jx, y: jy });
      continue;
    }

    // Otherwise diagonal jumps around the opponent are allowed when the
    // two-step path around is open.
    for (const p of PERPENDICULARS) {
      const sideX = me.x + p.dx;
      const sideY = me.y + p.dy;
      const targetX = opp.x + p.dx;
      const targetY = opp.y + p.dy;
      if (!inBounds(sideX, sideY) || !inBounds(targetX, targetY)) continue;
      if (targetX === me.x && targetY === me.y) continue;
      if (!edgeOpen(spots, me.x, me.y, sideX, sideY)) continue;
      if (!edgeOpen(spots, sideX, sideY, targetX, targetY)) continue;
      if (!moves.some((m) => m.x === targetX && m.y === targetY)) {
        moves.push({ x: targetX, y: targetY });
      }
    }
  }

  return moves;
}

export function legalWalls(state, player = state.turn) {
  if (state.status !== 'playing') return [];
  if (player !== state.turn) return [];
  if (state.wallsLeft[player] <= 0) return [];
  const result = [];
  for (let y = 0; y < WALL_SLOTS; y++) {
    for (let x = 0; x < WALL_SLOTS; x++) {
      if (canPlaceWall(state, x, y, 'h', player)) result.push({ x, y, o: 'h' });
      if (canPlaceWall(state, x, y, 'v', player)) result.push({ x, y, o: 'v' });
    }
  }
  return result;
}

export function applyMove(state, to, player = state.turn) {
  if (state.status !== 'playing') return { ok: false, error: 'Game is over.' };
  if (player !== state.turn) return { ok: false, error: 'Not your turn.' };
  if (!Number.isInteger(to?.x) || !Number.isInteger(to?.y)) {
    return { ok: false, error: 'Invalid move.' };
  }
  const legal = legalMoves(state, player);
  if (!legal.some((m) => m.x === to.x && m.y === to.y)) {
    return { ok: false, error: 'That move is not allowed.' };
  }

  const next = cloneGame(state);
  const from = { ...next.positions[player] };
  next.positions[player] = { x: to.x, y: to.y };
  next.lastMove = { type: 'move', player, from, to: { ...to } };
  next.moveCount += 1;

  if (isGoal(next, player, to.x, to.y)) {
    next.status = 'finished';
    next.winner = player;
    next.winReason = 'goal';
  } else {
    next.turn = 1 - player;
  }
  return { ok: true, state: next };
}

export function applyWall(state, x, y, o, player = state.turn) {
  if (state.status !== 'playing') return { ok: false, error: 'Game is over.' };
  if (player !== state.turn) return { ok: false, error: 'Not your turn.' };
  if (!canPlaceWall(state, x, y, o, player)) {
    return { ok: false, error: 'That wall cannot be placed there.' };
  }

  const next = cloneGame(state);
  next.walls.push({ x, y, o, player });
  next.wallsLeft[player] -= 1;
  next.lastMove = { type: 'wall', player, wall: { x, y, o } };
  next.moveCount += 1;
  next.turn = 1 - player;
  return { ok: true, state: next };
}

export function applyAction(state, action) {
  if (!action) return { ok: false, error: 'Missing action.' };
  if (action.type === 'move') return applyMove(state, action.to);
  if (action.type === 'wall') return applyWall(state, action.x, action.y, action.o);
  return { ok: false, error: 'Unknown action.' };
}

export function finishByTimeout(state, player) {
  const next = cloneGame(state);
  next.status = 'finished';
  next.winner = 1 - player;
  next.winReason = 'timeout';
  return next;
}

export function finishByResign(state, player) {
  const next = cloneGame(state);
  next.status = 'finished';
  next.winner = 1 - player;
  next.winReason = 'resign';
  return next;
}

// For the HUD: distance for each player to their own goal.
export function distances(state) {
  return [shortestPath(state, 0), shortestPath(state, 1)];
}
