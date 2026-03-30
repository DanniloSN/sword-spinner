'use strict';

require("dotenv").config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

const { CHARACTERS, transformSword } = require('./public/js/characters.js');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const ARENA_SIZE = 900;
const PLAYER_SPEED = 185;
const RESPAWN_TIME = 3;
const MAX_PLAYERS_PER_ROOM = 8;

// ─── COLLISION MATH ──────────────────────────────────────────────────────────

function getEdges(poly) {
  const edges = [];
  for (let i = 0; i < poly.length; i++) {
    edges.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  return edges;
}

function segmentsIntersect([x1, y1], [x2, y2], [x3, y3], [x4, y4]) {
  const d1x = x2 - x1, d1y = y2 - y1;
  const d2x = x4 - x3, d2y = y4 - y3;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-8) return false;
  const t = ((x3 - x1) * d2y - (y3 - y1) * d2x) / cross;
  const u = ((x3 - x1) * d1y - (y3 - y1) * d1x) / cross;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

function polygonPolygonCollide(poly1, poly2) {
  for (const [a, b] of getEdges(poly1)) {
    for (const [c, d] of getEdges(poly2)) {
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function segmentCircleCollide([ax, ay], [bx, by], cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonCircleCollide(poly, cx, cy, r) {
  if (pointInPolygon(cx, cy, poly)) return true;
  for (const [a, b] of getEdges(poly)) {
    if (segmentCircleCollide(a, b, cx, cy, r)) return true;
  }
  return false;
}

// ─── GAME ROOM ───────────────────────────────────────────────────────────────

class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.swordCollisions = new Set();
    this.lastTime = Date.now();
    this.tick = 0;
    this.interval = null;
  }

  start() {
    this.lastTime = Date.now();
    this.interval = setInterval(() => this.update(), 1000 / TICK_RATE);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  spawnPosition() {
    const margin = 80;
    return {
      x: margin + Math.random() * (ARENA_SIZE - margin * 2),
      y: margin + Math.random() * (ARENA_SIZE - margin * 2)
    };
  }

  addPlayer(socketId, { name, characterId }) {
    const pos = this.spawnPosition();
    const player = {
      id: socketId,
      name: String(name).substring(0, 20).trim() || 'Player',
      characterId: CHARACTERS[characterId] ? characterId : 'warrior',
      x: pos.x,
      y: pos.y,
      angle: Math.random() * Math.PI * 2,
      rotDir: Math.random() > 0.5 ? 1 : -1,
      vx: 0,
      vy: 0,
      input: { dx: 0, dy: 0 },
      alive: true,
      respawnTimer: 0,
      kills: 0,
      deaths: 0,
      invincible: 2.5
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    for (const key of this.swordCollisions) {
      if (key.includes(socketId)) this.swordCollisions.delete(key);
    }
  }

  respawnPlayer(player) {
    const pos = this.spawnPosition();
    player.alive = true;
    player.x = pos.x;
    player.y = pos.y;
    player.vx = 0;
    player.vy = 0;
    player.angle = Math.random() * Math.PI * 2;
    player.rotDir = Math.random() > 0.5 ? 1 : -1;
    player.invincible = 2.5;
  }

  update() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.tick++;

    const alivePlayers = [];

    for (const player of this.players.values()) {
      if (!player.alive) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) this.respawnPlayer(player);
        continue;
      }

      if (player.invincible > 0) player.invincible -= dt;

      const char = CHARACTERS[player.characterId];
      player.angle += char.rotationSpeed * player.rotDir * dt;

      const { dx, dy } = player.input;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.05) {
        const nx = dx / len, ny = dy / len;
        player.vx += nx * PLAYER_SPEED * 10 * dt;
        player.vy += ny * PLAYER_SPEED * 10 * dt;
      }

      const spd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      if (spd > PLAYER_SPEED) {
        player.vx = (player.vx / spd) * PLAYER_SPEED;
        player.vy = (player.vy / spd) * PLAYER_SPEED;
      }

      player.vx *= 0.86;
      player.vy *= 0.86;

      player.x += player.vx * dt;
      player.y += player.vy * dt;

      const r = char.bodyRadius + 4;
      if (player.x < r) { player.x = r; player.vx = Math.abs(player.vx) * 0.4; }
      if (player.x > ARENA_SIZE - r) { player.x = ARENA_SIZE - r; player.vx = -Math.abs(player.vx) * 0.4; }
      if (player.y < r) { player.y = r; player.vy = Math.abs(player.vy) * 0.4; }
      if (player.y > ARENA_SIZE - r) { player.y = ARENA_SIZE - r; player.vy = -Math.abs(player.vy) * 0.4; }

      alivePlayers.push(player);
    }

    this.checkCollisions(alivePlayers);

    io.to(this.id).emit('state', this.getState());
  }

  checkCollisions(alivePlayers) {
    const newCollisions = new Set();
    const killed = new Set();

    for (let i = 0; i < alivePlayers.length; i++) {
      const attacker = alivePlayers[i];
      if (attacker.invincible > 0) continue;
      const aChar = CHARACTERS[attacker.characterId];

      for (let si = 0; si < aChar.swords.length; si++) {
        const sPoly = transformSword(aChar.swords[si], attacker.x, attacker.y, attacker.angle);

        for (let j = 0; j < alivePlayers.length; j++) {
          if (i === j) continue;
          const defender = alivePlayers[j];
          if (killed.has(defender.id)) continue;
          const dChar = CHARACTERS[defender.characterId];

          // Sword vs sword — check before body to give priority
          let hitSword = false;
          for (let sj = 0; sj < dChar.swords.length; sj++) {
            const dPoly = transformSword(dChar.swords[sj], defender.x, defender.y, defender.angle);
            const pairKey = [`${attacker.id}:${si}`, `${defender.id}:${sj}`].sort().join('|');

            if (polygonPolygonCollide(sPoly, dPoly)) {
              hitSword = true;
              newCollisions.add(pairKey);
              if (!this.swordCollisions.has(pairKey)) {
                attacker.rotDir *= -1;
                defender.rotDir *= -1;
                io.to(this.id).emit('swordClash', {
                  x: (attacker.x + defender.x) / 2,
                  y: (attacker.y + defender.y) / 2
                });
              }
            }
          }

          // Sword vs body — only if sword didn't clash with defender's swords
          if (!hitSword && defender.invincible <= 0 &&
              polygonCircleCollide(sPoly, defender.x, defender.y, dChar.bodyRadius * 0.85)) {
            killed.add(defender.id);
            defender.alive = false;
            defender.deaths++;
            defender.respawnTimer = RESPAWN_TIME;
            attacker.kills++;
            io.to(this.id).emit('kill', {
              killer: attacker.id,
              victim: defender.id,
              killerName: attacker.name,
              victimName: defender.name
            });
          }
        }
      }
    }

    this.swordCollisions = newCollisions;
  }

  getState() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        name: p.name,
        characterId: p.characterId,
        x: p.x,
        y: p.y,
        angle: p.angle,
        rotDir: p.rotDir,
        alive: p.alive,
        respawnTimer: p.respawnTimer,
        kills: p.kills,
        deaths: p.deaths,
        invincible: p.invincible > 0
      });
    }
    return { tick: this.tick, players };
  }

  get playerCount() {
    return this.players.size;
  }
}

