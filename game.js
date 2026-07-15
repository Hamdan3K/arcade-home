// NEON RAIDERS - retro pixel-art space shooter
// Player steers the ship in all directions and fires with the space bar.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const waveEl = document.getElementById('wave');
const livesEl = document.getElementById('lives');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const startBtn = document.getElementById('startBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const upBtn = document.getElementById('upBtn');
const downBtn = document.getElementById('downBtn');
const fireBtn = document.getElementById('fireBtn');
const nameEntry = document.getElementById('nameEntry');
const nameInput = document.getElementById('nameInput');
const submitNameBtn = document.getElementById('submitNameBtn');
const leaderboardEl = document.getElementById('leaderboard');
const leaderboardListEl = document.getElementById('leaderboardList');

// ---------- pixel sprite data (0 = empty, 1/2 = palette index) ----------
const SHIP_SPRITE = [
  '....1....',
  '...111...',
  '..11111..',
  '.2222222.',
  '22.2.2.22',
  '22.....22',
  '2.......2',
];
const SHIP_PALETTE = { '1': '#ff5577', '2': '#ff2255' };

const UFO_SPRITE = [
  '..1...1..',
  '.111111.',
  '11111111',
  '.111111.',
  '..11.11..',
];
const UFO_PALETTE = { '1': '#39ff6a' };

const HUMANOID_SPRITE = [
  '...1...',
  '..111..',
  '.1.1.1.',
  '11.1.11',
  '..111..',
  '...1...',
  '..1.1..',
  '.1...1.',
  '1.....1',
];
const HUMANOID_PALETTE = { '1': '#ff4de3' };

function drawSprite(sprite, palette, x, y, pixelSize, glowColor) {
  ctx.save();
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
  }
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === '.' || ch === undefined) continue;
      ctx.fillStyle = palette[ch] || '#fff';
      ctx.fillRect(
        Math.round(x + col * pixelSize),
        Math.round(y + row * pixelSize),
        pixelSize,
        pixelSize
      );
    }
  }
  ctx.restore();
}

function spriteWidth(sprite, pixelSize) {
  return Math.max(...sprite.map(l => l.length)) * pixelSize;
}
function spriteHeight(sprite, pixelSize) {
  return sprite.length * pixelSize;
}

// ---------- starfield ----------
const STAR_COUNT = 90;
const stars = Array.from({ length: STAR_COUNT }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  size: Math.random() < 0.15 ? 2 : 1,
  speed: 20 + Math.random() * 60,
  twinkle: Math.random() * Math.PI * 2,
}));

// ---------- audio (simple retro beeps, no external assets) ----------
let audioCtx = null;
function beep(freq, duration, type = 'square', vol = 0.05) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* audio unsupported, ignore */ }
}
const sfx = {
  shoot: () => beep(880, 0.06, 'square', 0.03),
  alienShoot: () => beep(220, 0.08, 'sawtooth', 0.03),
  explode: () => beep(120, 0.25, 'square', 0.06),
  hit: () => beep(90, 0.3, 'sawtooth', 0.08),
  wave: () => beep(660, 0.4, 'triangle', 0.05),
  highscore: () => beep(1046, 0.5, 'triangle', 0.06),
};

// ---------- leaderboard (persisted top 3) ----------
const LEADERBOARD_KEY = 'neonRaidersLeaderboard';
let leaderboard = [];

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    leaderboard = raw ? JSON.parse(raw) : [];
  } catch (e) {
    leaderboard = [];
  }
}

function saveLeaderboard() {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
  } catch (e) { /* storage unavailable, keep in-memory only */ }
}

function qualifiesForLeaderboard(s) {
  if (s <= 0) return false;
  if (leaderboard.length < 3) return true;
  return s > leaderboard[2].score;
}

function addToLeaderboard(name, s) {
  leaderboard.push({ name: name.slice(0, 10).toUpperCase() || 'PLAYER', score: s });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 3);
  saveLeaderboard();
}

function currentHighScore() {
  return leaderboard.length ? leaderboard[0].score : 0;
}

