// Wall Clash client controller.
// Everything is rendered to a single canvas; the rules themselves live in
// engine.js so the server can enforce exactly the same behaviour.

import {
  applyMove,
  applyWall,
  canPlaceWall,
  createGame,
  legalMoves,
  DEFAULT_TIME,
  AI_NAMES,
} from './engine.js';
import { chooseAction } from './ai.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'wallclash.profile.v1';
const LOW_TIME_MS = 30_000;

const dom = {
  screens: {
    home: $('screen-home'),
    lobby: $('screen-lobby'),
    game: $('screen-game'),
  },
  homeSound: $('home-sound'),
  homeAvatar: $('home-avatar'),
  playerName: $('player-name'),
  difficultyControl: $('difficulty-control'),
  modeControl: $('mode-control'),
  btnAi: $('btn-ai'),
  btnLocal: $('btn-local'),
  btnOnline: $('btn-online'),
  btnRules: $('btn-rules'),

  lobbyBack: $('lobby-back'),
  lobbyCard: document.querySelector('.lobby-card'),
  lobbyCreate: $('btn-create-room'),
  lobbyJoin: $('btn-join-room'),
  lobbyJoinRow: document.querySelector('.join-row'),
  lobbyOrRow: document.querySelector('.or-row'),
  lobbyQuick: $('btn-quick-match'),
  lobbyCodeInput: $('room-code-input'),
  lobbyWaiting: $('lobby-waiting'),
  waitingLabel: document.querySelector('.waiting-label'),
  roomCodeDisplay: $('room-code-display'),
  waitingActions: document.querySelector('.waiting-actions'),
  waitingText: $('waiting-text'),
  copyCode: $('btn-copy-code'),
  copyLink: $('btn-copy-link'),
  cancelWait: $('btn-cancel-wait'),
  lobbyNote: $('lobby-note'),

  gameSound: $('game-sound'),
  gameContext: $('game-context'),
  pause: $('btn-pause'),
  cards: [$('card-p0'), $('card-p1')],
  avatars: [$('avatar-p0'), $('avatar-p1')],
  names: [$('name-p0'), $('name-p1')],
  bricks: [$('bricks-p0'), $('bricks-p1')],
  clocks: [$('time-p0'), $('time-p1')],
  boardArea: document.querySelector('.board-area'),
  gameWrap: document.querySelector('.game-wrap'),
  boardShell: $('board-shell'),
  board: $('board'),
  banner: $('board-banner'),
  turnName: $('turn-name'),
  turnChevron: document.querySelector('.turn-chevron'),
  chat: $('btn-chat'),
  brickCount: $('brick-count'),
  orientH: $('btn-orient-h'),
  orientV: $('btn-orient-v'),
  thinking: $('thinking'),
  emotes: [$('emote-p0'), $('emote-p1')],

  backdrop: $('modal-backdrop'),
  pauseModal: $('modal-pause'),
  pauseTitle: $('pause-title'),
  pauseCopy: $('pause-copy'),
  resume: $('btn-resume'),
  restart: $('btn-restart'),
  quit: $('btn-quit'),
  overModal: $('modal-over'),
  overEmblem: $('over-emblem'),
  overTitle: $('over-title'),
  overCopy: $('over-copy'),
  rematch: $('btn-rematch'),
  home: $('btn-home'),
  rematchNote: $('rematch-note'),
  chatModal: $('modal-chat'),
  emoteGrid: $('emote-grid'),
  chatClose: $('btn-chat-close'),
  rulesModal: $('modal-rules'),
  rulesClose: $('btn-rules-close'),
  toast: $('toast'),
  confetti: $('confetti'),
};

const AVATAR_STYLES = [
  { bg1: '#d7e8ff', bg2: '#84b4ff', skin: '#ffd5b2', hair: '#342747', shirt: '#f7fbff', accent: '#3f6fe0' },
  { bg1: '#ffdceb', bg2: '#ff9cc1', skin: '#f2bf97', hair: '#4b2b32', shirt: '#fff7fb', accent: '#ef2d78' },
  { bg1: '#dcf6ff', bg2: '#86d9ef', skin: '#b97d52', hair: '#1f1c2c', shirt: '#f8feff', accent: '#0c91ad' },
  { bg1: '#e9e0ff', bg2: '#b29dff', skin: '#e8b28b', hair: '#653c28', shirt: '#fcfaff', accent: '#6745e6' },
  { bg1: '#ffedcf', bg2: '#ffc165', skin: '#f4c9a5', hair: '#2b223d', shirt: '#fffdf7', accent: '#e48800' },
  { bg1: '#d9ffec', bg2: '#7fe0ae', skin: '#8d5d3f', hair: '#161a22', shirt: '#f8fffc', accent: '#0b9c60' },
  { bg1: '#ffe2e2', bg2: '#ff9b9b', skin: '#ffd0ad', hair: '#873a2e', shirt: '#fff9f9', accent: '#df3e3e' },
  { bg1: '#e4f0ff', bg2: '#9ec7ff', skin: '#c98e62', hair: '#38291c', shirt: '#f9fcff', accent: '#3569d4' },
];

const EMOTES = [
  'Nice move! 😎',
  'Good luck! 🍀',
  'Oof… 😅',
  'Watch this! 🔥',
  'Well played! 👏',
  'You’re going down! 😈',
];

const AI_EMOTES = ['Good luck! 🍀', 'Nice move! 😎', 'Hmm… 🤔', 'Watch this! 🔥', 'Well played! 👏'];

const COLORS = [
  { base: '#5b3df5', light: '#b3a7ff', dark: '#32149f', glow: 'rgba(91,61,245,0.35)' },
  { base: '#ff2e7e', light: '#ffb2cd', dark: '#a80648', glow: 'rgba(255,46,126,0.35)' },
];

// ---------- persisted profile ----------
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const store = loadStore();
const profile = {
  name: typeof store.name === 'string' ? store.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 14) : '',
  avatar: Number.isInteger(Number(store.avatar)) ? ((Number(store.avatar) % 8) + 8) % 8 : 0,
};
let difficulty = ['easy', 'medium', 'hard'].includes(store.difficulty) ? store.difficulty : 'medium';
let homeMode = store.mode === 'star' ? 'star' : 'classic';
let soundEnabled = store.sound !== false;

function saveStore() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        name: profile.name,
        avatar: profile.avatar,
        difficulty,
        mode: homeMode,
        sound: soundEnabled,
      }),
    );
  } catch {
    /* private mode etc. */
  }
}

function displayName() {
  return profile.name.trim() || 'You';
}

function onlineName() {
  return profile.name.trim() || 'Player';
}

function modeLabel(mode) {
  return mode === 'star' ? 'Star Rush' : 'Classic';
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

function pickAiName(avoid = '') {
  const pool = AI_NAMES.filter((name) => name.toLowerCase() !== avoid.trim().toLowerCase());
  return pool[Math.floor(Math.random() * pool.length)] || 'Nova';
}

function avatarForName(name, avoid = -1) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  let index = 2 + (hash % 6);
  if (index === avoid) index = 2 + ((index - 1) % 6);
  return index;
}

// ---------- original avatar art ----------
let avatarSerial = 0;