// ─── ROOM MANAGEMENT ─────────────────────────────────────────────────────────

const rooms = new Map();

function findOrCreateRoom() {
  for (const room of rooms.values()) {
    if (room.playerCount < MAX_PLAYERS_PER_ROOM) return room;
  }
  const id = `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const room = new GameRoom(id);
  room.start();
  rooms.set(id, room);
  return room;
}

function cleanupRoom(room) {
  if (room.playerCount === 0) {
    room.stop();
    rooms.delete(room.id);
    console.log(`Room ${room.id} removed`);
  }
}

// ─── SOCKET HANDLERS ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`+ ${socket.id}`);
  let currentRoom = null;

  socket.on('join', ({ name, characterId }) => {
    if (currentRoom) return;
    const room = findOrCreateRoom();
    currentRoom = room;
    socket.join(room.id);
    room.addPlayer(socket.id, { name, characterId });

    socket.emit('joined', {
      playerId: socket.id,
      roomId: room.id,
      arenaSize: ARENA_SIZE
    });

    console.log(`${name} → ${room.id} (${room.playerCount} players)`);
  });

  socket.on('input', ({ dx, dy }) => {
    if (!currentRoom) return;
    const p = currentRoom.players.get(socket.id);
    if (p) {
      p.input.dx = Math.max(-1, Math.min(1, dx || 0));
      p.input.dy = Math.max(-1, Math.min(1, dy || 0));
    }
  });

  socket.on('changeCharacter', ({ characterId }) => {
    if (!currentRoom || !CHARACTERS[characterId]) return;
    const p = currentRoom.players.get(socket.id);
    if (p) {
      p.characterId = characterId;
      p.alive = false;
      p.respawnTimer = 0.3;
    }
  });

  socket.on('disconnect', () => {
    console.log(`- ${socket.id}`);
    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
      io.to(currentRoom.id).emit('playerLeft', { id: socket.id });
      cleanupRoom(currentRoom);
      currentRoom = null;
    }
  });
});

// ─── START ───────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`SwordSpinner running → http://localhost:${PORT}`);
});
