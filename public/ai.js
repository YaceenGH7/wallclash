// Heuristic AI for Wall Clash. It evaluates board positions by the difference
// between each player's shortest route to their goal, then optionally searches
// one reply ahead for the harder difficulties.

import {
  applyMove,
  cloneGame,
  legalMoves,
  shortestPath,
  wallFits,
  WALL_SLOTS,
} from './engine.js';

const WIN = 1_000_000;
const DIRS = ['h', 'v'];

function evaluate(state, me) {
  if (state.status === 'finished') return state.winner === me ? WIN : -WIN;
  const mine = shortestPath(state, me);
  const theirs = shortestPath(state, 1 - me);
  if (mine < 0) return -WIN + 1;
  if (theirs < 0) return WIN - 1;
  const wallEconomy = (state.wallsLeft[me] - state.wallsLeft[1 - me]) * 2;
  return (theirs - mine) * 100 + wallEconomy;
}

function simulateWall(state, wall, me) {
  const next = cloneGame(state);
  next.walls.push({ ...wall, player: me });
  next.wallsLeft[me] -= 1;
  next.turn = 1 - me;
  next.moveCount += 1;
  next.lastMove = { type: 'wall', player: me, wall: { ...wall } };
  return next;
}

function collectCandidates(state, me) {
  const candidates = [];
  const beforeMine = shortestPath(state, me);
  const beforeTheirs = shortestPath(state, 1 - me);
  const wallEconomy = (state.wallsLeft[me] - state.wallsLeft[1 - me]) * 2;

  for (const to of legalMoves(state, me)) {
    const result = applyMove(state, to, me);
    if (!result.ok) continue;
    let score;
    if (result.state.status === 'finished') {
      score = result.state.winner === me ? WIN : -WIN;
    } else {
      const mine = shortestPath(result.state, me);
      const theirs = shortestPath(result.state, 1 - me);
      score = (theirs - mine) * 100 + wallEconomy;
      const pos = result.state.positions[me];
      score += (4 - Math.abs(pos.x - 4)) * 0.4;
    }
    candidates.push({ action: { type: 'move', to }, result, score, kind: 'move' });
  }

  if (state.wallsLeft[me] > 0) {
    for (let y = 0; y < WALL_SLOTS; y++) {
      for (let x = 0; x < WALL_SLOTS; x++) {
        for (const o of DIRS) {
          const wall = { x, y, o };
          if (!wallFits(state.walls, x, y, o)) continue;
          const mine = shortestPath(state, me, [wall]);
          const theirs = shortestPath(state, 1 - me, [wall]);
          if (mine < 0 || theirs < 0) continue;

          const oppGain = theirs - beforeTheirs;
          const selfLoss = mine - beforeMine;
          if (selfLoss > 2) continue; // never build your own maze

          let score = (theirs - mine) * 100 + wallEconomy - 2;
          score -= 55; // tempo cost: only worthwhile walls should win out
          if (oppGain >= 3) score += (oppGain - 2) * 9;
          if (oppGain <= 0) score -= 30;
          if (selfLoss > 0) score -= 22 * selfLoss;

          const next = simulateWall(state, wall, me);
          candidates.push({ action: { type: 'wall', ...wall }, result: { ok: true, state: next }, score, kind: 'wall' });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function pickNoisy(candidates, noise, top) {
  const shortlist = candidates.slice(0, Math.max(1, Math.min(top, candidates.length)));
  let best = null;
  for (const candidate of shortlist) {
    const value = candidate.score + (Math.random() * 2 - 1) * noise;
    if (!best || value > best.value) best = { ...candidate, value };
  }
  return best || null;
}

function searchTwoPly(state, me) {
  const mine = collectCandidates(state, me).slice(0, 12);
  if (!mine.length) return null;

  let best = null;
  for (const candidate of mine) {
    let value;
    if (candidate.result.state.status === 'finished') {
      value = candidate.result.state.winner === me ? WIN : -WIN;
    } else {
      const replies = collectCandidates(candidate.result.state, 1 - me).slice(0, 16);
      let worst = -Infinity;
      for (const reply of replies) {
        let replyValue;
        if (reply.result.state.status === 'finished') {
          replyValue = reply.result.state.winner === 1 - me ? WIN : -WIN;
        } else {
          replyValue = evaluate(reply.result.state, 1 - me);
        }
        worst = Math.max(worst, replyValue);
      }
      value = -worst;
    }
    value += Math.random() * 6;
    if (!best || value > best.value) best = { ...candidate, value };
  }
  return best;
}

export function chooseAction(state, difficulty = 'medium') {
  if (state.status !== 'playing') return null;
  const me = state.turn;

  if (difficulty === 'easy') {
    const candidates = collectCandidates(state, me);
    if (!candidates.length) return null;
    if (Math.random() < 0.18) {
      return candidates[Math.floor(Math.random() * Math.min(7, candidates.length))].action;
    }
    const pick = pickNoisy(candidates, 170, 7);
    return pick ? pick.action : null;
  }

  if (difficulty === 'hard') {
    const candidates = collectCandidates(state, me);
    const winning = candidates.find(
      (c) => c.result.state.status === 'finished' && c.result.state.winner === me,
    );
    if (winning) return winning.action;
    const pick = searchTwoPly(state, me);
    return pick ? pick.action : null;
  }

  const candidates = collectCandidates(state, me);
  const winning = candidates.find(
    (c) => c.result.state.status === 'finished' && c.result.state.winner === me,
  );
  if (winning) return winning.action;
  const pick = pickNoisy(candidates, 14, 6);
  return pick ? pick.action : null;
}

export { evaluate };
