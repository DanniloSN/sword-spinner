'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────

const G = {
  socket: null,
  playerId: null,
  gameState: null,
  arenaSize: 900,
  screen: 'lobby',
  selectedChar: 'warrior',
  keys: {},
  touch: { active: false, startX: 0, startY: 0, knobX: 0, knobY: 0, dx: 0, dy: 0 },
  camera: { x: 0, y: 0 },
  particles: [],
  clashes: [],
  lastInputSent: 0,
  scale: 1
};

// ─── DOM ─────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const lobbyScreen   = $('lobby-screen');
const gameScreen    = $('game-screen');
const canvas        = $('game-canvas');
const ctx           = canvas.getContext('2d');
const nameInput     = $('player-name');
const playBtn       = $('play-btn');
const killFeedEl    = $('kill-feed');
const charPicker    = $('char-picker');
const changeCharBtn = $('change-char-btn');
const closePicker   = $('close-picker');
const joystickZone  = $('joystick-zone');
const joystickBase  = $('joystick-base');
const joystickKnob  = $('joystick-knob');
const pickerGrid    = $('picker-grid');

// ─── LOBBY SETUP ─────────────────────────────────────────────────────────────

function buildCharGrid(containerEl, onClick) {
  containerEl.innerHTML = '';
  for (const [id, char] of Object.entries(GameCharacters.CHARACTERS)) {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.dataset.id = id;

    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'char-preview';
    previewCanvas.width = 80;
    previewCanvas.height = 80;

    const nameEl = document.createElement('div');
    nameEl.className = 'char-name';
    nameEl.textContent = char.name;

    const descEl = document.createElement('div');
    descEl.className = 'char-desc';
    descEl.textContent = char.description;

    card.append(previewCanvas, nameEl, descEl);
    card.addEventListener('click', () => onClick(id, containerEl));
    containerEl.appendChild(card);
    drawCharPreview(previewCanvas, char);
  }
}

function setSelected(containerId, charId) {
  document.querySelectorAll(`#${containerId} .char-card`).forEach(c => {
    c.classList.toggle('selected', c.dataset.id === charId);
  });
}

function drawCharPreview(cvs, char) {
  const c = cvs.getContext('2d');
  const cx = 40, cy = 40;
  const angle = Math.PI * 0.15;
  c.clearRect(0, 0, 80, 80);

  for (const sword of char.swords) {
    const poly = GameCharacters.transformSword(sword, cx, cy, angle);
    c.beginPath();
    c.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) c.lineTo(poly[i][0], poly[i][1]);
    c.closePath();
    c.fillStyle = char.accentColor;
    c.shadowColor = char.accentColor;
    c.shadowBlur = 8;
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 0.8;
    c.stroke();
  }

  const grad = c.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, char.bodyRadius * 0.85);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.4, char.color);
  grad.addColorStop(1, char.accentColor);

  c.beginPath();
  c.arc(cx, cy, char.bodyRadius * 0.85, 0, Math.PI * 2);
  c.fillStyle = grad;
  c.shadowColor = char.color;
  c.shadowBlur = 10;
  c.fill();
  c.shadowBlur = 0;
}

function initLobby() {
  const charGrid = $('character-grid');
  buildCharGrid(charGrid, (id) => {
    G.selectedChar = id;
    setSelected('character-grid', id);
  });
  setSelected('character-grid', G.selectedChar);

  buildCharGrid(pickerGrid, (id) => {
    G.selectedChar = id;
    setSelected('picker-grid', id);
    if (G.socket) G.socket.emit('changeCharacter', { characterId: id });
    charPicker.style.display = 'none';
  });

  playBtn.addEventListener('click', joinGame);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });

  changeCharBtn.addEventListener('click', () => {
    setSelected('picker-grid', G.selectedChar);
    charPicker.style.display = 'flex';
  });

  closePicker.addEventListener('click', () => {
    charPicker.style.display = 'none';
  });
}

// ─── NETWORKING ──────────────────────────────────────────────────────────────

