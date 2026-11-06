/*
 * Wall Clash online server configuration.
 *
 * Leave this empty when the game is served by server.js (local play or a
 * single-host deployment such as Render). The client will connect to /ws on
 * the same host.
 *
 * When the frontend is hosted separately (for example on Netlify), set this
 * to the public WebSocket address of the Node server, then redeploy:
 *
 *   window.WALL_CLASH_WS_URL = "wss://wall-clash-online.onrender.com/ws";
 *
 * Use wss:// whenever the page is served over HTTPS. The /ws path may be
 * omitted; it is added automatically.
 */
window.WALL_CLASH_WS_URL = "";
