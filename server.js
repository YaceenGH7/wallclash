import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import {
  applyMove,
  applyWall,
  createGame,
  finishByTimeout,
  DEFAULT_TIME,
} from './public/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// ---------- static files ----------
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.resolve(PUBLIC_DIR, '.' + pathname);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const revalidate = ext === '.html' || ext === '.js' || ext === '.css';
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch {
    res.writeHead(400);
    res.end('Bad request');
  }
});

// ---------- rooms ----------
const rooms = new Map();
const queue = []; // { ws, name, mode, avatar }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return 'W' + Date.now().toString(36).slice(-3).toUpperCase();
}

function cleanName(name, fallback = 'Player') {
  if (typeof name !== 'string') return fallback;
  const cleaned = name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 14);
  return cleaned || fallback;
}

function cleanAvatar(value, fallback = 0) {
  const index = Number(value);
  return Number.isInteger(index) ? ((index % 8) + 8) % 8 : fallback;
}

function send(ws, message) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {
    /* ignore */
  }
}

function broadcast(room, message, except = null) {
  for (const player of room.players) {
    if (player && player.ws !== except) send(player.ws, message);
  }
}

function publicGame(room) {
  return {
    game: room.game,
    turnStartedAt: room.turnStartedAt,
    serverNow: Date.now(),
  };
}

