# Wall Clash

A polished browser recreation of the 1v1 wall-strategy game popularised by
**Wall Clash Multiplayer Game** (JazzVA Gamers). Two balls face each other on a
9x9 board. On every turn you either step one square or build one of your seven
two-cell walls. Classic mode races to the far side; Star Rush races to the
golden star in the centre.

All code, avatars, sounds and visuals in this project are original. No assets
from the Play Store game are used, and this project is not affiliated with
JazzVA Gamers or Google.

## Play

```bash
npm install
npm start
```

Requires Node.js 18 or newer. Open **http://localhost:3000**. The server also
prints your LAN address, so a phone on the same Wi-Fi can join with that URL.
Allow Node through the Windows firewall if prompted.

> The game must be served over HTTP. Opening `public/index.html` as a file will
> not work because the game uses ES modules and, for online play, WebSockets.

## Features

- **Classic** — reach the opposite row.
- **Star Rush** — reach the golden star in the centre.
- **Vs AI** — three heuristic difficulties (easy, medium, hard).
- **Pass & Play** — two players sharing one device.
- **Online** — create a four-letter room, join with a code or invite link, or
  use quick match. Includes rematch, preset chat emotes and server-authoritative
  three-minute clocks.
- **Phone + desktop** — responsive glass UI, mouse hover previews, and a
  two-tap wall confirmation on touch screens.
- Original SVG avatars, canvas-drawn glossy balls/bricks, and synthesized
  WebAudio effects. Sound can be muted.

## Controls

| Action | Mouse / touch |
| --- | --- |
| Move | Click/tap a highlighted square |
| Aim a wall | Click/tap an intersection |
| Build (touch) | Tap the same spot a second time |
| Rotate wall | **H** / **V** keys, **R** to toggle, or the tray buttons |
| Chat | Chat button |
| Pause | Pause button or **Esc** |

Legal moves are highlighted, and invalid wall placements show a red preview and
a short explanation. Wall orientation can also be switched with the two buttons
next to the brick count.

## Rules

- Board: 9x9. Each player starts with 7 walls and 3:00 on their clock.
- A turn is exactly one action: move one square orthogonally **or** place one
  wall. Placing a wall consumes one brick.
- A wall covers two cell edges between four intersections. Walls may not
  overlap, cross through the same intersection, or seal either player off from
  their goal.
- If the opponent is adjacent, you may jump straight over them. If the square
  behind them is blocked by a wall or the board edge, you may jump diagonally.
- Classic: player 0 (blue, bottom) wins by reaching row 0; player 1 (pink, top)
  wins by reaching row 8.
- Star Rush: the first ball to reach the centre square wins.
- If a clock reaches zero, that player loses.

## Online notes

- The server is authoritative: moves, walls, clocks, turn order and results are
  validated in `public/engine.js` on the Node process.
- Room codes are four characters from an unambiguous alphabet. Rooms hold two
  players and expire after 45 minutes of inactivity.
- Quick match pairs players who chose the same mode.
- Leaving or losing the connection resigns the match for the remaining player.
- There are no accounts or persistence; a refresh starts a fresh session.

## Tests

```bash
npm test             # 13 engine rule tests
npm run test:online  # boots the real server and tests the WebSocket protocol
npm run simulate:ai  # AI-vs-AI simulation
```

The online test uses port 3210 and shuts the server down when it finishes.

## Project layout

```text
server.js              static file server + WebSocket rooms/quick match
public/index.html      screens and controls
public/config.js       optional online server URL (WALL_CLASH_WS_URL)
public/styles.css      responsive glass UI, original avatar/card styling
public/app.js          client state, rendering, input, audio, online client
public/engine.js       shared rules/state engine (also used by the server)
public/ai.js           AI move/wall chooser
public/fonts/          bundled Baloo 2 and Nunito (SIL Open Font License)
netlify.toml           Netlify static-frontend configuration
render.yaml            optional Render blueprint for the Node backend
test/                  engine, online and AI simulation tests
```

## Deploying

### Netlify frontend + Render backend (free split setup)

Netlify can host the static game, but it cannot run or proxy the persistent
WebSocket server that powers online rooms. Netlify Functions are stateless and
are not a substitute. Online play therefore needs a second Node service. The
included `netlify.toml` and `render.yaml` set up that split.

1. **Publish the backend first.** Put this folder in a GitHub repository and
   sign in to [Render](https://render.com). Choose **New > Blueprint**, select
   the repository, and apply `render.yaml`. To configure it manually instead,
   create a **Web Service** with:
   - Runtime: **Node**
   - Build command: `npm ci`
   - Start command: `npm start`
   - Plan: **Free**
   - Instances: **1**

   Open `https://<service>.onrender.com` after the deploy to confirm the game
   loads. The WebSocket endpoint is `wss://<service>.onrender.com/ws`.

2. **Point the frontend at the backend.** Edit `public/config.js`:

   ```js
   window.WALL_CLASH_WS_URL = "wss://<service>.onrender.com/ws";
   ```

   A page served over HTTPS must use `wss://`, not `ws://`. The `/ws` path may
   be omitted because it is added automatically.

3. **Deploy the frontend to Netlify.** Connect the same GitHub repository and
   accept `netlify.toml` (publish directory `public`, build command empty), or
   drag the **`public` folder** onto <https://app.netlify.com/drop>. Do not drag
   the project root. Netlify only needs the files inside `public`.

4. **Test with two devices.** Open the Netlify URL, choose **Online**, create a
   room on one device and join with the code on the other. If the connection
   fails, check the browser console, the configured URL, and whether the Render
   service is awake.

#### Free Render caveats

- A free service sleeps after 15 minutes without HTTP requests or WebSocket
  messages. The next visit can take about a minute to wake. The game waits up
  to 75 seconds and shows a wake-up notice after 5 seconds.
- Sleeping clears the in-memory rooms, so old room codes stop working. Create a
  fresh room once the server is awake.
- Keep **one instance**. Rooms and the quick-match queue live in memory and are
  not shared between instances.
- An active match sends WebSocket traffic, which keeps the free service awake.

### One-service alternative

Deploy the whole project to Render, Railway, Fly.io or a VPS and leave
`WALL_CLASH_WS_URL` empty. Static files and WebSockets then share one origin.
The included `render.yaml` works for this too; use the Render URL instead of
Netlify.

### Self-hosting

Run `npm start` behind any HTTPS reverse proxy that supports WebSocket
upgrades. Set `PORT` and, if needed, `HOST`:

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

Minimal nginx reverse proxy:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

HTTPS is recommended for clipboard copy, screen wake lock and a secure context.
The only runtime dependency is [`ws`](https://www.npmjs.com/package/ws).

## Known limitations

- No reconnect/resume after a dropped connection.
- No accounts, rankings, spectator mode or persistent history.
- Quick match only finds players on the same server instance.
- Chat uses preset emotes only.
- Online clocks keep running while the tab is hidden; local games pause when the
  page is hidden.
- The AI is a fast heuristic opponent, not a perfect Quoridor solver.
- On a free split deployment the backend can take about a minute to wake, and
  sleeping clears rooms and the quick-match queue.
- UI text is English-only.