function joinGame() {
  const name = nameInput.value.trim() || 'Jogador';
  playBtn.disabled = true;
  playBtn.querySelector('span').textContent = 'Conectando...';

  G.socket = io({ transports: ['websocket'] });

  G.socket.on('connect', () => {
    G.socket.emit('join', { name, characterId: G.selectedChar });
  });

  G.socket.on('joined', ({ playerId, arenaSize }) => {
    G.playerId = playerId;
    G.arenaSize = arenaSize;
    showScreen('game');
    resizeCanvas();
  });

  G.socket.on('state', (state) => {
    G.gameState = state;
  });

  G.socket.on('kill', (data) => {
    addKillEntry(data);
    if (data.victim === G.playerId) spawnDeathParticles();
  });

  G.socket.on('swordClash', ({ x, y }) => {
    G.clashes.push({ x, y, t: 1.0 });
    spawnClashParticles(x, y);
  });

  G.socket.on('disconnect', () => {
    showScreen('lobby');
    playBtn.disabled = false;
    playBtn.querySelector('span').textContent = 'JOGAR';
    G.gameState = null;
    G.playerId = null;
  });

  G.socket.on('connect_error', () => {
    playBtn.disabled = false;
    playBtn.querySelector('span').textContent = 'JOGAR';
  });
}

// ─── INPUT ───────────────────────────────────────────────────────────────────

function setupInput() {
  window.addEventListener('keydown', e => {
    G.keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => { G.keys[e.code] = false; });

  const JOYSTICK_RADIUS = 55;

  joystickZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const rect = joystickZone.getBoundingClientRect();
    G.touch.active = true;
    G.touch.startX = t.clientX - rect.left;
    G.touch.startY = t.clientY - rect.top;
    G.touch.knobX = G.touch.startX;
    G.touch.knobY = G.touch.startY;
    G.touch.dx = 0;
    G.touch.dy = 0;

    joystickBase.style.left = (G.touch.startX - 55) + 'px';
    joystickBase.style.bottom = 'auto';
    joystickBase.style.top = (G.touch.startY - 55) + 'px';
    joystickKnob.style.display = 'block';
    joystickKnob.style.left = G.touch.startX + 'px';
    joystickKnob.style.top  = G.touch.startY + 'px';
  }, { passive: false });

  joystickZone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!G.touch.active) return;
    const t = e.changedTouches[0];
    const rect = joystickZone.getBoundingClientRect();
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;
    const dx = x - G.touch.startX;
    const dy = y - G.touch.startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(len, JOYSTICK_RADIUS);
    const nx = len > 0.5 ? dx / len : 0;
    const ny = len > 0.5 ? dy / len : 0;
    G.touch.dx = nx * (clamped / JOYSTICK_RADIUS);
    G.touch.dy = ny * (clamped / JOYSTICK_RADIUS);
    joystickKnob.style.left = (G.touch.startX + nx * clamped) + 'px';
    joystickKnob.style.top  = (G.touch.startY + ny * clamped) + 'px';
  }, { passive: false });

  const endTouch = e => {
    e.preventDefault();
    G.touch.active = false;
    G.touch.dx = 0;
    G.touch.dy = 0;
    joystickKnob.style.display = 'none';
    joystickBase.style.left = '50%';
    joystickBase.style.top  = 'auto';
    joystickBase.style.bottom = '30px';
  };

  joystickZone.addEventListener('touchend',    endTouch, { passive: false });
  joystickZone.addEventListener('touchcancel', endTouch, { passive: false });
}

function getInput() {
  let dx = 0, dy = 0;
  if (G.keys['ArrowLeft']  || G.keys['KeyA']) dx -= 1;
  if (G.keys['ArrowRight'] || G.keys['KeyD']) dx += 1;
  if (G.keys['ArrowUp']    || G.keys['KeyW']) dy -= 1;
  if (G.keys['ArrowDown']  || G.keys['KeyS']) dy += 1;
  if (G.touch.active) { dx = G.touch.dx; dy = G.touch.dy; }
  return { dx, dy };
}

function tickInput() {
  if (!G.socket || !G.playerId) return;
  const now = performance.now();
  if (now - G.lastInputSent >= 14) {
    G.socket.emit('input', getInput());
    G.lastInputSent = now;
  }
}

// ─── CANVAS RESIZE ───────────────────────────────────────────────────────────

function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const size = Math.min(w, h, 900);
  canvas.width  = size;
  canvas.height = size;
  G.scale = size / G.arenaSize;
  G.camera.x = 0;
  G.camera.y = 0;
}

// ─── PARTICLES ───────────────────────────────────────────────────────────────

function spawnParticles(x, y, count, color, speed, life) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const s = speed * (0.5 + Math.random());
    G.particles.push({
      x, y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      life, maxLife: life,
      size: 2 + Math.random() * 3,
      color
    });
  }
}