function sendState(room) {
  broadcast(room, { type: 'state', ...publicGame(room) });
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function finishGame(room, game, reason) {
  room.game = game;
  game.winReason = reason || game.winReason;
  clearRoomTimer(room);
  sendState(room);
}

function startGame(room) {
  room.game = createGame({
    mode: room.mode,
    names: [room.players[0].name, room.players[1].name],
    avatars: [room.players[0].avatar, room.players[1].avatar],
    timeMs: DEFAULT_TIME,
  });
  room.turnStartedAt = Date.now();
  room.rematch = [false, false];
  clearRoomTimer(room);
  room.timer = setInterval(() => tick(room), 500);

  room.players.forEach((player, slot) => {
    send(player.ws, {
      type: 'start',
      you: slot,
      code: room.code,
      mode: room.mode,
      ...publicGame(room),
    });
  });
}

function tick(room) {
  if (!room.game || room.game.status !== 'playing') {
    clearRoomTimer(room);
    return;
  }
  const now = Date.now();
  const times = [room.game.timeLeft[0], room.game.timeLeft[1]];
  const active = room.game.turn;
  times[active] = Math.max(0, times[active] - (now - room.turnStartedAt));

  if (times[active] <= 0) {
    const game = finishByTimeout(room.game, active);
    finishGame(room, game, 'timeout');
    return;
  }

  broadcast(room, { type: 'tick', times, turn: active, serverNow: now });
}

function joinRoom(ws, room, name, avatar = 0) {
  const slot = room.players.length;
  room.players.push({
    ws,
    name: cleanName(name, slot === 0 ? 'Host' : 'Guest'),
    avatar: cleanAvatar(avatar, slot % 8),
    slot,
  });
  ws.meta = { room: room.code, slot };
  room.lastActive = Date.now();

  if (slot === 0) {
    send(ws, { type: 'waiting', code: room.code, mode: room.mode });
  } else {
    startGame(room);
  }
}

function leaveRoom(ws, reason = 'left') {
  // A player can leave while still in the quick-match queue. Remove that entry
  // before the room early-return so a cancelled search never ghosts a match.
  const queuedIndex = queue.findIndex((entry) => entry.ws === ws);
  if (queuedIndex >= 0) queue.splice(queuedIndex, 1);

  const meta = ws.meta;
  if (!meta || !meta.room) return;
  const room = rooms.get(meta.room);
  ws.meta = { room: null, slot: null };
  if (!room) return;

  const leaver = room.players[meta.slot];
  if (!leaver) return;

  clearRoomTimer(room);

  if (room.game && room.game.status === 'playing' && room.players.length === 2) {
    const game = { ...room.game, status: 'finished', winner: 1 - meta.slot, winReason: reason };
    room.game = game;
    sendState(room);
  }

  for (const player of room.players) {
    if (player && player.ws !== ws) {
      send(player.ws, { type: 'opponentLeft' });
      player.ws.meta = { room: null, slot: null };
    }
  }

  rooms.delete(room.code);
}

function tryMatchQueue() {
  for (let i = 0; i < queue.length; i++) {
    const first = queue[i];
    if (first.ws.readyState !== first.ws.OPEN) {
      queue.splice(i, 1);
      i--;
      continue;
    }

    // Only pair players who chose the same board mode; a Classic player and a
    // Star Rush player should never be dropped into the same match. Search the
    // whole queue so an unmatched mode cannot block a valid pair behind it.
    let partnerIndex = -1;
    for (let j = i + 1; j < queue.length; j++) {
      const entry = queue[j];
      if (entry.ws.readyState !== entry.ws.OPEN) {
        queue.splice(j, 1);
        j--;
        continue;
      }
      if (entry.mode === first.mode) {
        partnerIndex = j;
        break;
      }
    }
    if (partnerIndex < 0) continue;

    const second = queue[partnerIndex];
    queue.splice(partnerIndex, 1);
    queue.splice(i, 1);
    i--;

    const room = {
      code: newCode(),
      mode: first.mode,
      players: [],
      game: null,
      timer: null,
      turnStartedAt: 0,
      rematch: [false, false],
      lastActive: Date.now(),
    };
    rooms.set(room.code, room);
    joinRoom(first.ws, room, first.name, first.avatar);
    joinRoom(second.ws, room, second.name, second.avatar);
  }
}

// ---------- websocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

wss.on('connection', (ws) => {
  ws.meta = { room: null, slot: null };
  ws.isAlive = true;
  ws.lastChat = 0;
  send(ws, { type: 'hello' });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Bad message.' });
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'create') {
      leaveRoom(ws);
      const room = {
        code: newCode(),
        mode: msg.mode === 'star' ? 'star' : 'classic',
        players: [],
        game: null,
        timer: null,
        turnStartedAt: 0,
        rematch: [false, false],
        lastActive: Date.now(),
      };
      rooms.set(room.code, room);
      joinRoom(ws, room, msg.name, msg.avatar);
      return;
    }

    if (msg.type === 'join') {
      leaveRoom(ws);
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: 'Room not found. Check the code.' });
        return;
      }
      if (room.players.length >= 2) {
        send(ws, { type: 'error', message: 'That room is already full.' });
        return;
      }
      if (room.game) {
        send(ws, { type: 'error', message: 'That game has already started.' });
        return;
      }
      joinRoom(ws, room, msg.name, msg.avatar);
      return;
    }

    if (msg.type === 'quick') {
      leaveRoom(ws);
      queue.push({
        ws,
        name: cleanName(msg.name, 'Player'),
        mode: msg.mode === 'star' ? 'star' : 'classic',
        avatar: cleanAvatar(msg.avatar, 0),
      });
      send(ws, { type: 'queued' });
      tryMatchQueue();
      return;
    }

    if (msg.type === 'action') {
      const meta = ws.meta;
      const room = meta?.room ? rooms.get(meta.room) : null;
      if (!room || !room.game || room.game.status !== 'playing') {
        send(ws, { type: 'error', message: 'No active game.' });
        return;
      }
      if (room.game.turn !== meta.slot) {
        send(ws, { type: 'error', message: 'It is not your turn.' });
        return;
      }

      const now = Date.now();
      const elapsed = Math.max(0, now - room.turnStartedAt);
      const remaining = Math.max(0, room.game.timeLeft[meta.slot] - elapsed);
      if (remaining <= 0) {
        const game = finishByTimeout(room.game, meta.slot);
        finishGame(room, game, 'timeout');
        return;
      }

      const action = msg.action || {};
      let result;
      if (action.type === 'move') {
        result = applyMove(room.game, { x: Number(action.to?.x), y: Number(action.to?.y) }, meta.slot);
      } else if (action.type === 'wall') {
        result = applyWall(
          room.game,
          Number(action.x),
          Number(action.y),
          action.o,
          meta.slot,
        );
      } else {
        send(ws, { type: 'error', message: 'Unknown action.' });
        return;
      }

      if (!result.ok) {
        send(ws, { type: 'error', message: result.error });
        return;
      }

      result.state.timeLeft[meta.slot] = remaining;
      room.game = result.state;
      room.turnStartedAt = now;
      room.lastActive = now;
      room.rematch = [false, false];

      if (room.game.status === 'finished') {
        clearRoomTimer(room);
      }
      sendState(room);
      return;
    }

    if (msg.type === 'chat') {
      const meta = ws.meta;
      const room = meta?.room ? rooms.get(meta.room) : null;
      if (!room) return;
      const now = Date.now();
      if (now - ws.lastChat < 700) return;
      ws.lastChat = now;
      const text = String(msg.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
      if (!text) return;
      broadcast(room, {
        type: 'chat',
        slot: meta.slot,
        name: room.players[meta.slot]?.name || 'Player',
        text,
      });
      return;
    }

    if (msg.type === 'rematch') {
      const meta = ws.meta;
      const room = meta?.room ? rooms.get(meta.room) : null;
      if (!room || room.players.length < 2) return;
      if (!room.game || room.game.status !== 'finished') return;
      room.rematch[meta.slot] = true;
      const other = 1 - meta.slot;
      if (room.rematch[other]) {
        startGame(room);
      } else {
        send(ws, { type: 'rematchWaiting' });
        send(room.players[other].ws, { type: 'rematchOffered', name: room.players[meta.slot].name });
      }
      return;
    }

    if (msg.type === 'leave') {
      leaveRoom(ws, 'resign');
      return;
    }
  });

  ws.on('close', () => {
    leaveRoom(ws, 'disconnect');
    const index = queue.findIndex((entry) => entry.ws === ws);
    if (index >= 0) queue.splice(index, 1);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 30_000);

// Clean up stale rooms after 45 minutes of inactivity.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActive > 45 * 60 * 1000) {
      clearRoomTimer(room);
      room.players.forEach((p) => {
        if (p) send(p.ws, { type: 'error', message: 'Room expired.' });
      });
      rooms.delete(code);
    }
  }
}, 60_000);

server.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  console.log('\n  Wall Clash server running');
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const address of addresses) {
    console.log(`  Network: http://${address}:${PORT}`);
  }
  console.log('');
});
