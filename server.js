import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocketServer } from 'ws';
import {
  abilityById,
  addPlayer,
  chooseNode,
  commandAct,
  commandBuy,
  commandEnd,
  commandLevel,
  commandMove,
  commandShrine,
  commandUndo,
  continueForward,
  disconnectPlayer,
  newRoom,
  pickClass,
  reconnectPlayer,
  returnToLobby,
  startRun,
  viewState,
} from './shared/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED_DIR = path.join(__dirname, 'shared');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function safeFile(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const full = path.normalize(path.join(root, decoded));
  if (!full.startsWith(root)) return null;
  return full;
}

function serveFile(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function send(socket, obj) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(obj));
}

function makeCode(rooms) {
  for (let attempt = 0; attempt < 24; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPHABET[(Math.random() * ALPHABET.length) | 0];
    if (!rooms.has(code)) return code;
  }
  return `Z${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

function makeToken() {
  return crypto.randomBytes(16).toString('hex');
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function createApp() {
  const rooms = new Map();

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (urlPath === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`ok ${rooms.size}`);
      return;
    }
    if (urlPath === '/' || urlPath === '') {
      serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
      return;
    }
    if (urlPath.startsWith('/vendor/three/')) {
      const file = safeFile(THREE_DIR, urlPath.slice('/vendor/three/'.length));
      if (!file) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      serveFile(res, file);
      return;
    }
    if (urlPath.startsWith('/shared/')) {
      const file = safeFile(SHARED_DIR, urlPath.slice('/shared/'.length));
      if (!file) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      serveFile(res, file);
      return;
    }
    const file = safeFile(PUBLIC_DIR, urlPath);
    if (!file) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    serveFile(res, file);
  });

  const wss = new WebSocketServer({ server });

  function broadcast(room, events = []) {
    const state = viewState(room);
    for (const player of room.players) {
      send(player.ws, { type: 'state', you: player.id, state, events });
    }
  }

  function replyError(ws, result) {
    send(ws, { type: 'error', text: result.error || 'That did not work.' });
  }

  function bind(ws, room, player) {
    if (player.ws && player.ws !== ws) {
      try { player.ws.close(); } catch { /* already gone */ }
    }
    player.ws = ws;
    player.connected = true;
    ws.room = room;
    ws.playerId = player.id;
  }

  function touch(room) {
    clearTimeout(room.timer);
    room.timer = null;
    if (room.players.some((player) => player.connected && player.ws && player.ws.readyState === 1)) return;
    room.timer = setTimeout(() => {
      rooms.delete(room.code);
    }, 30000);
    if (room.timer.unref) room.timer.unref();
  }

  function welcome(ws, player, room) {
    send(ws, { type: 'welcome', playerId: player.id, token: player.token, code: room.code, name: player.name });
  }

  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.on('pong', () => {
      ws.alive = true;
    });

    ws.on('message', (data) => {
      if (data.length > 8000) return;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'create' && !ws.room) {
        const code = makeCode(rooms);
        const room = newRoom(code);
        rooms.set(code, room);
        const added = addPlayer(room, { name: msg.name, token: makeToken() });
        bind(ws, room, added.player);
        welcome(ws, added.player, room);
        broadcast(room);
        return;
      }

      if (msg.type === 'join' && !ws.room) {
        const code = String(msg.code || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: 'error', text: 'No company is using that code.' });
          return;
        }
        const added = addPlayer(room, { name: msg.name, token: makeToken() });
        if (added.error) {
          replyError(ws, added);
          return;
        }
        clearTimeout(room.timer);
        bind(ws, room, added.player);
        welcome(ws, added.player, room);
        broadcast(room);
        return;
      }

      if (msg.type === 'resume' && !ws.room) {
        const code = String(msg.code || '').trim().toUpperCase();
        const room = rooms.get(code);
        const player = room?.players.find((entry) => entry.token === msg.token);
        if (!room || !player) {
          send(ws, { type: 'error', text: 'That room is gone.' });
          return;
        }
        clearTimeout(room.timer);
        bind(ws, room, player);
        reconnectPlayer(room, player.id);
        welcome(ws, player, room);
        broadcast(room);
        return;
      }

      const room = ws.room;
      const playerId = ws.playerId;
      if (!room || !playerId) return;

      let result = null;
      if (msg.type === 'class') result = pickClass(room, playerId, msg.classId);
      else if (msg.type === 'start') result = startRun(room, playerId, msg.seed);
      else if (msg.type === 'node') result = chooseNode(room, playerId, String(msg.nodeId || ''));
      else if (msg.type === 'move') {
        const x = intOrNull(msg.x);
        const z = intOrNull(msg.z);
        result = x == null || z == null ? { error: 'Pick a tile.' } : commandMove(room, playerId, x, z);
      } else if (msg.type === 'undo') result = commandUndo(room, playerId);
      else if (msg.type === 'act') {
        const ability = String(msg.ability || '');
        const def = abilityById(ability);
        let x = intOrNull(msg.x);
        let z = intOrNull(msg.z);
        if (!def) result = { error: 'Unknown ability.' };
        else if (def.aim !== 'self' && (x == null || z == null)) result = { error: 'Pick a target.' };
        else result = commandAct(room, playerId, ability, x, z);
      } else if (msg.type === 'end') result = commandEnd(room, playerId);
      else if (msg.type === 'buy') result = commandBuy(room, playerId, String(msg.itemId || ''), msg.targetId ? String(msg.targetId) : null);
      else if (msg.type === 'shrine') result = commandShrine(room, playerId, String(msg.upgradeId || ''));
      else if (msg.type === 'level') result = commandLevel(room, playerId, String(msg.choiceId || ''));
      else if (msg.type === 'continue') result = continueForward(room, playerId);
      else if (msg.type === 'lobby') result = returnToLobby(room, playerId);
      else return;

      if (result?.error) {
        replyError(ws, result);
        return;
      }
      broadcast(room, result?.events || []);
    });

    ws.on('close', () => {
      const room = ws.room;
      if (!room) return;
      const player = room.players.find((entry) => entry.id === ws.playerId);
      if (!player || player.ws !== ws) return;
      player.ws = null;
      const result = disconnectPlayer(room, player.id);
      broadcast(room, result?.events || []);
      touch(room);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 20000);
  if (heartbeat.unref) heartbeat.unref();

  function close() {
    clearInterval(heartbeat);
    for (const room of rooms.values()) clearTimeout(room.timer);
    for (const client of wss.clients) client.terminate();
    wss.close();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return {
    server,
    rooms,
    listen(port = 0, host = '0.0.0.0') {
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT) || 47291;
  const app = createApp();
  app.listen(port, '0.0.0.0').then(() => {
    console.log(`Tactics Run listening on 0.0.0.0:${port}`);
  });
}