function spawnDeathParticles() {
  const p = G.gameState?.players.find(p => p.id === G.playerId);
  if (!p) return;
  const char = GameCharacters.CHARACTERS[p.characterId];
  spawnParticles(p.x, p.y, 30, char.color, 180, 1.2);
  spawnParticles(p.x, p.y, 15, '#fff',      220, 0.6);
}

function spawnClashParticles(x, y) {
  spawnParticles(x, y, 12, '#fff',    140, 0.5);
  spawnParticles(x, y,  8, '#f1c40f', 100, 0.7);
}

function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.clashes.length - 1; i >= 0; i--) {
    G.clashes[i].t -= dt * 3;
    if (G.clashes[i].t <= 0) G.clashes.splice(i, 1);
  }
}

// ─── RENDERING ───────────────────────────────────────────────────────────────

let lastFrameTime = 0;

function renderLoop(now) {
  requestAnimationFrame(renderLoop);
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  tickInput();
  updateParticles(dt);

  if (G.screen !== 'game') return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!G.gameState) return;

  const local = G.gameState.players.find(p => p.id === G.playerId);

  // Smooth camera follow
  if (local && local.alive) {
    const tx = local.x * G.scale - canvas.width  / 2;
    const ty = local.y * G.scale - canvas.height / 2;
    const maxCam = (G.arenaSize * G.scale) - canvas.width;
    G.camera.x += (Math.max(0, Math.min(maxCam, tx)) - G.camera.x) * 0.12;
    G.camera.y += (Math.max(0, Math.min(maxCam, ty)) - G.camera.y) * 0.12;
  }

  ctx.save();
  ctx.translate(-G.camera.x, -G.camera.y);
  ctx.scale(G.scale, G.scale);

  drawArena();
  drawParticles();

  for (const p of G.gameState.players) {
    if (p.alive) drawPlayer(p, p.id === G.playerId);
  }

  drawClashes();

  ctx.restore();

  drawHUD(local);
}

function drawArena() {
  const sz = G.arenaSize;

  // Background
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(0, 0, sz, sz);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= sz; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, sz); ctx.stroke();
  }
  for (let y = 0; y <= sz; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(sz, y); ctx.stroke();
  }

  // Inner glow border
  const bw = 6;
  const grad = ctx.createLinearGradient(0, 0, sz, 0);
  grad.addColorStop(0,   '#e74c3c');
  grad.addColorStop(0.5, '#f39c12');
  grad.addColorStop(1,   '#e74c3c');
  ctx.strokeStyle = grad;
  ctx.lineWidth = bw;
  ctx.shadowColor = '#e74c3c';
  ctx.shadowBlur = 18;
  ctx.strokeRect(bw / 2, bw / 2, sz - bw, sz - bw);
  ctx.shadowBlur = 0;
}