function avatarSvg(index) {
  const i = ((Number(index) || 0) % 8 + 8) % 8;
  const s = AVATAR_STYLES[i];
  const uid = `av${++avatarSerial}`;
  const hairBack =
    i % 4 === 1
      ? `<path d="M15 31c0-13 7-21 17-21s17 8 17 21v16c-3 1-6-1-7-6H22c-1 5-4 7-7 6Z" fill="${s.hair}"/>`
      : i % 4 === 2
        ? `<circle cx="46" cy="13" r="7" fill="${s.hair}"/><path d="M16 32c0-13 7-21 16-21s16 8 16 21v8c-4 0-6-4-7-9H23c-1 5-3 9-7 9Z" fill="${s.hair}"/>`
        : i % 4 === 3
          ? `<g fill="${s.hair}"><circle cx="18" cy="26" r="7"/><circle cx="24" cy="17" r="8"/><circle cx="34" cy="13" r="8"/><circle cx="44" cy="17" r="8"/><circle cx="49" cy="26" r="7"/></g>`
          : `<path d="M16 31c0-12 7-20 16-20s16 8 16 20c0 3-1 5-2 7l-4-8H22l-4 8c-1-2-2-4-2-7Z" fill="${s.hair}"/>`;

  const fringe =
    i % 4 === 3
      ? ''
      : i % 4 === 1
        ? `<path d="M17 26c2-9 8-14 15-14 8 0 14 5 15 14-4-2-7-5-9-8-3 4-13 5-21 3Z" fill="${s.hair}"/>`
        : i % 4 === 2
          ? `<path d="M18 24c3-8 8-12 15-12 8 0 13 5 15 14-5-3-8-6-9-9-3 4-11 6-21 7Z" fill="${s.hair}"/>`
          : `<path d="M18 23c3-9 8-13 15-13 7 0 12 5 13 13-4-1-7-4-9-7-2 4-9 6-19 7Z" fill="${s.hair}"/>`;

  let accessory = '';
  if (i % 4 === 0) {
    accessory = `<g fill="none" stroke="#fff" stroke-width="1.6" opacity=".92"><circle cx="27" cy="33" r="5"/><circle cx="38" cy="33" r="5"/><path d="M32 33h1.5M22 32l-3-1M43 32l3-1"/></g>`;
  } else if (i % 4 === 1) {
    accessory = `<g transform="translate(47 15)"><path d="M0-5 1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5Z" fill="#ffe066"/></g>`;
  } else if (i % 4 === 2) {
    accessory = `<g fill="none" stroke="${s.accent}" stroke-width="3" opacity=".92"><path d="M15 32c0-11 7-18 17-18s17 7 17 18"/><rect x="11" y="28" width="6" height="12" rx="3" fill="${s.accent}" stroke="none"/><rect x="47" y="28" width="6" height="12" rx="3" fill="${s.accent}" stroke="none"/></g>`;
  } else {
    accessory = `<g fill="#a65c45" opacity=".5"><circle cx="23" cy="37" r="1"/><circle cx="26" cy="39" r="1"/><circle cx="41" cy="37" r="1"/><circle cx="44" cy="39" r="1"/></g>`;
  }

  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="${s.bg1}"/><stop offset="1" stop-color="${s.bg2}"/>
      </linearGradient>
      <radialGradient id="${uid}face" cx=".38" cy=".3" r=".86">
        <stop stop-color="#fff" stop-opacity=".36"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="64" height="64" fill="url(#${uid}bg)"/>
    <circle cx="52" cy="10" r="18" fill="#fff" opacity=".16"/>
    <circle cx="10" cy="58" r="20" fill="#fff" opacity=".1"/>
    <path d="M7 64c1-13 11-20 25-20s24 7 25 20Z" fill="${s.shirt}"/>
    <path d="M24 45c2 4 5 6 8 6s6-2 8-6l-4-2h-8Z" fill="${s.accent}" opacity=".2"/>
    ${hairBack}
    <circle cx="32" cy="33" r="16.5" fill="${s.skin}"/>
    <circle cx="32" cy="33" r="16.5" fill="url(#${uid}face)"/>
    <circle cx="15.5" cy="35" r="3.2" fill="${s.skin}"/>
    <circle cx="48.5" cy="35" r="3.2" fill="${s.skin}"/>
    ${fringe}
    <g fill="#2a2238">
      <ellipse cx="26.5" cy="33" rx="1.7" ry="2.1"/>
      <ellipse cx="37.5" cy="33" rx="1.7" ry="2.1"/>
    </g>
    <circle cx="27" cy="32.2" r=".55" fill="#fff" opacity=".9"/>
    <circle cx="38" cy="32.2" r=".55" fill="#fff" opacity=".9"/>
    <path d="M26 39.5c2.8 2.5 9.2 2.5 12 0" fill="none" stroke="#7a3b40" stroke-width="1.7" stroke-linecap="round"/>
    <ellipse cx="22" cy="37" rx="3" ry="1.6" fill="#ff7d96" opacity=".22"/>
    <ellipse cx="42" cy="37" rx="3" ry="1.6" fill="#ff7d96" opacity=".22"/>
    ${accessory}
  </svg>`;
}

// ---------- tiny synthesized sound kit ----------
const Sound = {
  ctx: null,
  noiseBuffer: null,

  ensure() {
    if (!soundEnabled) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      /* audio unavailable */
    }
  },

  tone(freq, duration, { type = 'sine', gain = 0.04, slide = 0, delay = 0 } = {}) {
    if (!soundEnabled || !this.ctx) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  },

  thud() {
    if (!soundEnabled || !this.ctx) return;
    const ctx = this.ctx;
    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.16);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
      this.noiseBuffer = buffer;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const amp = ctx.createGain();
    amp.gain.value = 0.16;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start();
    this.tone(92, 0.16, { type: 'sine', gain: 0.09, slide: -28 });
  },

  play(name) {
    if (!soundEnabled) return;
    this.ensure();
    if (!this.ctx) return;
    switch (name) {
      case 'click':
        this.tone(620, 0.055, { type: 'triangle', gain: 0.025, slide: 120 });
        break;
      case 'move':
        this.tone(360, 0.11, { type: 'sine', gain: 0.05, slide: 220 });
        this.tone(760, 0.07, { type: 'triangle', gain: 0.018, slide: 80, delay: 0.02 });
        break;
      case 'wall':
        this.thud();
        break;
      case 'error':
        this.tone(190, 0.1, { type: 'square', gain: 0.025, slide: -35 });
        this.tone(150, 0.11, { type: 'square', gain: 0.02, slide: -20, delay: 0.09 });
        break;
      case 'chat':
        this.tone(660, 0.07, { type: 'sine', gain: 0.03, slide: 180 });
        this.tone(940, 0.08, { type: 'sine', gain: 0.025, slide: 60, delay: 0.07 });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          this.tone(freq, 0.3, { type: 'triangle', gain: 0.045, delay: i * 0.11 });
        });
        break;
      case 'lose':
        [392, 329.63, 261.63, 196].forEach((freq, i) => {
          this.tone(freq, 0.26, { type: 'sine', gain: 0.04, delay: i * 0.12, slide: -10 });
        });
        break;
      case 'start':
        [392, 523.25, 659.25].forEach((freq, i) => {
          this.tone(freq, 0.18, { type: 'triangle', gain: 0.035, delay: i * 0.08 });
        });
        break;
      case 'clock':
        this.tone(880, 0.045, { type: 'square', gain: 0.012 });
        break;
      default:
        break;
    }
  },
};

function syncSoundButtons() {
  for (const button of [dom.homeSound, dom.gameSound]) {
    if (!button) continue;
    button.classList.toggle('muted', !soundEnabled);
    button.setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Unmute sound');
    button.title = soundEnabled ? 'Sound on' : 'Sound off';
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  saveStore();
  syncSoundButtons();
  if (soundEnabled) {
    Sound.ensure();
    Sound.play('click');
  }
}

// ---------- shared client state ----------
let currentScreen = 'home';
let orientation = 'h';
let local = null;
let ws = null;
let wsPromise = null;
let wsErrorShown = false;
let openModal = null;
let overToken = 0;
let bannerTimer = 0;
let toastTimer = 0;
let emoteTimers = [0, 0];
let wakeLock = null;

function blankOnline() {
  return {
    active: false,
    you: null,
    code: null,
    mode: null,
    state: null,
    times: [DEFAULT_TIME, DEFAULT_TIME],
    clockTurn: 0,
    clockActive: DEFAULT_TIME,
    clockAnchor: 0,
    opponentGone: false,
    pendingAction: false,
    expectStart: false,
    lobbyWaiting: false,
    queued: false,
    rematchRequested: false,
    gameOverShown: false,
  };
}

let online = blankOnline();

const visual = {
  width: 0,
  height: 0,
  size: 0,
  pad: 0,
  cell: 0,
  pos: [
    { x: 4, y: 8 },
    { x: 4, y: 0 },
  ],
  anims: [null, null],
  wallSpawn: new Map(),
  hover: null,
  armed: null,
  pointer: null,
  tapStart: null,
  smoke: [],
  boardKey: '',
  hintKey: '',
  hints: [],
  lastMoveAt: 0,
};

function activeGame() {
  return online.active ? online.state : local ? local.state : null;
}

function localSetup() {
  return local
    ? {
        kind: local.kind,
        mode: local.mode,
        difficulty: local.difficulty,
        names: [...local.names],
        avatars: [...local.avatars],
      }
    : null;
}

// ---------- small UI helpers ----------
function showToast(text, duration = 2300) {
  if (!dom.toast) return;
  dom.toast.textContent = text;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('show'), duration);
}

function showBanner(text, duration = 1700) {
  if (!dom.banner) return;
  dom.banner.textContent = text;
  dom.banner.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => dom.banner.classList.add('hidden'), duration);
}

function hideBanner() {
  clearTimeout(bannerTimer);
  dom.banner.classList.add('hidden');
}

function vibrateTap() {
  vibrate(12);
}

// ---------- screens, modals and online lobby ----------

function setScreen(name) {
  currentScreen = name;
  for (const [key, el] of Object.entries(dom.screens)) {
    el.classList.toggle('active', key === name);
  }
  if (name === 'game') {
    requestWakeLock();
    layoutBoard();
  } else {
    releaseWakeLock();
    hideThinking();
    hideEmotes();
    if (name !== 'game') hideBanner();
  }
}

function hideAllModals() {
  overToken++;
  openModal = null;
  dom.backdrop.classList.add('hidden');
  for (const modal of [dom.pauseModal, dom.overModal, dom.chatModal, dom.rulesModal]) {
    modal.classList.add('hidden');
  }
}

function showModal(name) {
  const map = {
    pause: dom.pauseModal,
    over: dom.overModal,
    chat: dom.chatModal,
    rules: dom.rulesModal,
  };
  const target = map[name];
  if (!target) return;
  openModal = name;
  dom.backdrop.classList.remove('hidden');
  for (const modal of Object.values(map)) modal.classList.toggle('hidden', modal !== target);
}

function closeModal() {
  openModal = null;
  dom.backdrop.classList.add('hidden');
  for (const modal of [dom.pauseModal, dom.overModal, dom.chatModal, dom.rulesModal]) {
    modal.classList.add('hidden');
  }
}

function setLobbyNote(text) {
  dom.lobbyNote.textContent = text || '';
}

function resetLobbyUI() {
  dom.lobbyWaiting.classList.add('hidden');
  dom.lobbyCreate.classList.remove('hidden');
  dom.lobbyOrRow.classList.remove('hidden');
  dom.lobbyJoinRow.classList.remove('hidden');
  dom.lobbyQuick.classList.remove('hidden');
  dom.roomCodeDisplay.textContent = '----';
  dom.waitingText.textContent = 'Waiting for your opponent…';
  setLobbyNote('');
}

function lobbyControlsHidden() {
  for (const el of [dom.lobbyCreate, dom.lobbyOrRow, dom.lobbyJoinRow, dom.lobbyQuick]) {
    el.classList.add('hidden');
  }
}

function showLobbyWaiting({ code = null, queued = false, text = 'Waiting for your opponent…' } = {}) {
  lobbyControlsHidden();
  dom.lobbyWaiting.classList.remove('hidden');
  dom.waitingLabel.textContent = queued ? 'Quick match' : 'Room code';
  dom.roomCodeDisplay.textContent = queued ? '⚡' : code || '----';
  dom.waitingActions.classList.toggle('hidden', !code);
  dom.copyCode.disabled = !code;
  dom.copyLink.disabled = !code;
  dom.waitingText.textContent = text;
}

function cancelWaitingUI() {
  dom.lobbyWaiting.classList.add('hidden');
  dom.lobbyCreate.classList.remove('hidden');
  dom.lobbyOrRow.classList.remove('hidden');
  dom.lobbyJoinRow.classList.remove('hidden');
  dom.lobbyQuick.classList.remove('hidden');
}

function openLobby(focusCode = false) {
  resetLobbyUI();
  setScreen('lobby');
  if (focusCode) {
    setTimeout(() => {
      dom.lobbyCodeInput.focus({ preventScroll: true });
    }, 150);
  }
}

// ---------- online socket ----------
let lobbyBusy = false;

function configuredSocketUrl() {
  try {
    const raw = typeof window.WALL_CLASH_WS_URL === 'string' ? window.WALL_CLASH_WS_URL.trim() : '';
    if (!raw) return '';
    let value = raw;
    if (/^https:\/\//i.test(value)) value = `wss://${value.slice(8)}`;
    else if (/^http:\/\//i.test(value)) value = `ws://${value.slice(7)}`;
    else if (!/^wss?:\/\//i.test(value)) {
      value = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${value.replace(/^\/+/, '')}`;
    }
    const parsed = new URL(value);
    if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/ws';
    return parsed.toString();
  } catch {
    return '';
  }
}

function socketUrl() {
  const configured = configuredSocketUrl();
  if (configured) return configured;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

function ensureSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  if (wsPromise) return wsPromise;
  if (location.protocol === 'file:') {
    return Promise.reject(new Error('Open the game with “npm start” to play online.'));
  }

  const usingRemoteServer = Boolean(configuredSocketUrl());
  const connectTimeout = usingRemoteServer ? 75_000 : 8_000;

  wsPromise = new Promise((resolve, reject) => {
    let socket;
    try {
      socket = new WebSocket(socketUrl());
    } catch {
      wsPromise = null;
      reject(new Error('Could not open a connection to the online server. Check WALL_CLASH_WS_URL in config.js.'));
      return;
    }

    let settled = false;
    let timer = 0;
    let wakeTimer = 0;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      wsPromise = null;
      clearTimeout(timer);
      clearTimeout(wakeTimer);
      reject(new Error(message));
    };

    timer = setTimeout(() => {
      fail(
        usingRemoteServer
          ? 'The online server did not respond. Free hosting can take up to a minute to wake — try again.'
          : 'The game server is not responding.',
      );
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }, connectTimeout);

    if (usingRemoteServer) {
      wakeTimer = setTimeout(() => {
        if (settled || currentScreen !== 'lobby' || !online.lobbyWaiting) return;
        dom.waitingText.textContent = 'Waking the online server — free hosting can take up to a minute…';
      }, 5000);
    }

    socket.addEventListener('message', handleSocketMessage);
    socket.addEventListener('open', () => {
      socket.__opened = true;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(wakeTimer);
      ws = socket;
      wsPromise = null;
      wsErrorShown = false;
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      if (!settled) {
        fail(
          usingRemoteServer
            ? 'Cannot reach the online server. Check WALL_CLASH_WS_URL in config.js and that the server is awake.'
            : 'Cannot reach the game server. Is it running?',
        );
      }
    });
    socket.addEventListener('close', () => {
      fail('The connection to the game server closed.');
      handleSocketClose(socket);
    });
  });

  return wsPromise;
}

function socketSend(message, quiet = false) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    if (!quiet) showToast('Not connected to the game server.');
    return false;
  }
  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch {
    if (!quiet) showToast('Could not reach the game server.');
    return false;
  }
}

async function runLobbyAction(button, action) {
  if (lobbyBusy) return;
  lobbyBusy = true;
  if (button) button.disabled = true;
  setLobbyNote('');
  try {
    await ensureSocket();
    action();
  } catch (error) {
    const message =
      location.protocol === 'file:'
        ? 'Online play needs the local server. Run “npm start” and open http://localhost:3000.'
        : error?.message || 'Could not reach the game server.';
    setLobbyNote(message);
    showToast(message, 3400);
  } finally {
    lobbyBusy = false;
    if (button) button.disabled = false;
  }
}

async function handleCreateRoom() {
  await runLobbyAction(dom.lobbyCreate, () => {
    online.expectStart = true;
    online.queued = false;
    showLobbyWaiting({ text: 'Creating your room…' });
    socketSend({ type: 'create', name: onlineName(), mode: homeMode, avatar: profile.avatar });
  });
}

async function handleJoinRoom() {
  const code = dom.lobbyCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  dom.lobbyCodeInput.value = code;
  setLobbyNote('');
  if (code.length !== 4) {
    setLobbyNote('Enter the 4-character room code.');
    dom.lobbyCodeInput.focus();
    return;
  }
  await runLobbyAction(dom.lobbyJoin, () => {
    online.expectStart = true;
    online.queued = false;
    showLobbyWaiting({ code, text: 'Joining the room…' });
    socketSend({ type: 'join', code, name: onlineName(), avatar: profile.avatar });
  });
}

async function handleQuickMatch() {
  await runLobbyAction(dom.lobbyQuick, () => {
    online.expectStart = true;
    online.queued = true;
    showLobbyWaiting({ queued: true, text: 'Searching for an opponent…' });
    socketSend({ type: 'quick', name: onlineName(), mode: homeMode, avatar: profile.avatar });
  });
}

function handleCancelWait() {
  socketSend({ type: 'leave' }, true);
  online.expectStart = false;
  online.lobbyWaiting = false;
  online.queued = false;
  online.code = null;
  cancelWaitingUI();
  setLobbyNote('');
  showToast('Search cancelled.', 1500);
}

// ---------- server messages ----------
function handleSocketMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'hello':
      break;

    case 'waiting': {
      if (!online.expectStart || currentScreen !== 'lobby') {
        socketSend({ type: 'leave' }, true);
        return;
      }
      online.lobbyWaiting = true;
      online.queued = false;
      online.code = msg.code;
      online.mode = msg.mode;
      showLobbyWaiting({ code: msg.code, text: 'Waiting for your opponent…' });
      setLobbyNote('');
      break;
    }

    case 'queued': {
      if (!online.expectStart || currentScreen !== 'lobby') {
        socketSend({ type: 'leave' }, true);
        return;
      }
      online.lobbyWaiting = true;
      online.queued = true;
      showLobbyWaiting({ queued: true, text: 'Searching for an opponent…' });
      break;
    }

    case 'start': {
      if (!online.expectStart && !online.active) {
        socketSend({ type: 'leave' }, true);
        return;
      }
      if (currentScreen !== 'lobby' && !online.active) {
        socketSend({ type: 'leave' }, true);
        return;
      }
      beginOnlineGame(msg);
      break;
    }

    case 'state': {
      if (!online.active || !msg.game) return;
      const prev = online.state;
      online.state = msg.game;
      online.pendingAction = false;
      applyOnlineClock(msg);
      online.gameOverShown = msg.game.status === 'finished' ? online.gameOverShown : false;
      syncVisualState(prev, msg.game);
      announceStateChange(prev, msg.game);
      updateHud();
      if (msg.game.status === 'finished') scheduleOnlineGameOver();
      break;
    }

    case 'tick': {
      if (!online.active || !online.state || online.state.status !== 'playing') return;
      if (!Array.isArray(msg.times) || msg.times.length < 2) return;
      online.times = [Math.max(0, Number(msg.times[0]) || 0), Math.max(0, Number(msg.times[1]) || 0)];
      online.clockTurn = Number.isInteger(msg.turn) ? msg.turn : online.state.turn;
      online.clockActive = online.times[online.clockTurn];
      online.clockAnchor = performance.now();
      break;
    }

    case 'chat': {
      if (!online.active) return;
      showEmote(Number(msg.slot) || 0, String(msg.text || '').slice(0, 60));
      Sound.play('chat');
      dom.chat.classList.add('has-message');
      setTimeout(() => dom.chat.classList.remove('has-message'), 650);
      break;
    }

    case 'error': {
      const message = String(msg.message || 'Something went wrong.');
      online.pendingAction = false;
      showToast(message, 3000);
      if (currentScreen === 'lobby' && !online.active) {
        setLobbyNote(message);
        if (online.lobbyWaiting) {
          online.expectStart = false;
          online.lobbyWaiting = false;
          online.queued = false;
          online.code = null;
          cancelWaitingUI();
        }
      }
      break;
    }

    case 'opponentLeft': {
      if (!online.active) return;
      online.opponentGone = true;
      online.pendingAction = false;
      if (openModal === 'over') {
        dom.rematch.disabled = true;
        dom.rematchNote.textContent = 'Your opponent left the room.';
      } else {
        showToast('Your opponent left the match.', 2600);
        if (online.state && online.state.status === 'playing') {
          online.state = {
            ...online.state,
            status: 'finished',
            winner: online.you,
            winReason: 'disconnect',
          };
          updateHud();
          scheduleOnlineGameOver(200);
        }
      }
      break;
    }

    case 'rematchOffered': {
      if (!online.active) return;
      const name = String(msg.name || 'Your opponent');
      if (openModal === 'over') {
        dom.rematchNote.textContent = `${name} wants a rematch!`;
      }
      showToast(`${name} wants a rematch!`, 2600);
      break;
    }

    case 'rematchWaiting': {
      if (!online.active) return;
      online.rematchRequested = true;
      dom.rematch.disabled = true;
      dom.rematchNote.textContent = 'Waiting for your opponent to accept…';
      break;
    }

    default:
      break;
  }
}

function handleSocketClose(socket) {
  if (socket !== ws) return;
  ws = null;
  wsPromise = null;
  const wasActive = online.active;
  const wasWaiting = online.lobbyWaiting || online.expectStart;
  online = blankOnline();
  lobbyBusy = false;

  if (wasWaiting && currentScreen === 'lobby') {
    cancelWaitingUI();
    setLobbyNote('The connection to the game server was lost.');
  }

  if (wasActive) {
    hideThinking();
    updateHud();
    showToast('Connection lost. The match has ended.', 3200);
    if (currentScreen === 'game') {
      setTimeout(() => {
        if (currentScreen === 'game' && !online.active) goHome({ silent: true });
      }, 1300);
    }
  }
}

function applyOnlineClock(msg) {
  const game = msg.game;
  if (!game) return;
  let times = game.timeLeft.map((value) => Math.max(0, Number(value) || 0));
  const now = performance.now();
  if (game.status === 'playing') {
    const elapsed = Math.max(0, (Number(msg.serverNow) || Date.now()) - (Number(msg.turnStartedAt) || 0));
    times[game.turn] = Math.max(0, times[game.turn] - elapsed);
  }
  online.times = times;
  online.clockTurn = game.turn;
  online.clockActive = times[game.turn] || 0;
  online.clockAnchor = now;
}

function beginOnlineGame(msg) {
  const game = msg.game;
  if (!game) return;
  const wasRematch = online.active && online.gameOverShown;

  online.active = true;
  online.you = Number.isInteger(msg.you) ? msg.you : 0;
  online.code = msg.code || online.code;
  online.mode = msg.mode || game.mode || 'classic';
  online.state = game;
  online.expectStart = false;
  online.lobbyWaiting = false;
  online.queued = false;
  online.opponentGone = false;
  online.pendingAction = false;
  online.rematchRequested = false;
  online.gameOverShown = false;
  online.times = game.timeLeft.map((value) => Number(value) || 0);
  applyOnlineClock({ game, serverNow: msg.serverNow, turnStartedAt: msg.turnStartedAt });

  hideAllModals();
  hideBanner();
  resetLobbyUI();
  setScreen('game');
  resetVisualInstant(game);
  updateHud();
  layoutBoard();
  Sound.play('start');
  vibrateTap();
  if (wasRematch) showToast('Rematch started — good luck!', 1600);
}

// ---------- local games, clocks and HUD ----------

function stopLocalTimers() {
  if (local?.aiTimer) clearTimeout(local.aiTimer);
  if (local) local.aiTimer = null;
  hideThinking();
}

function stopLocal() {
  overToken++;
  stopLocalTimers();
  local = null;
  hideBanner();
}

function endOnlineSession({ send = true } = {}) {
  const shouldSend =
    send &&
    ws &&
    ws.readyState === WebSocket.OPEN &&
    (online.active || online.expectStart || online.lobbyWaiting);
  if (shouldSend) socketSend({ type: 'leave' }, true);
  online = blankOnline();
  lobbyBusy = false;
  hideThinking();
}

function startLocalGame(kind, options = {}) {
  endOnlineSession({ send: true });
  stopLocal();

  const mode = options.mode || homeMode;
  const level = options.difficulty || difficulty;
  const isAi = kind === 'ai';
  const playerOne = displayName();
  let names;
  let avatars;

  if (options.names && options.avatars) {
    names = [...options.names];
    avatars = [...options.avatars];
  } else if (isAi) {
    const aiName = pickAiName(playerOne);
    names = [playerOne, aiName];
    avatars = [profile.avatar, avatarForName(aiName, profile.avatar)];
  } else {
    names = [playerOne, 'Player 2'];
    avatars = [profile.avatar, (profile.avatar + 3) % 8];
  }

  const state = createGame({
    mode,
    names,
    avatars,
    timeMs: DEFAULT_TIME,
  });

  local = {
    kind: isAi ? 'ai' : 'local',
    mode,
    difficulty: level,
    names,
    avatars,
    state,
    times: [...state.timeLeft],
    turnStartedAt: performance.now(),
    paused: false,
    pausedAt: 0,
    aiTimer: null,
    aiToken: 0,
    gameOverShown: false,
  };

  orientation = 'h';
  hideAllModals();
  hideBanner();
  hideEmotes();
  setScreen('game');
  resetVisualInstant(state);
  updateHud();
  Sound.ensure();
  Sound.play('start');
  scheduleAiTurn();
}

function localClockInfo(now = performance.now()) {
  if (!local) return null;
  const game = local.state;
  const times = [...local.times];
  if (game.status === 'playing' && !local.paused) {
    const elapsed = Math.max(0, now - local.turnStartedAt);
    times[game.turn] = Math.max(0, times[game.turn] - elapsed);
  }
  return { game, times, active: game.turn, playing: game.status === 'playing' };
}

function onlineClockInfo(now = performance.now()) {
  if (!online.active || !online.state) return null;
  const game = online.state;
  const times = [...online.times];
  if (game.status === 'playing' && online.clockAnchor) {
    const elapsed = Math.max(0, now - online.clockAnchor);
    times[online.clockTurn] = Math.max(0, online.clockActive - elapsed);
  }
  return { game, times, active: game.turn, playing: game.status === 'playing' };
}

function activeClockInfo(now = performance.now()) {
  return online.active ? onlineClockInfo(now) : local ? localClockInfo(now) : null;
}

function currentRemaining(now = performance.now()) {
  const info = activeClockInfo(now);
  if (!info || !info.playing) return 0;
  return info.times[info.active] || 0;
}

function checkLocalTimeout(now = performance.now()) {
  if (!local || local.paused || local.state.status !== 'playing') return false;
  const active = local.state.turn;
  const info = localClockInfo(now);
  if (!info || info.times[active] > 0) return false;
  finishLocalByTimeout();
  return true;
}

function commitLocalClock(now = performance.now()) {
  if (!local || local.paused || local.state.status !== 'playing') return;
  const active = local.state.turn;
  const elapsed = Math.max(0, now - local.turnStartedAt);
  local.times[active] = Math.max(0, local.times[active] - elapsed);
  local.state.timeLeft = [...local.times];
  local.turnStartedAt = now;
}

function applyLocalAction(action, meta = {}) {
  if (!local || local.paused || local.state.status !== 'playing') return false;
  const now = performance.now();
  if (checkLocalTimeout(now)) return false;

  commitLocalClock(now);
  const active = local.state.turn;
  if (local.times[active] <= 0) {
    finishLocalByTimeout();
    return false;
  }

  let result;
  if (action?.type === 'move') {
    result = applyMove(local.state, action.to, active);
  } else if (action?.type === 'wall') {
    result = applyWall(local.state, action.x, action.y, action.o, active);
  } else {
    result = { ok: false, error: 'Unknown move.' };
  }

  if (!result.ok) {
    if (meta.human) {
      showToast(result.error || 'That move is not allowed.');
      Sound.play('error');
    }
    return false;
  }

  const prev = local.state;
  local.state = result.state;
  local.state.timeLeft = [...local.times];
  local.turnStartedAt = performance.now();
  clearAim();
  syncVisualState(prev, local.state);
  announceStateChange(prev, local.state);
  updateHud();

  if (local.state.status === 'finished') {
    hideThinking();
    local.gameOverShown = false;
    scheduleLocalGameOver(520);
  } else {
    scheduleAiTurn();
  }
  return true;
}

function finishLocalByTimeout() {
  if (!local || local.state.status !== 'playing') return;
  const now = performance.now();
  const active = local.state.turn;
  const elapsed = Math.max(0, now - local.turnStartedAt);
  local.times[active] = Math.max(0, local.times[active] - elapsed);
  const prev = local.state;
  local.state = {
    ...local.state,
    status: 'finished',
    winner: 1 - active,
    winReason: 'timeout',
    timeLeft: [...local.times],
  };
  local.paused = false;
  local.gameOverShown = false;
  hideThinking();
  clearAim();
  updateHud();
  scheduleLocalGameOver(260);
  Sound.play('error');
  announceStateChange(prev, local.state);
}

function scheduleLocalGameOver(delay = 480) {
  if (!local || local.state.status !== 'finished' || local.gameOverShown) return;
  const token = ++overToken;
  const target = local;
  setTimeout(() => {
    if (token !== overToken) return;
    if (!local || local !== target || local.state.status !== 'finished') return;
    presentGameOver();
  }, delay);
}

function scheduleAiTurn() {
  if (!local || local.kind !== 'ai' || local.paused) {
    hideThinking();
    return;
  }
  const game = local.state;
  if (game.status !== 'playing' || game.turn !== 1) {
    hideThinking();
    return;
  }

  hideThinking();
  if (local.aiTimer) clearTimeout(local.aiTimer);
  const token = ++local.aiToken;
  showThinking('thinking');
  const delay = 420 + Math.random() * 320;
  local.aiTimer = setTimeout(() => {
    local.aiTimer = null;
    if (!local || local.aiToken !== token || local.paused) return;
    if (local.state.status !== 'playing' || local.state.turn !== 1) {
      hideThinking();
      return;
    }
    const now = performance.now();
    if (checkLocalTimeout(now)) return;

    let action = null;
    try {
      action = chooseAction(local.state, local.difficulty);
    } catch {
      action = null;
    }
    if (!action) {
      const fallback = legalMoves(local.state, 1);
      if (fallback.length) action = { type: 'move', to: fallback[0] };
    }
    hideThinking();
    if (!action) return;
    applyLocalAction(action, { actor: 'ai' });

    if (local && local.kind === 'ai' && local.state.status === 'playing' && Math.random() < 0.12) {
      setTimeout(() => {
        if (local && local.state.status === 'playing') {
          showEmote(1, AI_EMOTES[Math.floor(Math.random() * AI_EMOTES.length)]);
          Sound.play('chat');
        }
      }, 900 + Math.random() * 800);
    }
  }, delay);
}

function pauseLocalGame() {
  if (!local || local.paused || local.state.status !== 'playing') return;
  const now = performance.now();
  if (checkLocalTimeout(now)) return;
  commitLocalClock(now);
  local.paused = true;
  local.pausedAt = now;
  if (local.aiTimer) {
    clearTimeout(local.aiTimer);
    local.aiTimer = null;
  }
  local.aiToken++;
  hideThinking();
  updateHud();
}

function resumeLocalGame() {
  if (!local || !local.paused) return;
  local.paused = false;
  local.pausedAt = 0;
  local.turnStartedAt = performance.now();
  updateHud();
  scheduleAiTurn();
}

function openPauseMenu(auto = false) {
  const game = activeGame();
  if (!game || currentScreen !== 'game') return;
  if (game.status !== 'playing') return;

  if (online.active) {
    dom.pauseTitle.textContent = 'Match Menu';
    dom.pauseCopy.textContent = 'Your clock is still running. Leaving now counts as a resignation.';
    dom.resume.textContent = 'Back to Game';
    dom.restart.classList.add('hidden');
    dom.quit.textContent = 'Resign & Leave';
    showModal('pause');
    return;
  }

  if (!local) return;
  if (!local.paused) pauseLocalGame();
  if (!local || local.state.status !== 'playing') return;

  dom.pauseTitle.textContent = auto ? 'Still there?' : 'Paused';
  dom.pauseCopy.textContent = auto
    ? 'We paused your clock while you were away. Ready to continue?'
    : 'Take a breath. Both clocks are stopped.';
  dom.resume.textContent = 'Resume';
  dom.restart.classList.remove('hidden');
  dom.restart.textContent = 'Restart Match';
  dom.quit.textContent = 'Quit to Home';
  showModal('pause');
}

function announceStateChange(prev, next) {
  if (!prev || !next) return;
  const lm = next.lastMove;
  if (!lm || next.moveCount === prev.moveCount) return;
  if (lm.type === 'wall') {
    Sound.play('wall');
  } else if (lm.type === 'move') {
    Sound.play('move');
  }
}

function hudPlayer() {
  if (online.active) return online.you ?? 0;
  if (!local) return 0;
  if (local.kind === 'ai') return 0;
  return local.state.turn;
}

function canInteractNow() {
  const game = activeGame();
  if (!game || game.status !== 'playing' || currentScreen !== 'game' || openModal) return false;
  if (online.active) {
    if (online.pendingAction || online.opponentGone) return false;
    if (game.turn !== online.you) return false;
    return currentRemaining() > 0;
  }
  if (!local || local.paused) return false;
  if (local.kind === 'ai' && game.turn !== 0) return false;
  return true;
}

function updateHud() {
  const game = activeGame();
  if (!game) return;

  for (let p = 0; p < 2; p++) {
    const avatarIndex = Number.isInteger(game.avatars?.[p]) ? game.avatars[p] : p;
    if (dom.avatars[p].dataset.avatar !== String(avatarIndex)) {
      dom.avatars[p].innerHTML = avatarSvg(avatarIndex);
      dom.avatars[p].dataset.avatar = String(avatarIndex);
    }
    dom.names[p].textContent = game.names?.[p] || `Player ${p + 1}`;
    dom.names[p].title = game.names?.[p] || `Player ${p + 1}`;
    dom.bricks[p].textContent = String(Math.max(0, game.wallsLeft?.[p] ?? 0));
  }

  const playing = game.status === 'playing';
  dom.cards[0].classList.toggle('active', playing && game.turn === 0);
  dom.cards[1].classList.toggle('active', playing && game.turn === 1);
  const loser = game.status === 'finished' && Number.isInteger(game.winner) ? 1 - game.winner : -1;
  dom.cards[0].classList.toggle('loser', loser === 0);
  dom.cards[1].classList.toggle('loser', loser === 1);

  let context;
  if (online.active) {
    context = `${modeLabel(game.mode).toUpperCase()} · ONLINE${online.code ? ` · ${online.code}` : ''}`;
  } else if (local?.kind === 'ai') {
    context = `${modeLabel(game.mode).toUpperCase()} · VS AI · ${local.difficulty.toUpperCase()}`;
  } else {
    context = `${modeLabel(game.mode).toUpperCase()} · PASS & PLAY`;
  }
  dom.gameContext.textContent = context;
  dom.gameContext.title = context;

  let turnText;
  if (!playing) {
    turnText = Number.isInteger(game.winner) ? `${game.names[game.winner] || 'Winner'} WINS` : 'DRAW';
  } else if (online.active) {
    turnText = game.turn === online.you ? 'YOUR TURN' : `${game.names[game.turn]} TO MOVE`;
  } else if (local?.kind === 'ai') {
    turnText = game.turn === 0 ? 'YOUR TURN' : `${game.names[1]} IS THINKING`;
  } else {
    turnText = `${game.names[game.turn]} TO MOVE`;
  }
  dom.turnName.textContent = turnText;
  dom.turnChevron.style.color = playing ? COLORS[game.turn].base : '#ff2e7e';

  const hudP = hudPlayer();
  dom.brickCount.textContent = String(Math.max(0, game.wallsLeft?.[hudP] ?? 0));
  const canBuild = canInteractNow() && (game.wallsLeft?.[hudP] ?? 0) > 0;
  dom.orientH.disabled = !canBuild;
  dom.orientV.disabled = !canBuild;
  dom.orientH.classList.toggle('active', orientation === 'h');
  dom.orientV.classList.toggle('active', orientation === 'v');
  dom.orientH.setAttribute('aria-pressed', orientation === 'h' ? 'true' : 'false');
  dom.orientV.setAttribute('aria-pressed', orientation === 'v' ? 'true' : 'false');

  dom.chat.disabled = !game || currentScreen !== 'game';

  const boardLabel = `${modeLabel(game.mode)} board. ${
    playing ? `${game.names[game.turn]} to move.` : 'Game over.'
  }`;
  dom.board.setAttribute('aria-label', boardLabel);

  refreshClocks(performance.now());
}

function refreshClocks(now = performance.now()) {
  const info = activeClockInfo(now);
  if (!info) return;
  for (let p = 0; p < 2; p++) {
    const remaining = Math.max(0, info.times[p] || 0);
    const label = formatTime(remaining);
    if (dom.clocks[p].textContent !== label) dom.clocks[p].textContent = label;
    const low = info.playing && remaining <= LOW_TIME_MS;
    dom.clocks[p].parentElement.classList.toggle('low', low);
  }

  if (!info.playing) {
    visual.lastCountKey = '';
    visual.lastCountSecond = null;
    return;
  }

  const activeRemaining = Math.max(0, info.times[info.active] || 0);
  const key = `${local ? 'l' : 'o'}-${info.game.moveCount}-${info.active}`;
  if (key !== visual.lastCountKey) {
    visual.lastCountKey = key;
    visual.lastCountSecond = null;
  }
  const second = Math.ceil(activeRemaining / 1000);
  const silentModal = openModal === 'pause' || openModal === 'over' || openModal === 'rules';
  if (second <= 10 && second > 0 && !silentModal) {
    if (visual.lastCountSecond !== second) {
      visual.lastCountSecond = second;
      Sound.play('clock');
    }
  } else if (second > 10) {
    visual.lastCountSecond = null;
  }
}

function showThinking(text = 'thinking') {
  dom.thinking.classList.remove('hidden');
  const label = dom.thinking.querySelector('em');
  if (label) label.textContent = text;
}

function hideThinking() {
  dom.thinking.classList.add('hidden');
}

function showEmote(slot, text) {
  const index = Number(slot) === 1 ? 1 : 0;
  const bubble = dom.emotes[index];
  if (!bubble || !text) return;
  bubble.textContent = String(text).slice(0, 70);
  bubble.classList.remove('hidden');
  clearTimeout(emoteTimers[index]);
  emoteTimers[index] = window.setTimeout(() => bubble.classList.add('hidden'), 3200);
}

function hideEmotes() {
  for (let i = 0; i < 2; i++) {
    clearTimeout(emoteTimers[i]);
    dom.emotes[i].classList.add('hidden');
  }
}

function sendChat(text) {
  const clean = String(text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
  if (!clean) return;
  closeModal();
  if (online.active) {
    socketSend({ type: 'chat', text: clean });
    return;
  }
  if (!local || local.state.status !== 'playing') {
    return;
  }
  const slot = local.kind === 'ai' ? 0 : local.state.turn;
  showEmote(slot, clean);
  Sound.play('chat');
  if (local.kind === 'ai' && slot === 0 && Math.random() < 0.6) {
    setTimeout(() => {
      if (local && local.state.status === 'playing') {
        showEmote(1, AI_EMOTES[Math.floor(Math.random() * AI_EMOTES.length)]);
        Sound.play('chat');
      }
    }, 700 + Math.random() * 900);
  }
}

// ---------- wake lock ----------
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  if (wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener?.('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    wakeLock.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    if (local && currentScreen === 'game' && local.state.status === 'playing' && !local.paused && !openModal) {
      openPauseMenu(true);
    }
  } else {
    if (currentScreen === 'game') requestWakeLock();
    if (openModal === 'over') {
      // The result screen may have been prepared while the page was hidden.
      dom.overModal.classList.remove('hidden');
    }
    refreshClocks();
  }
}

// ---------- canvas renderer and board input ----------

let ctx2d = null;

function layoutBoard() {
  if (!dom.board || !dom.boardArea) return;
  const availableW = dom.boardArea.clientWidth;
  const availableH = dom.boardArea.clientHeight;
  if (availableW < 60 || availableH < 60) return;

  const shell = Math.max(150, Math.floor(Math.min(availableW, availableH, 620)));
  dom.boardShell.style.width = `${shell}px`;
  dom.boardShell.style.height = `${shell}px`;

  const cssSize = Math.max(130, shell - 10);
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  dom.board.width = Math.round(cssSize * dpr);
  dom.board.height = Math.round(cssSize * dpr);
  dom.board.style.width = '100%';
  dom.board.style.height = '100%';

  ctx2d = dom.board.getContext('2d');
  if (ctx2d) {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.imageSmoothingEnabled = true;
  }

  visual.size = cssSize;
  visual.width = cssSize;
  visual.height = cssSize;
  visual.pad = cssSize * 0.055;
  visual.cell = (cssSize - visual.pad * 2) / 9;
  visual.boardKey = '';
}

function resetVisualInstant(game) {
  visual.pos = game.positions.map((p) => ({ x: p.x, y: p.y }));
  visual.anims = [null, null];
  visual.wallSpawn = new Map();
  const now = performance.now();
  for (const wall of game.walls || []) {
    visual.wallSpawn.set(wallKey(wall), now - 1000);
  }
  visual.hover = null;
  visual.armed = null;
  visual.cellHover = null;
  visual.hints = [];
  visual.hintKey = '';
  visual.lastMoveAt = now;
  visual.lastCountKey = '';
  visual.lastCountSecond = null;
  hideBanner();
}

function wallKey(wall) {
  return `${wall.x},${wall.y},${wall.o}`;
}

function syncVisualState(prev, next) {
  if (!prev || !next) {
    if (next) resetVisualInstant(next);
    return;
  }
  const now = performance.now();
  for (let p = 0; p < 2; p++) {
    const from = prev.positions[p];
    const to = next.positions[p];
    if (!from || !to) continue;
    if (from.x !== to.x || from.y !== to.y) {
      const current = visual.pos[p] || from;
      visual.anims[p] = {
        from: { x: current.x, y: current.y },
        to: { x: to.x, y: to.y },
        start: now,
        duration: Math.max(170, Math.min(300, 160 + Math.hypot(to.x - from.x, to.y - from.y) * 55)),
      };
    }
  }

  const currentKeys = new Set();
  for (const wall of next.walls || []) {
    const key = wallKey(wall);
    currentKeys.add(key);
    if (!visual.wallSpawn.has(key)) visual.wallSpawn.set(key, now);
  }
  for (const key of [...visual.wallSpawn.keys()]) {
    if (!currentKeys.has(key)) visual.wallSpawn.delete(key);
  }

  if (prev.moveCount !== next.moveCount) visual.lastMoveAt = now;
  visual.hintKey = '';
  visual.armed = null;
  visual.hover = null;
  visual.cellHover = null;
  hideBanner();
}

function clearAim() {
  visual.armed = null;
  visual.hover = null;
  visual.cellHover = null;
  hideBanner();
}

function setOrientation(next) {
  orientation = next === 'v' ? 'v' : 'h';
  if (visual.armed) {
    visual.armed.o = orientation;
    const game = activeGame();
    if (game) {
      visual.hover = {
        x: visual.armed.x,
        y: visual.armed.y,
        o: orientation,
        valid: canPlaceWall(game, visual.armed.x, visual.armed.y, orientation, hudPlayer()),
      };
    }
  }
  if (visual.pointer && visual.hover) updateHoverAtClient(visual.pointer.x, visual.pointer.y);
  vibrate(8);
  updateHud();
}

function hitTest(x, y, pointerType = 'mouse') {
  if (!visual.cell) return null;
  const gx = (x - visual.pad) / visual.cell;
  const gy = (y - visual.pad) / visual.cell;
  if (gx < -0.4 || gx > 9.4 || gy < -0.4 || gy > 9.4) return null;

  const nx = Math.round(gx);
  const ny = Math.round(gy);
  const threshold = pointerType === 'mouse' ? 0.245 : 0.3;
  const nearX = Math.abs(gx - nx) <= threshold;
  const nearY = Math.abs(gy - ny) <= threshold;
  if (nx >= 1 && nx <= 8 && ny >= 1 && ny <= 8 && nearX && nearY) {
    return { type: 'wall', x: nx - 1, y: ny - 1, nodeX: nx, nodeY: ny };
  }

  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  if (cx >= 0 && cx < 9 && cy >= 0 && cy < 9) {
    return { type: 'cell', x: cx, y: cy };
  }
  return null;
}

function clientPoint(event) {
  const rect = dom.board.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * visual.size,
    y: ((event.clientY - rect.top) / rect.height) * visual.size,
    pointerType: event.pointerType || 'mouse',
  };
}

function updateHoverAtClient(clientX, clientY) {
  visual.pointer = { x: clientX, y: clientY };
  if (!canInteractNow()) {
    visual.hover = null;
    visual.cellHover = null;
    return;
  }
  const point = clientPoint({ clientX, clientY, pointerType: 'mouse' });
  if (!point) return;
  const hit = hitTest(point.x, point.y, 'mouse');
  if (hit?.type === 'wall') {
    const game = activeGame();
    const valid = canPlaceWall(game, hit.x, hit.y, orientation, hudPlayer());
    visual.hover = { ...hit, o: orientation, valid };
    visual.cellHover = null;
  } else {
    visual.hover = null;
    visual.cellHover = hit?.type === 'cell' ? hit : null;
  }
}

function handlePointerDown(event) {
  Sound.ensure();
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  visual.tapStart = {
    x: event.clientX,
    y: event.clientY,
    pointerType: event.pointerType || 'mouse',
    id: event.pointerId,
  };
  try {
    event.preventDefault();
  } catch {
    /* ignore */
  }
}

function handlePointerMove(event) {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  if (visual.tapStart && event.buttons) return;
  updateHoverAtClient(event.clientX, event.clientY);
}

function handlePointerLeave(event) {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  visual.pointer = null;
  visual.hover = null;
  visual.cellHover = null;
}

function handlePointerUp(event) {
  const start = visual.tapStart;
  visual.tapStart = null;
  if (!start || start.id !== event.pointerId) return;
  const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  if (moved > 14) return;
  handleBoardTap(event.clientX, event.clientY, start.pointerType);
}

function handlePointerCancel() {
  visual.tapStart = null;
}

function handleBoardTap(clientX, clientY, pointerType = 'mouse') {
  const game = activeGame();
  if (!game || currentScreen !== 'game' || openModal) return;
  if (game.status !== 'playing') return;

  if (!canInteractNow()) {
    if (online.active && game.turn !== online.you && !online.pendingAction) {
      showToast('Wait for your opponent to move.', 1200);
    }
    return;
  }

  const point = clientPoint({ clientX, clientY, pointerType });
  if (!point) return;
  const hit = hitTest(point.x, point.y, pointerType);
  if (!hit) return;

  if (hit.type === 'wall') {
    attemptWallInput(hit, pointerType);
  } else {
    attemptMoveInput(hit);
  }
}

function attemptMoveInput(cell) {
  const game = activeGame();
  if (!game) return;
  const moves = legalMoves(game, game.turn);
  if (!moves.some((move) => move.x === cell.x && move.y === cell.y)) {
    visual.cellHover = null;
    return;
  }
  visual.armed = null;
  visual.hover = null;
  visual.cellHover = null;
  hideBanner();
  performAction({ type: 'move', to: { x: cell.x, y: cell.y } });
}

function attemptWallInput(hit, pointerType) {
  const game = activeGame();
  if (!game) return;
  const player = hudPlayer();
  if ((game.wallsLeft?.[player] ?? 0) <= 0) {
    showToast('No bricks left — move your ball instead.', 1700);
    Sound.play('error');
    vibrate(18);
    return;
  }

  const wall = { x: hit.x, y: hit.y, o: orientation };
  const valid = canPlaceWall(game, wall.x, wall.y, wall.o, player);
  if (!valid) {
    const other = orientation === 'h' ? 'v' : 'h';
    const otherValid = canPlaceWall(game, wall.x, wall.y, other, player);
    visual.hover = { ...wall, valid: false };
    visual.armed = null;
    Sound.play('error');
    vibrate(18);
    showToast(otherValid ? 'That direction is blocked — try the other one.' : 'That wall cannot go there.', 1700);
    return;
  }

  if (pointerType === 'mouse') {
    visual.hover = null;
    visual.armed = null;
    performAction({ type: 'wall', x: wall.x, y: wall.y, o: wall.o });
    return;
  }

  if (visual.armed && visual.armed.x === wall.x && visual.armed.y === wall.y && visual.armed.o === wall.o) {
    visual.armed = null;
    visual.hover = null;
    hideBanner();
    performAction({ type: 'wall', x: wall.x, y: wall.y, o: wall.o });
    return;
  }

  visual.armed = wall;
  visual.hover = { ...wall, valid: true };
  Sound.play('click');
  vibrateTap();
  showBanner('Tap the same spot again to build', 1800);
}

function performAction(action) {
  if (!canInteractNow()) return;
  vibrateTap();
  if (online.active) {
    online.pendingAction = true;
    const sent = socketSend({ type: 'action', action });
    if (!sent) {
      online.pendingAction = false;
      return;
    }
    updateHud();
    setTimeout(() => {
      if (!online.active) return;
      if (online.pendingAction) {
        online.pendingAction = false;
        updateHud();
      }
    }, 2200);
    return;
  }
  applyLocalAction(action, { human: true });
}

// ---------- drawing helpers ----------
function roundedRectPath(context, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + w - radius, y);
  context.quadraticCurveTo(x + w, y, x + w, y + radius);
  context.lineTo(x + w, y + h - radius);
  context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  context.lineTo(x + radius, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function easeOutBack(t) {
  const c = 1.4;
  const p = t - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

function starPath(context, cx, cy, outer, inner, rotation = -Math.PI / 2) {
  context.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = rotation + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function cellCenter(x, y) {
  return {
    x: visual.pad + (x + 0.5) * visual.cell,
    y: visual.pad + (y + 0.5) * visual.cell,
  };
}

function drawBoard(now) {
  if (!ctx2d || !visual.size) return;
  const context = ctx2d;
  const size = visual.size;
  const pad = visual.pad;
  const cell = visual.cell;
  const game = activeGame();

  context.clearRect(0, 0, size, size);
  const background = context.createLinearGradient(0, 0, size, size);
  background.addColorStop(0, '#fefdff');
  background.addColorStop(0.55, '#fbf9ff');
  background.addColorStop(1, '#f7f3ff');
  context.fillStyle = background;
  context.fillRect(0, 0, size, size);

  const glowA = context.createRadialGradient(size * 0.08, size * 0.05, 0, size * 0.08, size * 0.05, size * 0.7);
  glowA.addColorStop(0, 'rgba(255,116,170,0.11)');
  glowA.addColorStop(1, 'rgba(255,116,170,0)');
  context.fillStyle = glowA;
  context.fillRect(0, 0, size, size);

  const glowB = context.createRadialGradient(size * 0.95, size * 0.98, 0, size * 0.95, size * 0.98, size * 0.7);
  glowB.addColorStop(0, 'rgba(91,61,245,0.1)');
  glowB.addColorStop(1, 'rgba(91,61,245,0)');
  context.fillStyle = glowB;
  context.fillRect(0, 0, size, size);

  context.fillStyle = 'rgba(255,255,255,0.7)';
  roundedRectPath(context, pad - 5, pad - 5, cell * 9 + 10, cell * 9 + 10, cell * 0.35);
  context.fill();

  if (!game) return;

  // Goal edges.
  if (game.mode === 'classic') {
    const top = context.createLinearGradient(0, pad, 0, pad + cell);
    top.addColorStop(0, 'rgba(255,46,126,0.17)');
    top.addColorStop(1, 'rgba(255,46,126,0.035)');
    context.fillStyle = top;
    context.fillRect(pad, pad, cell * 9, cell);

    const bottom = context.createLinearGradient(0, pad + cell * 8, 0, pad + cell * 9);
    bottom.addColorStop(0, 'rgba(91,61,245,0.035)');
    bottom.addColorStop(1, 'rgba(91,61,245,0.17)');
    context.fillStyle = bottom;
    context.fillRect(pad, pad + cell * 8, cell * 9, cell);

    context.strokeStyle = 'rgba(255,46,126,0.23)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(pad + cell * 2, pad + 1);
    context.lineTo(pad + cell * 7, pad + 1);
    context.stroke();

    context.strokeStyle = 'rgba(91,61,245,0.23)';
    context.beginPath();
    context.moveTo(pad + cell * 2, pad + cell * 9 - 1);
    context.lineTo(pad + cell * 7, pad + cell * 9 - 1);
    context.stroke();
  }

  // Very subtle alternate cell tint.
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if ((x + y) % 2 === 0) {
        context.fillStyle = 'rgba(116,88,190,0.026)';
        context.fillRect(pad + x * cell, pad + y * cell, cell, cell);
      }
    }
  }

  // Grid.
  context.strokeStyle = 'rgba(116,88,190,0.16)';
  context.lineWidth = 1;
  for (let i = 0; i <= 9; i++) {
    const pos = pad + i * cell;
    context.beginPath();
    context.moveTo(pos, pad);
    context.lineTo(pos, pad + cell * 9);
    context.stroke();
    context.beginPath();
    context.moveTo(pad, pos);
    context.lineTo(pad + cell * 9, pos);
    context.stroke();
  }

  // Small aiming dots at wall intersections.
  context.fillStyle = 'rgba(116,88,190,0.25)';
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 8; x++) {
      context.beginPath();
      context.arc(pad + x * cell, pad + y * cell, Math.max(1.1, cell * 0.028), 0, Math.PI * 2);
      context.fill();
    }
  }

  if (game.mode === 'star') {
    const center = cellCenter(4, 4);
    const pulse = 0.5 + 0.5 * Math.sin(now / 520);
    context.save();
    const halo = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, cell * 1.15);
    halo.addColorStop(0, `rgba(255,214,84,${0.3 + pulse * 0.14})`);
    halo.addColorStop(1, 'rgba(255,214,84,0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(center.x, center.y, cell * 1.15, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = 'rgba(255,190,40,0.9)';
    context.shadowBlur = cell * (0.35 + pulse * 0.2);
    const gold = context.createLinearGradient(center.x, center.y - cell * 0.35, center.x, center.y + cell * 0.35);
    gold.addColorStop(0, '#fff5b8');
    gold.addColorStop(0.45, '#ffd84d');
    gold.addColorStop(1, '#f3a300');
    context.fillStyle = gold;
    starPath(context, center.x, center.y - cell * 0.02, cell * 0.36, cell * 0.16);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(255,255,255,0.85)';
    context.lineWidth = Math.max(1, cell * 0.028);
    context.stroke();
    context.restore();

    for (let i = 0; i < 3; i++) {
      const angle = now / 1600 + (i * Math.PI * 2) / 3;
      const sx = center.x + Math.cos(angle) * cell * 0.58;
      const sy = center.y + Math.sin(angle) * cell * 0.42;
      context.fillStyle = `rgba(255,255,255,${0.28 + 0.3 * (0.5 + 0.5 * Math.sin(now / 300 + i))})`;
      context.beginPath();
      context.arc(sx, sy, Math.max(1, cell * 0.035), 0, Math.PI * 2);
      context.fill();
    }
  }

  // Last move marker.
  if (game.lastMove?.type === 'move' && game.lastMove.to) {
    const elapsed = now - visual.lastMoveAt;
    if (elapsed < 1500) {
      const alpha = Math.max(0, 1 - elapsed / 1500);
      const center = cellCenter(game.lastMove.to.x, game.lastMove.to.y);
      const color = COLORS[game.lastMove.player] || COLORS[0];
      context.save();
      context.strokeStyle = color.base;
      context.globalAlpha = alpha * 0.5;
      context.lineWidth = Math.max(1.5, cell * 0.04);
      context.beginPath();
      context.arc(center.x, center.y, cell * 0.38, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  // Legal move hints.
  const interactive = canInteractNow();
  const hintKey = `${game.turn}|${game.moveCount}|${game.walls.length}|${game.positions[0].x},${game.positions[0].y}|${game.positions[1].x},${game.positions[1].y}`;
  if (interactive) {
    if (hintKey !== visual.hintKey) {
      visual.hintKey = hintKey;
      visual.hints = legalMoves(game, game.turn);
    }
    const from = cellCenter(visual.pos[game.turn].x, visual.pos[game.turn].y);
    visual.hints.forEach((move, index) => {
      const center = cellCenter(move.x, move.y);
      const activeHover =
        visual.cellHover && visual.cellHover.type === 'cell' && visual.cellHover.x === move.x && visual.cellHover.y === move.y;
      const color = COLORS[game.turn] || COLORS[0];
      const pulse = 0.5 + 0.5 * Math.sin(now / 380 + index * 0.7);

      if (Math.abs(move.x - game.positions[game.turn].x) + Math.abs(move.y - game.positions[game.turn].y) > 1) {
        context.save();
        context.strokeStyle = color.base;
        context.globalAlpha = 0.16;
        context.setLineDash([Math.max(2, cell * 0.08), Math.max(3, cell * 0.11)]);
        context.lineWidth = Math.max(1.2, cell * 0.035);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(center.x, center.y);
        context.stroke();
        context.restore();
      }

      context.save();
      context.shadowColor = color.glow;
      context.shadowBlur = cell * (0.12 + pulse * 0.1);
      context.fillStyle = color.base;
      context.globalAlpha = 0.26 + pulse * 0.12;
      context.beginPath();
      context.arc(center.x, center.y, cell * (0.1 + pulse * 0.012), 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(255,255,255,0.8)';
      context.lineWidth = Math.max(1, cell * 0.025);
      context.stroke();
      if (activeHover) {
        context.globalAlpha = 0.9;
        context.strokeStyle = color.base;
        context.lineWidth = Math.max(1.5, cell * 0.045);
        context.beginPath();
        context.arc(center.x, center.y, cell * 0.33, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    });
  } else {
    visual.hints = [];
    visual.hintKey = '';
  }

  // Walls.
  for (const wall of game.walls) {
    const key = wallKey(wall);
    const born = visual.wallSpawn.get(key) || now - 1000;
    const age = now - born;
    const scale = age < 260 ? Math.max(0.12, easeOutBack(Math.min(1, age / 260))) : 1;
    drawWall(context, wall, scale, 1, null);
  }

  // Ghost wall preview.
  if (interactive && visual.hover) {
    const ghostColor = visual.hover.valid
      ? COLORS[game.turn] || COLORS[0]
      : { base: '#ff3d56', light: '#ff9ba7', dark: '#9e0016', glow: 'rgba(255,61,86,0.4)' };
    const alpha = 0.32 + 0.1 * (0.5 + 0.5 * Math.sin(now / 230));
    drawWall(context, visual.hover, 1, alpha, ghostColor);
    drawGhostOutline(context, visual.hover, ghostColor);
  }

  // Balls.
  for (let p = 0; p < 2; p++) {
    const anim = visual.anims[p];
    let x = game.positions[p].x;
    let y = game.positions[p].y;
    let lift = 0;
    if (anim) {
      const t = Math.min(1, (now - anim.start) / anim.duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      x = anim.from.x + (anim.to.x - anim.from.x) * eased;
      y = anim.from.y + (anim.to.y - anim.from.y) * eased;
      lift = Math.sin(Math.PI * t) * cell * 0.22;
      visual.pos[p] = { x, y };
      if (t >= 1) visual.anims[p] = null;
    } else {
      visual.pos[p] = { x, y };
    }
    drawBall(context, p, x, y, lift, now);
  }

  // Finish shimmer (still visible behind the result modal).
  if (game.status === 'finished' && Number.isInteger(game.winner)) {
    const winnerPos = visual.pos[game.winner];
    const center = cellCenter(winnerPos.x, winnerPos.y);
    const ring = 0.6 + 0.4 * Math.sin(now / 320);
    context.save();
    context.strokeStyle = COLORS[game.winner].base;
    context.globalAlpha = 0.25 + ring * 0.2;
    context.lineWidth = Math.max(2, cell * 0.05);
    context.beginPath();
    context.arc(center.x, center.y, cell * (0.38 + ring * 0.08), 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function drawWall(context, wall, scale = 1, alpha = 1, palette = null) {
  const cell = visual.cell;
  const cx = visual.pad + (wall.x + 1) * cell;
  const cy = visual.pad + (wall.y + 1) * cell;
  const horizontal = wall.o !== 'v';
  const thickness = Math.max(8, cell * 0.2);
  const margin = cell * 0.055;
  const seam = cell * 0.038;
  const color = palette || COLORS[wall.player] || COLORS[0];

  context.save();
  context.globalAlpha = alpha;
  context.translate(cx, cy);
  context.scale(scale, scale);
  context.translate(-cx, -cy);

  if (horizontal) {
    const y = cy - thickness / 2;
    const leftX = cx - cell + margin;
    const rightX = cx + seam;
    const w = cell - margin - seam;
    // Drop shadow.
    context.globalAlpha = alpha * 0.2;
    context.fillStyle = color.dark;
    roundedRectPath(context, leftX + 1, y + thickness * 0.34, w, thickness, thickness * 0.3);
    context.fill();
    roundedRectPath(context, rightX + 1, y + thickness * 0.34, w, thickness, thickness * 0.3);
    context.fill();
    context.globalAlpha = alpha;
    drawBrick(context, leftX, y, w, thickness, color, true);
    drawBrick(context, rightX, y, w, thickness, color, true);
  } else {
    const x = cx - thickness / 2;
    const topY = cy - cell + margin;
    const bottomY = cy + seam;
    const h = cell - margin - seam;
    context.globalAlpha = alpha * 0.2;
    context.fillStyle = color.dark;
    roundedRectPath(context, x + thickness * 0.34, topY + 1, thickness, h, thickness * 0.3);
    context.fill();
    roundedRectPath(context, x + thickness * 0.34, bottomY + 1, thickness, h, thickness * 0.3);
    context.fill();
    context.globalAlpha = alpha;
    drawBrick(context, x, topY, thickness, h, color, false);
    drawBrick(context, x, bottomY, thickness, h, color, false);
  }
  context.restore();
}

function drawBrick(context, x, y, w, h, color, horizontal) {
  const gradient = horizontal
    ? context.createLinearGradient(0, y, 0, y + h)
    : context.createLinearGradient(x, 0, x + w, 0);
  gradient.addColorStop(0, color.light);
  gradient.addColorStop(0.32, color.base);
  gradient.addColorStop(1, color.dark);
  roundedRectPath(context, x, y, w, h, Math.min(w, h) * 0.32);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.4)';
  context.lineWidth = Math.max(0.8, visual.cell * 0.018);
  context.stroke();

  context.fillStyle = 'rgba(255,255,255,0.4)';
  if (horizontal) {
    roundedRectPath(context, x + w * 0.09, y + h * 0.15, w * 0.82, h * 0.2, h * 0.1);
  } else {
    roundedRectPath(context, x + w * 0.16, y + h * 0.08, w * 0.2, h * 0.84, w * 0.1);
  }
  context.fill();

  context.fillStyle = 'rgba(24,2,64,0.2)';
  if (horizontal) {
    roundedRectPath(context, x + w * 0.06, y + h * 0.78, w * 0.88, h * 0.14, h * 0.07);
  } else {
    roundedRectPath(context, x + w * 0.78, y + h * 0.06, w * 0.14, h * 0.88, w * 0.07);
  }
  context.fill();
}

function drawGhostOutline(context, wall, color) {
  const cell = visual.cell;
  const cx = visual.pad + (wall.x + 1) * cell;
  const cy = visual.pad + (wall.y + 1) * cell;
  const horizontal = wall.o !== 'v';
  const thickness = Math.max(8, cell * 0.2);
  const span = cell - cell * 0.055;
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.9)';
  context.lineWidth = Math.max(1.2, cell * 0.03);
  context.setLineDash([Math.max(3, cell * 0.08), Math.max(3, cell * 0.08)]);
  if (horizontal) {
    roundedRectPath(context, cx - span, cy - thickness / 2 - 3, span * 2, thickness + 6, (thickness + 6) * 0.4);
  } else {
    roundedRectPath(context, cx - thickness / 2 - 3, cy - span, thickness + 6, span * 2, (thickness + 6) * 0.4);
  }
  context.stroke();
  context.setLineDash([]);
  if (!wall.valid) {
    context.strokeStyle = color.base;
    context.globalAlpha = 0.8;
    context.lineWidth = Math.max(2, cell * 0.05);
    context.beginPath();
    context.moveTo(cx - cell * 0.18, cy - cell * 0.18);
    context.lineTo(cx + cell * 0.18, cy + cell * 0.18);
    context.moveTo(cx + cell * 0.18, cy - cell * 0.18);
    context.lineTo(cx - cell * 0.18, cy + cell * 0.18);
    context.stroke();
  }
  context.restore();
}

function drawBall(context, player, gridX, gridY, lift, now) {
  const cell = visual.cell;
  const center = cellCenter(gridX, gridY);
  const radius = cell * 0.335;
  const cx = center.x;
  const cy = center.y - lift;
  const color = COLORS[player];
  const active = activeGame()?.status === 'playing' && activeGame()?.turn === player;

  context.save();
  const shadow = context.createRadialGradient(cx, center.y + radius * 0.85, 0, cx, center.y + radius * 0.85, radius * 1.15);
  shadow.addColorStop(0, 'rgba(45,18,90,0.28)');
  shadow.addColorStop(1, 'rgba(45,18,90,0)');
  context.fillStyle = shadow;
  context.beginPath();
  context.ellipse(cx, center.y + radius * 0.85, radius * 1.02, radius * 0.42, 0, 0, Math.PI * 2);
  context.fill();

  if (active) {
    context.strokeStyle = color.base;
    context.globalAlpha = 0.3 + 0.12 * Math.sin(now / 300);
    context.lineWidth = Math.max(1.5, cell * 0.035);
    context.beginPath();
    context.arc(cx, cy, radius * 1.24, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }

  context.shadowColor = color.glow;
  context.shadowBlur = cell * 0.25;
  const sphere = context.createRadialGradient(
    cx - radius * 0.36,
    cy - radius * 0.42,
    radius * 0.08,
    cx,
    cy,
    radius * 1.02,
  );
  sphere.addColorStop(0, '#ffffff');
  sphere.addColorStop(0.16, color.light);
  sphere.addColorStop(0.58, color.base);
  sphere.addColorStop(1, color.dark);
  context.fillStyle = sphere;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  context.strokeStyle = 'rgba(255,255,255,0.55)';
  context.lineWidth = Math.max(1, cell * 0.028);
  context.stroke();

  context.fillStyle = 'rgba(255,255,255,0.62)';
  context.beginPath();
  context.ellipse(cx - radius * 0.33, cy - radius * 0.38, radius * 0.28, radius * 0.18, -0.6, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = 'rgba(255,255,255,0.16)';
  context.beginPath();
  context.ellipse(cx + radius * 0.18, cy + radius * 0.42, radius * 0.32, radius * 0.15, 0.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (currentScreen !== 'game') return;
  checkLocalTimeout(now);
  drawBoard(now);
  refreshClocks(now);
}

// ---------- results, confetti and leaving a match ----------

function scheduleOnlineGameOver(delay = 540) {
  if (!online.active || !online.state || online.state.status !== 'finished' || online.gameOverShown) return;
  const target = online.state;
  const token = ++overToken;
  setTimeout(() => {
    if (token !== overToken) return;
    if (!online.active || online.state !== target || online.state.status !== 'finished') return;
    presentGameOver();
  }, delay);
}

function goalDescription(mode) {
  return mode === 'star' ? 'the golden star' : 'the far side';
}

function perspectiveCopy(game, you) {
  const won = game.winner === you;
  const opponent = game.names[1 - you] || 'Your opponent';
  switch (game.winReason) {
    case 'goal':
      return won
        ? `You reached ${goalDescription(game.mode)} first. Beautifully played!`
        : `${opponent} reached ${goalDescription(game.mode)} first.`;
    case 'timeout':
      return won ? 'Your rival’s clock hit zero.' : 'Your clock hit zero. Keep an eye on it next time!';
    case 'resign':
      return won ? `${opponent} resigned the match.` : 'You resigned the match.';
    case 'disconnect':
      return won ? `${opponent} disconnected from the match.` : 'The connection ended the match.';
    default:
      return won ? 'You won the match.' : 'Better luck next time.';
  }
}

function localReasonCopy(game, winner) {
  const winnerName = game.names[winner] || 'Player';
  const loserName = game.names[1 - winner] || 'Player';
  switch (game.winReason) {
    case 'goal':
      return `${winnerName} reached ${goalDescription(game.mode)} first.`;
    case 'timeout':
      return `${loserName} ran out of time.`;
    case 'resign':
      return `${loserName} resigned.`;
    case 'disconnect':
      return `${loserName} disconnected.`;
    default:
      return `${winnerName} won the match.`;
  }
}

function presentGameOver() {
  const game = activeGame();
  if (!game || game.status !== 'finished') return;
  if (openModal === 'over') return;

  if (online.active) {
    if (online.gameOverShown) return;
    online.gameOverShown = true;
  } else {
    if (!local || local.gameOverShown) return;
    local.gameOverShown = true;
  }

  hideThinking();
  clearAim();
  const winner = Number.isInteger(game.winner) ? game.winner : null;
  let title;
  let copy;
  let won;
  let showRematch = true;

  if (online.active) {
    won = winner === online.you;
    title = won ? 'VICTORY!' : game.winReason === 'timeout' ? 'TIME’S UP!' : 'DEFEAT';
    copy = perspectiveCopy(game, online.you);
    showRematch = !online.opponentGone;
    dom.rematch.disabled = !showRematch;
    dom.rematch.textContent = 'Rematch';
    dom.rematchNote.textContent = online.opponentGone
      ? 'Your opponent left the room.'
      : 'Both players need to accept a rematch.';
  } else if (local?.kind === 'ai') {
    won = winner === 0;
    title = won ? 'VICTORY!' : game.winReason === 'timeout' ? 'TIME’S UP!' : 'DEFEAT';
    copy = perspectiveCopy(game, 0);
    dom.rematch.disabled = false;
    dom.rematch.textContent = 'Rematch';
    dom.rematchNote.textContent = '';
  } else if (local) {
    won = true;
    title = `${(game.names[winner] || 'Player').toUpperCase()} WINS!`;
    copy = localReasonCopy(game, winner);
    dom.rematch.disabled = false;
    dom.rematch.textContent = 'Play Again';
    dom.rematchNote.textContent = '';
  } else {
    return;
  }

  dom.overEmblem.className = won ? 'over-emblem' : 'over-emblem lose';
  dom.overEmblem.textContent = won ? '★' : '✕';
  dom.overTitle.className = won ? 'win' : 'lose';
  dom.overTitle.textContent = title;
  dom.overCopy.textContent = copy;
  dom.rematchNote.classList.remove('hidden');
  if (showRematch) dom.rematch.classList.remove('hidden');
  else dom.rematch.classList.add('hidden');

  showModal('over');
  updateHud();
  refreshClocks();
  Sound.play(won ? 'win' : 'lose');
  if (won) {
    launchConfetti();
    vibrate([20, 40, 24]);
  } else {
    vibrate(30);
  }
}

function launchConfetti() {
  const canvas = dom.confetti;
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.display = 'block';
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ['#ff2e7e', '#5b3df5', '#ffd84d', '#6fffa9', '#ff9fc2', '#a394ff', '#5bc8ff'];
  const particles = [];
  const count = window.innerWidth < 480 ? 90 : 140;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 170 + Math.random() * 620;
    particles.push({
      x: width * 0.5 + (Math.random() - 0.5) * width * 0.16,
      y: height * 0.36 + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 250,
      w: 5 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() * 2 - 1) * 9,
      shape: Math.random() < 0.22 ? 'circle' : 'rect',
      sway: Math.random() * 2 * Math.PI,
    });
  }

  const started = performance.now();
  let last = started;
  let raf = 0;

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    context.clearRect(0, 0, width, height);
    const elapsed = now - started;
    particles.forEach((particle) => {
      particle.vy += 820 * dt;
      particle.vx *= 0.992;
      particle.x += (particle.vx + Math.sin(now / 240 + particle.sway) * 22) * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
      const alpha = elapsed > 2600 ? Math.max(0, 1 - (elapsed - 2600) / 700) : 1;
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = particle.color;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      if (particle.shape === 'circle') {
        context.beginPath();
        context.arc(0, 0, particle.w * 0.44, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-particle.w / 2, -particle.h / 2, particle.w, particle.h);
      }
      context.restore();
    });
    if (elapsed < 3300 && currentScreen === 'game') {
      raf = requestAnimationFrame(tick);
    } else {
      context.clearRect(0, 0, width, height);
      canvas.style.display = 'none';
      cancelAnimationFrame(raf);
    }
  }

  raf = requestAnimationFrame(tick);
}

function goHome({ silent = false } = {}) {
  endOnlineSession({ send: true });
  stopLocal();
  hideAllModals();
  hideBanner();
  hideEmotes();
  cancelWaitingUI();
  resetLobbyUI();
  setScreen('home');
  if (!silent) {
    // Nothing to announce; returning home should feel instant.
  }
}

function leaveLobby() {
  if (online.expectStart || online.lobbyWaiting) endOnlineSession({ send: true });
  else online = blankOnline();
  cancelWaitingUI();
  resetLobbyUI();
  setScreen('home');
}

function handleResume() {
  closeModal();
  if (!online.active && local?.paused) resumeLocalGame();
}

function handleRestart() {
  if (online.active) return;
  const setup = localSetup();
  if (!setup) return;
  closeModal();
  startLocalGame(setup.kind, setup);
}

function handleQuitMatch() {
  closeModal();
  goHome();
}

function handleRematch() {
  if (online.active) {
    if (online.opponentGone) {
      showToast('Your opponent already left.', 1700);
      return;
    }
    if (online.rematchRequested) return;
    online.rematchRequested = true;
    dom.rematch.disabled = true;
    dom.rematchNote.textContent = 'Waiting for your opponent to accept…';
    socketSend({ type: 'rematch' });
    return;
  }
  const setup = localSetup();
  if (!setup) return;
  startLocalGame(setup.kind, setup);
}

function openChat() {
  const game = activeGame();
  if (!game || currentScreen !== 'game') return;
  if (game.status === 'finished') return;
  if (online.active && online.opponentGone) {
    showToast('Your opponent has left the room.', 1500);
    return;
  }
  showModal('chat');
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  if (!ok) throw new Error('Copy is not available.');
}

function inviteUrl(code) {
  try {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', code);
    return url.toString();
  } catch {
    return `${location.origin}${location.pathname}?room=${code}`;
  }
}

async function copyRoomCode() {
  if (!online.code) return;
  try {
    await writeClipboard(online.code);
    showToast(`Room code ${online.code} copied.`, 1500);
  } catch {
    showToast(`Room code: ${online.code}`, 2400);
  }
}

async function copyInviteLink() {
  if (!online.code) return;
  try {
    await writeClipboard(inviteUrl(online.code));
    showToast('Invite link copied.', 1500);
  } catch {
    showToast('Could not copy the link. Share the room code instead.', 2600);
  }
}

function readInviteCode() {
  let code = '';
  try {
    const params = new URLSearchParams(location.search);
    code = String(params.get('room') || params.get('code') || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
    if (!code && location.hash) {
      code = location.hash.replace(/^#/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    }
  } catch {
    code = '';
  }
  if (code.length !== 4) return;
  openLobby(true);
  dom.lobbyCodeInput.value = code;
  showToast(`Room ${code} is ready — tap Join.`, 3000);
}

function buildEmoteGrid() {
  dom.emoteGrid.textContent = '';
  for (const text of EMOTES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emote-option';
    button.textContent = text;
    button.addEventListener('click', () => sendChat(text));
    dom.emoteGrid.appendChild(button);
  }
}

function refreshProfileHome() {
  dom.playerName.value = profile.name;
  dom.homeAvatar.innerHTML = avatarSvg(profile.avatar);
  dom.homeAvatar.dataset.avatar = String(profile.avatar);
  dom.homeAvatar.title = 'Tap to change avatar';
  dom.homeAvatar.setAttribute('role', 'button');
  dom.homeAvatar.tabIndex = 0;
}

function refreshOptionButtons() {
  dom.difficultyControl.querySelectorAll('button[data-difficulty]').forEach((button) => {
    button.classList.toggle('active', button.dataset.difficulty === difficulty);
  });
  dom.modeControl.querySelectorAll('button[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === homeMode);
  });
}

function cycleAvatar() {
  profile.avatar = (profile.avatar + 1) % 8;
  saveStore();
  refreshProfileHome();
  Sound.ensure();
  vibrate(8);
}

// ---------- event wiring and boot ----------

function setupEvents() {
  dom.homeSound.addEventListener('click', toggleSound);
  dom.gameSound.addEventListener('click', toggleSound);

  dom.homeAvatar.addEventListener('click', cycleAvatar);
  dom.homeAvatar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      Sound.ensure();
      Sound.play('click');
      cycleAvatar();
    }
  });

  dom.playerName.addEventListener('input', () => {
    profile.name = dom.playerName.value.replace(/[\u0000-\u001f<>]/g, '').slice(0, 14);
    saveStore();
  });
  dom.playerName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') dom.playerName.blur();
  });

  dom.difficultyControl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-difficulty]');
    if (!button) return;
    difficulty = button.dataset.difficulty;
    saveStore();
    refreshOptionButtons();
    Sound.ensure();
  });

  dom.modeControl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;
    homeMode = button.dataset.mode === 'star' ? 'star' : 'classic';
    saveStore();
    refreshOptionButtons();
    Sound.ensure();
  });

  dom.btnAi.addEventListener('click', () => {
    Sound.ensure();
    startLocalGame('ai');
  });
  dom.btnLocal.addEventListener('click', () => {
    Sound.ensure();
    startLocalGame('local');
  });
  dom.btnOnline.addEventListener('click', () => {
    Sound.ensure();
    openLobby();
  });
  dom.btnRules.addEventListener('click', () => {
    Sound.ensure();
    showModal('rules');
  });
  dom.rulesClose.addEventListener('click', closeModal);

  dom.lobbyBack.addEventListener('click', leaveLobby);
  dom.lobbyCreate.addEventListener('click', handleCreateRoom);
  dom.lobbyJoin.addEventListener('click', handleJoinRoom);
  dom.lobbyQuick.addEventListener('click', handleQuickMatch);
  dom.cancelWait.addEventListener('click', handleCancelWait);
  dom.copyCode.addEventListener('click', copyRoomCode);
  dom.copyLink.addEventListener('click', copyInviteLink);

  dom.lobbyCodeInput.addEventListener('input', () => {
    const cleaned = dom.lobbyCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (dom.lobbyCodeInput.value !== cleaned) dom.lobbyCodeInput.value = cleaned;
    if (dom.lobbyNote.textContent) setLobbyNote('');
  });
  dom.lobbyCodeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleJoinRoom();
    }
  });

  dom.pause.addEventListener('click', () => {
    Sound.ensure();
    openPauseMenu(false);
  });
  dom.resume.addEventListener('click', handleResume);
  dom.restart.addEventListener('click', handleRestart);
  dom.quit.addEventListener('click', handleQuitMatch);

  dom.rematch.addEventListener('click', handleRematch);
  dom.home.addEventListener('click', () => {
    closeModal();
    goHome();
  });

  dom.chat.addEventListener('click', openChat);
  dom.chatClose.addEventListener('click', closeModal);

  dom.orientH.addEventListener('click', () => setOrientation('h'));
  dom.orientV.addEventListener('click', () => setOrientation('v'));

  dom.board.addEventListener('pointerdown', handlePointerDown, { passive: false });
  dom.board.addEventListener('pointermove', handlePointerMove);
  dom.board.addEventListener('pointerleave', handlePointerLeave);
  dom.board.addEventListener('pointerup', handlePointerUp);
  dom.board.addEventListener('pointercancel', handlePointerCancel);
  dom.board.addEventListener('contextmenu', (event) => event.preventDefault());

  dom.backdrop.addEventListener('click', (event) => {
    if (event.target !== dom.backdrop) return;
    if (openModal === 'chat' || openModal === 'rules') closeModal();
  });

  window.addEventListener('keydown', (event) => {
    Sound.ensure();
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

    if (event.key === 'Escape') {
      if (openModal === 'chat' || openModal === 'rules') {
        closeModal();
        event.preventDefault();
        return;
      }
      if (openModal === 'pause') {
        handleResume();
        event.preventDefault();
        return;
      }
      if (!openModal && currentScreen === 'game') {
        openPauseMenu(false);
        event.preventDefault();
      }
      return;
    }

    if (typing || openModal) return;
    if (currentScreen !== 'game' || !canInteractNow()) return;
    if (event.key === 'h' || event.key === 'H') {
      Sound.play('click');
      setOrientation('h');
      event.preventDefault();
    } else if (event.key === 'v' || event.key === 'V') {
      Sound.play('click');
      setOrientation('v');
      event.preventDefault();
    } else if (event.key === 'r' || event.key === 'R') {
      Sound.play('click');
      setOrientation(orientation === 'h' ? 'v' : 'h');
      event.preventDefault();
    }
  });

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('resize', () => {
    if (currentScreen === 'game') layoutBoard();
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (currentScreen === 'game') layoutBoard();
    }, 220);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (currentScreen === 'game') layoutBoard();
    });
  }

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => {
      if (currentScreen === 'game') layoutBoard();
    });
    observer.observe(dom.boardArea);
    observer.observe(dom.gameWrap || dom.boardArea);
  }

  // The first gesture unlocks WebAudio on mobile browsers.
  window.addEventListener(
    'pointerdown',
    (event) => {
      Sound.ensure();
      if (event.target instanceof Element && event.target.closest('button')) Sound.play('click');
    },
    { capture: true, passive: true },
  );
}

function init() {
  refreshProfileHome();
  refreshOptionButtons();
  syncSoundButtons();
  buildEmoteGrid();
  setupEvents();
  requestAnimationFrame(frame);
  setTimeout(() => {
    if (currentScreen === 'game') layoutBoard();
  }, 60);
  readInviteCode();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
