// NEON RAIDERS - retro pixel-art space shooter
// Ship auto-fires; player only steers left/right to aim.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const scoreEl = document.getElementById('score');
const waveEl = document.getElementById('wave');
const livesEl = document.getElementById('lives');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const startBtn = document.getElementById('startBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');

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
};

// ---------- player ----------
const PIXEL = 5;
const player = {
  x: W / 2,
  y: H - 70,
  speed: 340,
  width: spriteWidth(SHIP_SPRITE, PIXEL),
  height: spriteHeight(SHIP_SPRITE, PIXEL),
  cooldown: 0,
  fireRate: 0.28,
  invuln: 0,
};

let movingLeft = false;
let movingRight = false;

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
let alienDir = 1;
let alienStepDown = 0;
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
  player.x = W / 2;
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
  alienStepDown = 0;
  alienMoveTimer = 0;
  alienFireTimer = 0;
}

function updateHud() {
  scoreEl.textContent = score;
  waveEl.textContent = wave;
  livesEl.textContent = '▲'.repeat(Math.max(0, lives));
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = true;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = true;
  if (e.key === ' ' && !running) startGame();
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = false;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = false;
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

startBtn.addEventListener('click', startGame);

function startGame() {
  overlay.classList.add('hidden');
  resetGameState();
  running = true;
}

function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.innerHTML = sub;
  overlay.classList.remove('hidden');
  running = false;
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
  player.x = Math.max(player.width / 2, Math.min(W - player.width / 2, player.x));

  if (player.invuln > 0) player.invuln -= dt;

  // auto fire
  player.cooldown -= dt;
  if (player.cooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - player.height / 2, vy: -520 });
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
  showOverlay(
    'GAME OVER',
    `SCORE <b>${score}</b> &mdash; WAVE <b>${wave}</b><br>press start to try again`
  );
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

requestAnimationFrame(loop);