function drawPlayer(player, isLocal) {
  const char = GameCharacters.CHARACTERS[player.characterId];
  if (!char) return;

  const alpha = player.invincible ? 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 90)) : 1;
  ctx.globalAlpha = alpha;

  // Draw swords
  for (const sword of char.swords) {
    const poly = GameCharacters.transformSword(sword, player.x, player.y, player.angle);

    // Sword glow trail
    ctx.shadowColor = char.trailColor;
    ctx.shadowBlur = 14;

    const tipIdx = Math.floor(poly.length / 2);
    const tip = poly[tipIdx];
    const base = poly[0];
    const sGrad = ctx.createLinearGradient(base[0], base[1], tip[0], tip[1]);
    sGrad.addColorStop(0, char.color);
    sGrad.addColorStop(0.6, char.accentColor);
    sGrad.addColorStop(1, '#ffffff');

    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    ctx.fillStyle = sGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Body
  ctx.shadowColor = char.color;
  ctx.shadowBlur = isLocal ? 20 : 12;

  const bodyGrad = ctx.createRadialGradient(
    player.x - char.bodyRadius * 0.3, player.y - char.bodyRadius * 0.35, 1,
    player.x, player.y, char.bodyRadius
  );
  bodyGrad.addColorStop(0, '#ffffff');
  bodyGrad.addColorStop(0.35, char.color);
  bodyGrad.addColorStop(1, char.accentColor);

  ctx.beginPath();
  ctx.arc(player.x, player.y, char.bodyRadius, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  if (isLocal) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // Name tag
  const fontSize = Math.max(9, char.bodyRadius * 0.72);
  ctx.font = `700 ${fontSize}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const labelY = player.y - char.bodyRadius - 5;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  const tw = ctx.measureText(player.name).width;
  ctx.fillRect(player.x - tw / 2 - 3, labelY - fontSize - 1, tw + 6, fontSize + 3);

  ctx.fillStyle = isLocal ? '#f1c40f' : 'rgba(255,255,255,0.85)';
  ctx.fillText(player.name, player.x, labelY);
  ctx.textBaseline = 'alphabetic';
}

function drawParticles() {
  for (const p of G.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawClashes() {
  for (const cl of G.clashes) {
    const r = (1 - cl.t) * 30 + 5;
    ctx.strokeStyle = `rgba(241,196,15,${cl.t * 0.9})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#f1c40f';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cl.x, cl.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function drawHUD(local) {
  if (!G.gameState) return;
  const players = G.gameState.players;

  // Leaderboard
  const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const lbW = 158, lbPad = 12, rowH = 18, headerH = 26;
  const lbH = headerH + sorted.length * rowH + lbPad;
  const lbX = 10, lbY = 10;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, lbX, lbY, lbW, lbH, 8);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, lbX, lbY, lbW, headerH, 8, true);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PLACAR', lbX + lbPad, lbY + 16);

  ctx.font = '11px Segoe UI, sans-serif';
  sorted.forEach((p, i) => {
    const y = lbY + headerH + i * rowH + 13;
    const isMe = p.id === G.playerId;
    const char = GameCharacters.CHARACTERS[p.characterId];

    if (char) {
      ctx.fillStyle = char.color;
      ctx.beginPath();
      ctx.arc(lbX + lbPad + 4, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isMe ? '#f1c40f' : 'rgba(255,255,255,0.82)';
    const nameStr = p.name.length > 11 ? p.name.slice(0, 10) + '…' : p.name;
    ctx.fillText(nameStr, lbX + lbPad + 12, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`${p.kills}/${p.deaths}`, lbX + lbW - lbPad, y);
    ctx.textAlign = 'left';
  });

  // Death / respawn overlay
  if (local && !local.alive) {
    const ow = 220, oh = 70;
    const ox = canvas.width / 2 - ow / 2;
    const oy = canvas.height / 2 - oh / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundRect(ctx, ox, oy, ow, oh, 12);
    ctx.fill();

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 18px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Você foi eliminado!', canvas.width / 2, oy + 26);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '13px Segoe UI, sans-serif';
    const secs = Math.ceil(local.respawnTimer);
    ctx.fillText(`Renascendo em ${secs}s…`, canvas.width / 2, oy + 52);
    ctx.textAlign = 'left';
  }

  // Invincibility indicator
  if (local && local.invincible) {
    ctx.fillStyle = 'rgba(52,152,219,0.18)';
    roundRect(ctx, canvas.width / 2 - 60, canvas.height - 36, 120, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#74b9ff';
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ INVENCÍVEL ✦', canvas.width / 2, canvas.height - 20);
    ctx.textAlign = 'left';
  }
}

function roundRect(ctx, x, y, w, h, r, topOnly) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  if (topOnly) {
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
  } else {
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  }
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── KILL FEED ───────────────────────────────────────────────────────────────

function addKillEntry({ killerName, victimName }) {
  const el = document.createElement('div');
  el.className = 'kill-entry';
  el.innerHTML = `<span class="killer">${esc(killerName)}</span> cortou <span class="victim">${esc(victimName)}</span>`;
  killFeedEl.appendChild(el);
  while (killFeedEl.children.length > 6) killFeedEl.removeChild(killFeedEl.firstChild);
  setTimeout(() => el.remove(), 5000);
}

function esc(str) {
  return String(str).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
}

// ─── SCREEN MANAGEMENT ───────────────────────────────────────────────────────

function showScreen(name) {
  G.screen = name;
  lobbyScreen.style.display = name === 'lobby' ? 'flex' : 'none';
  gameScreen.style.display  = name === 'game'  ? 'block' : 'none';
}

// ─── BOOT ────────────────────────────────────────────────────────────────────

function init() {
  initLobby();
  setupInput();
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (G.screen !== 'game') return;
  });
  requestAnimationFrame(renderLoop);
}

document.addEventListener('DOMContentLoaded', init);