function renderLeaderboard() {
  leaderboardListEl.innerHTML = '';
  if (!leaderboard.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'NO SCORES YET';
    leaderboardListEl.appendChild(li);
    return;
  }
  leaderboard.forEach((entry, i) => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${i + 1}. ${entry.name}`;
    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = entry.score;
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    leaderboardListEl.appendChild(li);
  });
}

// ---------- player ----------
const PIXEL = 5;
const player = {
  x: W / 2,
  y: H - 70,
  minY: H * 0.5,
  maxY: H - 40,
  speed: 340,
  width: spriteWidth(SHIP_SPRITE, PIXEL),
  height: spriteHeight(SHIP_SPRITE, PIXEL),
  cooldown: 0,
  fireRate: 0.22,
  invuln: 0,
};

let movingLeft = false;
let movingRight = false;
let movingForward = false;  // up, toward the aliens
let movingBackward = false; // down, retreating
let firing = false;

// ---------- entities ----------
let bullets = [];       // player lasers, moving up
let enemyBullets = [];  // alien shots, moving down
let aliens = [];
let particles = [];

let score = 0;
let lives = 3;
let wave = 1;
let running = false;
let gameOver = false;
let awaitingName = false;
let alienDir = 1;
let alienMoveTimer = 0;
let alienFireTimer = 0;

function resetGameState() {
  bullets = [];
  enemyBullets = [];
  particles = [];
  score = 0;
  lives = 3;
  wave = 1;
  gameOver = false;
  awaitingName = false;
  player.x = W / 2;
  player.y = H - 70;
  player.invuln = 1.5;
  spawnWave(wave);
  updateHud();
}

function spawnWave(n) {
  aliens = [];
  const cols = 8;
  const rows = 3 + Math.min(2, Math.floor(n / 3));
  const spacingX = 70;
  const spacingY = 60;
  const startX = (W - (cols - 1) * spacingX) / 2;
  const startY = 60;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isUfo = r % 2 === 0;
      aliens.push({
        x: startX + c * spacingX,
        y: startY + r * spacingY,
        alive: true,
        type: isUfo ? 'ufo' : 'humanoid',
        sprite: isUfo ? UFO_SPRITE : HUMANOID_SPRITE,
        palette: isUfo ? UFO_PALETTE : HUMANOID_PALETTE,
        glow: isUfo ? '#39ff6a' : '#ff4de3',
        bob: Math.random() * Math.PI * 2,
      });
    }
  }
  alienDir = 1;
  alienMoveTimer = 0;
  alienFireTimer = 0;
}

function updateHud() {
  scoreEl.textContent = score;
  highScoreEl.textContent = Math.max(currentHighScore(), score);
  waveEl.textContent = wave;
  livesEl.textContent = '▲'.repeat(Math.max(0, lives));
}

// ---------- input ----------
const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'];

window.addEventListener('keydown', (e) => {
  if (MOVE_KEYS.includes(e.key)) e.preventDefault();
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = true;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = true;
  if (['ArrowUp', 'w', 'W'].includes(e.key)) movingForward = true;
  if (['ArrowDown', 's', 'S'].includes(e.key)) movingBackward = true;
  if (e.key === ' ') {
    if (running) firing = true;
    else if (!awaitingName) startGame();
  }
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = false;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = false;
  if (['ArrowUp', 'w', 'W'].includes(e.key)) movingForward = false;
  if (['ArrowDown', 's', 'S'].includes(e.key)) movingBackward = false;
  if (e.key === ' ') firing = false;
});

function bindHold(btn, onDown, onUp) {
  btn.addEventListener('mousedown', onDown);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev =>
    btn.addEventListener(ev, onUp)
  );
}
bindHold(leftBtn, () => movingLeft = true, () => movingLeft = false);
bindHold(rightBtn, () => movingRight = true, () => movingRight = false);
bindHold(upBtn, () => movingForward = true, () => movingForward = false);
bindHold(downBtn, () => movingBackward = true, () => movingBackward = false);
bindHold(fireBtn, () => firing = true, () => firing = false);

startBtn.addEventListener('click', startGame);

submitNameBtn.addEventListener('click', submitName);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitName();
});

function submitName() {
  const name = nameInput.value.trim() || 'PLAYER';
  addToLeaderboard(name, score);
  awaitingName = false;
  nameEntry.classList.add('hidden');
  leaderboardEl.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  renderLeaderboard();
  updateHud();
  overlayTitle.textContent = 'GAME OVER';
  overlaySub.innerHTML = `SCORE <b>${score}</b> &mdash; WAVE <b>${wave}</b><br>press start to try again`;
  startBtn.textContent = 'PLAY AGAIN';
}

function startGame() {
  overlay.classList.add('hidden');
  resetGameState();
  running = true;
}

function showStartScreen() {
  overlayTitle.textContent = 'NEON RAIDERS';
  overlaySub.innerHTML = 'move <b>◀ ▶ ▲ ▼</b> / <b>WASD</b> to fly &mdash; <b>SPACE</b> to fire';
  startBtn.textContent = 'PRESS START';
  nameEntry.classList.add('hidden');
  leaderboardEl.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  renderLeaderboard();
  overlay.classList.remove('hidden');
}

// ---------- update ----------
let lastTime = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
  lastTime = t;

  updateStars(dt);
  if (running) update(dt);
  render();

  window.requestAnimationFrame(loop);
}

function updateStars(dt) {
  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    s.twinkle += dt * 3;
  }
}

function update(dt) {
  // player movement
  if (movingLeft) player.x -= player.speed * dt;
  if (movingRight) player.x += player.speed * dt;
  if (movingForward) player.y -= player.speed * dt;
  if (movingBackward) player.y += player.speed * dt;
  player.x = Math.max(player.width / 2, Math.min(W - player.width / 2, player.x));
  player.y = Math.max(player.minY, Math.min(player.maxY, player.y));

  if (player.invuln > 0) player.invuln -= dt;

  // fire on space bar / touch fire button
  player.cooldown -= dt;
  if (firing && player.cooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - player.height / 2, vy: -560 });
    player.cooldown = player.fireRate;
    sfx.shoot();
  }

  // move bullets
  bullets.forEach(b => b.y += b.vy * dt);
  bullets = bullets.filter(b => b.y > -20);

  enemyBullets.forEach(b => b.y += b.vy * dt);
  enemyBullets = enemyBullets.filter(b => b.y < H + 20);

  // alien formation movement (classic side-step)
  const aliveAliens = aliens.filter(a => a.alive);
  alienMoveTimer += dt;
  const moveInterval = Math.max(0.15, 0.9 - wave * 0.05 - (1 - aliveAliens.length / aliens.length) * 0.4);
  if (alienMoveTimer > moveInterval) {
    alienMoveTimer = 0;
    let hitEdge = false;
    for (const a of aliveAliens) {
      a.x += alienDir * 14;
      if (a.x < 30 || a.x > W - 30) hitEdge = true;
    }
    if (hitEdge) {
      alienDir *= -1;
      for (const a of aliveAliens) a.y += 18;
    }
  }
  for (const a of aliveAliens) a.bob += dt * 4;

  // alien firing
  alienFireTimer -= dt;
  if (alienFireTimer <= 0 && aliveAliens.length) {
    const shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
    enemyBullets.push({ x: shooter.x, y: shooter.y + 20, vy: 220 + wave * 10 });
    alienFireTimer = Math.max(0.35, 1.1 - wave * 0.06);
    sfx.alienShoot();
  }

  // check aliens reaching player line -> game over
  for (const a of aliveAliens) {
    if (a.y > player.y - 20) {
      endGame();
      return;
    }
  }

  // collisions: player bullets vs aliens
  for (const b of bullets) {
    for (const a of aliveAliens) {
      if (!a.alive) continue;
      const halfW = spriteWidth(a.sprite, PIXEL) / 2;
      const halfH = spriteHeight(a.sprite, PIXEL) / 2;
      if (Math.abs(b.x - a.x) < halfW && Math.abs(b.y - a.y) < halfH) {
        a.alive = false;
        b.hit = true;
        score += a.type === 'ufo' ? 100 : 150;
        spawnExplosion(a.x, a.y, a.glow);
        sfx.explode();
        updateHud();
      }
    }
  }
  bullets = bullets.filter(b => !b.hit);

  // collisions: alien bullets vs player
  if (player.invuln <= 0) {
    for (const b of enemyBullets) {
      if (Math.abs(b.x - player.x) < player.width / 2 && Math.abs(b.y - player.y) < player.height / 2) {
        b.hit = true;
        hitPlayer();
      }
    }
  }
  enemyBullets = enemyBullets.filter(b => !b.hit);

  // particles
  particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
  particles = particles.filter(p => p.life > 0);

  // wave clear
  if (aliens.every(a => !a.alive)) {
    wave += 1;
    sfx.wave();
    spawnWave(wave);
    updateHud();
  }
}

function spawnExplosion(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      color,
    });
  }
}

function hitPlayer() {
  lives -= 1;
  player.invuln = 2;
  spawnExplosion(player.x, player.y, '#ff5577');
  sfx.hit();
  updateHud();
  if (lives <= 0) endGame();
}

function endGame() {
  running = false;
  gameOver = true;
  updateHud();

  if (qualifiesForLeaderboard(score)) {
    awaitingName = true;
    sfx.highscore();
    overlayTitle.textContent = 'NEW TOP SCORE!';
    overlaySub.innerHTML = `SCORE <b>${score}</b> &mdash; WAVE <b>${wave}</b>`;
    nameEntry.classList.remove('hidden');
    leaderboardEl.classList.add('hidden');
    startBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  } else {
    overlayTitle.textContent = 'GAME OVER';
    overlaySub.innerHTML = `SCORE <b>${score}</b> &mdash; WAVE <b>${wave}</b><br>press start to try again`;
    startBtn.textContent = 'PLAY AGAIN';
    nameEntry.classList.add('hidden');
    leaderboardEl.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    renderLeaderboard();
    overlay.classList.remove('hidden');
  }
}

// ---------- render ----------
function render() {
  ctx.clearRect(0, 0, W, H);

  // background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#050518');
  grad.addColorStop(1, '#01010a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // stars
  for (const s of stars) {
    const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle));
    ctx.fillStyle = `rgba(180, 220, 255, ${alpha})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }

  // player bullets (glowing cyan beams)
  for (const b of bullets) {
    drawGlowBeam(b.x, b.y, 24, '#39e0ff');
  }
  // enemy bullets (glowing green)
  for (const b of enemyBullets) {
    drawGlowBeam(b.x, b.y, 16, '#4dff6a');
  }

  // aliens
  for (const a of aliens) {
    if (!a.alive) continue;
    const bobOffset = Math.sin(a.bob) * 3;
    const w = spriteWidth(a.sprite, PIXEL);
    const h = spriteHeight(a.sprite, PIXEL);
    drawSprite(a.sprite, a.palette, a.x - w / 2, a.y - h / 2 + bobOffset, PIXEL, a.glow);
  }

  // particles
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 0.6);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(p.x, p.y, 3, 3);
    ctx.restore();
  }

  // player ship
  if (running || gameOver) {
    const blink = player.invuln > 0 ? Math.floor(player.invuln * 10) % 2 === 0 : true;
    if (blink) {
      drawSprite(
        SHIP_SPRITE, SHIP_PALETTE,
        player.x - player.width / 2, player.y - player.height / 2,
        PIXEL, '#ff3366'
      );
    }
  }
}

function drawGlowBeam(x, y, len, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - len / 2);
  ctx.lineTo(x, y + len / 2);
  ctx.stroke();
  ctx.restore();
}

loadLeaderboard();
showStartScreen();
updateHud();
requestAnimationFrame(loop);
