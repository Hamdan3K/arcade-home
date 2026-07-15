// DK - retro climbing race
// Player (DK) and CPU (MARIO) both start at the bottom and race to the top platform,
// dodging rolling barrels along the way. Original pixel art, not traced from any game.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const LEVELS = 8; // platform rows, index 0 = bottom, LEVELS-1 = top/goal
const TOP_MARGIN = 60, BOTTOM_MARGIN = 60;
const SPACING = (H - TOP_MARGIN - BOTTOM_MARGIN) / (LEVELS - 1);
const platformY = Array.from({ length: LEVELS }, (_, i) => H - BOTTOM_MARGIN - i * SPACING);
const STAGE_L = 40, STAGE_R = W - 40;

// ladder x-positions per gap (between level i and i+1), zigzag pattern
const LADDERS = [
  [150, 410], // 0 -> 1
  [280],      // 1 -> 2
  [110, 450], // 2 -> 3
  [280],      // 3 -> 4
  [150, 410], // 4 -> 5
  [110, 450], // 5 -> 6
  [280],      // 6 -> 7 (goal)
];
const LADDER_HALF_WIDTH = 18;

// static spike hazards fixed on certain platforms (in addition to rolling barrels) - jump to clear them
const SPIKES = [
  { level: 1, x: 350 },
  { level: 2, x: 200 },
  { level: 3, x: 380 },
  { level: 4, x: 180 },
  { level: 5, x: 320 },
  { level: 6, x: 250 },
];

const PLAYER_SPEED = 150;
const CPU_SPEED = 150; // kept identical to the player's speed on purpose

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const progressEl = document.getElementById('progress');
const livesEl = document.getElementById('lives');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const startBtn = document.getElementById('startBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const upBtn = document.getElementById('upBtn');
const downBtn = document.getElementById('downBtn');
const jumpBtn = document.getElementById('jumpBtn');
const nameEntry = document.getElementById('nameEntry');
const nameInput = document.getElementById('nameInput');
const submitNameBtn = document.getElementById('submitNameBtn');
const leaderboardEl = document.getElementById('leaderboard');
const leaderboardListEl = document.getElementById('leaderboardList');
const restartBtn = document.getElementById('restartBtn');

// ---------- audio ----------
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
  jump: () => beep(500, 0.1, 'square', 0.05),
  climb: () => beep(300, 0.05, 'triangle', 0.03),
  hit: () => beep(90, 0.35, 'sawtooth', 0.08),
  dodge: () => beep(700, 0.05, 'triangle', 0.03),
  levelup: () => beep(660, 0.15, 'triangle', 0.05),
  win: () => beep(880, 0.5, 'triangle', 0.07),
  lose: () => beep(120, 0.5, 'sawtooth', 0.07),
  highscore: () => beep(1046, 0.5, 'triangle', 0.06),
};

// ---------- leaderboard (separate storage from the other games) ----------
const LEADERBOARD_KEY = 'dkLeaderboard';
let leaderboard = [];
function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    leaderboard = raw ? JSON.parse(raw) : [];
  } catch (e) { leaderboard = []; }
}
function saveLeaderboard() {
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard)); } catch (e) { /* unavailable */ }
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
function currentHighScore() { return leaderboard.length ? leaderboard[0].score : 0; }
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

// ---------- racers ----------
function makeRacer(x) {
  return {
    x, level: 0, climbProgress: 0, climbing: false, climbLadderX: 0, climbDir: 0,
    jumping: false, jumpTime: 0, stunned: 0, reachedTop: false,
  };
}

let player, cpu;
let score = 0;
let lives = 3;
let running = false;
let gameOver = false;
let awaitingName = false;
let barrels = [];
let barrelTimer = 0;
let elapsed = 0;
let particles = [];
let maxLevelReached = 0;
let phase = 'countdown'; // 'countdown' | 'racing'
let countdownTime = 0;
let cpuReactionDelay = 0;
let cheatFlash = 0;
const COUNTDOWN_STAGE = 0.8;

function resetGame() {
  player = makeRacer(W / 2 - 40);
  cpu = makeRacer(W / 2 + 40);
  score = 0;
  lives = 3;
  gameOver = false;
  awaitingName = false;
  barrels = [];
  barrelTimer = 2.2;
  elapsed = 0;
  particles = [];
  maxLevelReached = 0;
  phase = 'countdown';
  countdownTime = COUNTDOWN_STAGE * 4;
  cpuReactionDelay = 0.4;
  cheatFlash = 0;
  updateHud();
}

function updateHud() {
  scoreEl.textContent = score;
  highScoreEl.textContent = Math.max(currentHighScore(), score);
  progressEl.textContent = `${player.level}/${LEVELS - 1}`;
  livesEl.textContent = '●'.repeat(Math.max(0, lives));
}

// ---------- input ----------
let movingLeft = false, movingRight = false, movingUp = false, movingDown = false, jumpPressed = false;
const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'];
window.addEventListener('keydown', (e) => {
  if (MOVE_KEYS.includes(e.key)) e.preventDefault();
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = true;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = true;
  if (['ArrowUp', 'w', 'W'].includes(e.key)) movingUp = true;
  if (['ArrowDown', 's', 'S'].includes(e.key)) movingDown = true;
  if (e.key === ' ') jumpPressed = true;
  if ((e.key === 'r' || e.key === 'R') && running) restartGame();
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault();
    if (running && phase === 'racing' && !cpu.reachedTop) {
      cpu.stunned = Math.max(cpu.stunned, 5);
      cheatFlash = 1.5;
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = false;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = false;
  if (['ArrowUp', 'w', 'W'].includes(e.key)) movingUp = false;
  if (['ArrowDown', 's', 'S'].includes(e.key)) movingDown = false;
});

function bindHold(btn, onDown, onUp) {
  btn.addEventListener('mousedown', onDown);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => btn.addEventListener(ev, onUp));
}
bindHold(leftBtn, () => movingLeft = true, () => movingLeft = false);
bindHold(rightBtn, () => movingRight = true, () => movingRight = false);
bindHold(upBtn, () => movingUp = true, () => movingUp = false);
bindHold(downBtn, () => movingDown = true, () => movingDown = false);
bindHold(jumpBtn, () => jumpPressed = true, () => {});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', restartGame);
submitNameBtn.addEventListener('click', submitName);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitName(); });

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
  overlaySub.innerHTML = `SCORE <b>${score}</b>`;
  startBtn.textContent = 'PLAY AGAIN';
}

function startGame() {
  overlay.classList.add('hidden');
  resetGame();
  running = true;
  restartBtn.classList.remove('hidden');
}

function restartGame() {
  resetGame();
  running = true;
}

function showStartScreen() {
  overlayTitle.textContent = 'DK';
  overlaySub.innerHTML = 'move <b>◀ ▶</b> / <b>A D</b> &mdash; <b>▲ ▼</b> / <b>W S</b> to climb ladders &mdash; <b>SPACE</b> to jump barrels &mdash; race MARIO to the top!';
  startBtn.textContent = 'PRESS START';
  nameEntry.classList.add('hidden');
  leaderboardEl.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  renderLeaderboard();
  overlay.classList.remove('hidden');
  restartBtn.classList.add('hidden');
}

// ---------- ladder helpers ----------
function laddersForGap(level) { return LADDERS[level] || []; }
function nearestLadderX(level, x) {
  const opts = laddersForGap(level);
  if (!opts.length) return null;
  return opts.reduce((best, lx) => Math.abs(lx - x) < Math.abs(best - x) ? lx : best, opts[0]);
}
function onLadder(level, x) {
  return laddersForGap(level).some(lx => Math.abs(lx - x) <= LADDER_HALF_WIDTH);
}

// ---------- racer update ----------
function updateRacer(r, dt, input, speed) {
  if (r.reachedTop) return;
  if (r.stunned > 0) { r.stunned -= dt; return; }

  if (r.climbing) {
    r.climbProgress += r.climbDir * dt * 1.4;
    if (r.climbDir > 0 && r.climbProgress >= 1) {
      r.level += 1;
      r.climbing = false;
      r.climbProgress = 0;
      r.x = r.climbLadderX;
      sfx.climb();
      if (r.level > maxLevelReached && r === player) {
        maxLevelReached = r.level;
        score += 100;
        sfx.levelup();
        updateHud();
      }
      if (r.level >= LEVELS - 1) { r.reachedTop = true; onReachTop(r); }
    } else if (r.climbDir < 0 && r.climbProgress <= 0) {
      r.level -= 1;
      r.climbing = false;
      r.climbProgress = 0;
      r.x = r.climbLadderX;
    }
    return;
  }

  // jumping (brief hop, dodges barrels on the current platform)
  if (r.jumping) {
    r.jumpTime += dt;
    if (r.jumpTime >= 0.45) { r.jumping = false; r.jumpTime = 0; }
  }

  if (input.jump && !r.jumping) {
    r.jumping = true;
    r.jumpTime = 0;
    sfx.jump();
  }

  if (input.left) r.x -= speed * dt;
  if (input.right) r.x += speed * dt;
  r.x = Math.max(STAGE_L, Math.min(STAGE_R, r.x));

  if (input.up && r.level < LEVELS - 1 && onLadder(r.level, r.x)) {
    r.climbing = true;
    r.climbDir = 1;
    r.climbProgress = 0;
    r.climbLadderX = nearestLadderX(r.level, r.x);
    r.x = r.climbLadderX;
  } else if (input.down && r.level > 0 && onLadder(r.level - 1, r.x)) {
    r.climbing = true;
    r.climbDir = -1;
    r.climbProgress = 1;
    r.climbLadderX = nearestLadderX(r.level - 1, r.x);
    r.x = r.climbLadderX;
  }
}

function onReachTop(r) {
  if (r === player) {
    const timeBonus = Math.max(0, Math.round(300 - elapsed * 3));
    score += 500 + timeBonus;
    endGame(true);
  } else {
    endGame(false);
  }
}

// ---------- CPU AI ----------
let cpuTargetX = cpu ? cpu.x : W / 2;
let cpuJumpCooldown = 0;
function updateCpuInput(dt) {
  const input = { left: false, right: false, up: false, down: false, jump: false };
  if (cpu.reachedTop || cpu.stunned > 0 || cpu.climbing) return input;

  // brief reaction delay after each race start, so the CPU doesn't feel instant/unfair
  if (cpuReactionDelay > 0) return input;

  if (cpu.level < LEVELS - 1) {
    cpuTargetX = nearestLadderX(cpu.level, cpu.x);
  }
  const dx = cpuTargetX - cpu.x;
  if (Math.abs(dx) > 6) {
    input.left = dx < 0;
    input.right = dx > 0;
  } else if (cpu.level < LEVELS - 1) {
    input.up = true;
  }

  // hazard avoidance (barrels + static spikes) - imperfect on purpose, kept beatable
  cpuJumpCooldown -= dt;
  const barrelThreat = barrels.find(b => !b.falling && b.level === cpu.level && Math.abs(b.x - cpu.x) < 42 && Math.abs(b.x - cpu.x) > 6);
  const spikeThreat = SPIKES.find(s => s.level === cpu.level && Math.abs(s.x - cpu.x) < 30 && Math.abs(s.x - cpu.x) > 6 && (s.x - cpu.x) * dx >= 0);
  if ((barrelThreat || spikeThreat) && cpuJumpCooldown <= 0 && Math.random() < 0.6) {
    input.jump = true;
    cpuJumpCooldown = 0.6;
  }
  return input;
}

// ---------- barrels ----------
function spawnBarrel() {
  barrels.push({
    x: W / 2 + (Math.random() < 0.5 ? -30 : 30),
    level: LEVELS - 1,
    dir: Math.random() < 0.5 ? 1 : -1,
    speed: 70 + Math.random() * 20,
    falling: false,
    fallFrom: 0, fallProgress: 0,
    dodgedBy: new Set(),
  });
}

function updateBarrels(dt) {
  barrelTimer -= dt;
  if (barrelTimer <= 0 && barrels.length < 5) {
    spawnBarrel();
    barrelTimer = 3.2 - Math.min(1.6, elapsed * 0.02);
  }

  for (const b of barrels) {
    if (b.falling) {
      b.fallProgress += dt * 2.2;
      if (b.fallProgress >= 1) {
        b.falling = false;
        b.level -= 1;
        b.fallProgress = 0;
      }
      continue;
    }
    b.x += b.dir * b.speed * dt;
    if (b.x <= STAGE_L + 10 || b.x >= STAGE_R - 10) {
      b.dir *= -1;
      b.x = Math.max(STAGE_L + 10, Math.min(STAGE_R - 10, b.x));
    }
    if (b.level > 0 && onLadder(b.level - 1, b.x) && Math.random() < 0.012) {
      b.falling = true;
      b.fallFrom = b.level;
      b.fallProgress = 0;
    }
  }
  barrels = barrels.filter(b => b.level >= 0);
}

function checkHazardCollisions() {
  for (const b of barrels) {
    if (b.falling) continue;
    for (const r of [player, cpu]) {
      if (r.climbing || r.reachedTop || r.stunned > 0) continue;
      if (r.level !== b.level) continue;
      const dist = Math.abs(r.x - b.x);
      if (dist < 22 && !r.jumping) {
        hitRacer(r, b);
      } else if (dist < 40 && !b.dodgedBy.has(r)) {
        b.dodgedBy.add(r);
        if (r === player) { score += 5; sfx.dodge(); updateHud(); }
      }
    }
  }
  for (const s of SPIKES) {
    for (const r of [player, cpu]) {
      if (r.climbing || r.reachedTop || r.stunned > 0) continue;
      if (r.level !== s.level) continue;
      if (Math.abs(r.x - s.x) < 20 && !r.jumping) hitRacer(r, s);
    }
  }
}

function hitRacer(r, hazard) {
  spawnSpark(r.x, platformY[r.level] - 20);
  if (r === player) {
    lives -= 1;
    sfx.hit();
    r.stunned = 1.0;
    r.level = Math.max(0, r.level - 1);
    r.x = W / 2 - 40;
    updateHud();
    if (lives <= 0) endGame(false);
  } else {
    r.stunned = 1.1;
    // knock back so a static spike can't trap the CPU in a repeat-hit loop
    const pushDir = r.x <= hazard.x ? -1 : 1;
    r.x = Math.max(STAGE_L, Math.min(STAGE_R, r.x + pushDir * 50));
  }
}

function spawnSpark(x, y) {
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 90;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.35, color: '#ff5dd8' });
  }
}

function endGame(playerWon) {
  running = false;
  gameOver = true;
  if (playerWon) sfx.win(); else sfx.lose();
  updateHud();
  restartBtn.classList.add('hidden');

  if (qualifiesForLeaderboard(score)) {
    awaitingName = true;
    sfx.highscore();
    overlayTitle.textContent = 'NEW TOP SCORE!';
    overlaySub.innerHTML = `SCORE <b>${score}</b>`;
    nameEntry.classList.remove('hidden');
    leaderboardEl.classList.add('hidden');
    startBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  } else {
    overlayTitle.textContent = playerWon ? 'YOU WIN!' : 'GAME OVER';
    overlaySub.innerHTML = `SCORE <b>${score}</b><br>press start to try again`;
    startBtn.textContent = 'PLAY AGAIN';
    nameEntry.classList.add('hidden');
    leaderboardEl.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    renderLeaderboard();
    overlay.classList.remove('hidden');
  }
}

// ---------- main loop ----------
let lastTime = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
  lastTime = t;
  if (running) update(dt);
  render();
  window.requestAnimationFrame(loop);
}

function update(dt) {
  if (cheatFlash > 0) cheatFlash -= dt;

  if (phase === 'countdown') {
    countdownTime -= dt;
    if (countdownTime <= 0) phase = 'racing';
    return;
  }

  elapsed += dt;
  if (cpuReactionDelay > 0) cpuReactionDelay -= dt;
  updateRacer(player, dt, { left: movingLeft, right: movingRight, up: movingUp, down: movingDown, jump: jumpPressed }, PLAYER_SPEED);
  jumpPressed = false;
  updateRacer(cpu, dt, updateCpuInput(dt), CPU_SPEED);
  updateBarrels(dt);
  checkHazardCollisions();
  particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
  particles = particles.filter(p => p.life > 0);
}

// ---------- render ----------
function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  drawPlatforms();
  drawLadders();
  drawSpikes();
  drawBarrels();
  drawRacer(cpu, { body: '#c23b2a', trim: '#701a10', skin: '#d99a66', accent: '#ffffff' }, 'M');
  drawRacer(player, { body: '#5a3620', trim: '#2a1a10', skin: '#8a5a30', accent: '#c23b2a' }, 'DK');
  drawParticles();

  if (running && phase === 'countdown') drawCountdown();
  if (cheatFlash > 0) drawCheatFlash();
}

function drawCountdown() {
  const stage = Math.max(1, Math.ceil(countdownTime / COUNTDOWN_STAGE));
  const text = stage >= 4 ? '3' : stage === 3 ? '2' : stage === 2 ? '1' : 'GO!';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe93b';
  ctx.shadowColor = '#ff9500';
  ctx.shadowBlur = 20;
  ctx.font = 'bold 64px monospace';
  ctx.fillText(text, W / 2, H / 2);
  ctx.restore();
}

function drawCheatFlash() {
  ctx.save();
  ctx.globalAlpha = Math.min(1, cheatFlash);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5cffb0';
  ctx.shadowColor = '#5cffb0';
  ctx.shadowBlur = 14;
  ctx.font = 'bold 20px monospace';
  ctx.fillText('MARIO FROZEN!', W / 2, 40);
  ctx.restore();
}

function drawSpikes() {
  for (const s of SPIKES) {
    const y = platformY[s.level];
    ctx.save();
    ctx.fillStyle = '#ff3b3b';
    ctx.shadowColor = '#ff3b3b';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(s.x - 10, y);
    ctx.lineTo(s.x, y - 16);
    ctx.lineTo(s.x + 10, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawPlatforms() {
  for (let i = 0; i < LEVELS; i++) {
    const y = platformY[i];
    const isGoal = i === LEVELS - 1;
    ctx.fillStyle = isGoal ? '#5cffb0' : '#ff2db4';
    ctx.fillRect(STAGE_L - 10, y, STAGE_R - STAGE_L + 20, 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = STAGE_L - 10; x < STAGE_R + 10; x += 14) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 7, y + 10);
      ctx.moveTo(x + 7, y);
      ctx.lineTo(x, y + 10);
    }
    ctx.stroke();
    if (isGoal) {
      ctx.fillStyle = '#5cffb0';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GOAL', W / 2, y - 10);
    }
  }
}

function drawLadders() {
  ctx.strokeStyle = '#4dd4ff';
  ctx.lineWidth = 3;
  for (let g = 0; g < LADDERS.length; g++) {
    const yTop = platformY[g + 1], yBot = platformY[g];
    for (const lx of LADDERS[g]) {
      ctx.beginPath();
      ctx.moveTo(lx - 10, yTop);
      ctx.lineTo(lx - 10, yBot);
      ctx.moveTo(lx + 10, yTop);
      ctx.lineTo(lx + 10, yBot);
      ctx.stroke();
      ctx.lineWidth = 2;
      for (let ry = yTop + 8; ry < yBot; ry += 12) {
        ctx.beginPath();
        ctx.moveTo(lx - 10, ry);
        ctx.lineTo(lx + 10, ry);
        ctx.stroke();
      }
      ctx.lineWidth = 3;
    }
  }
}

function drawBarrels() {
  for (const b of barrels) {
    const y = b.falling
      ? platformY[b.fallFrom] - (platformY[b.fallFrom] - platformY[b.fallFrom - 1]) * b.fallProgress - 14
      : platformY[b.level] - 14;
    ctx.save();
    ctx.fillStyle = '#a0501a';
    ctx.shadowColor = '#ff9500';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(b.x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a2a0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - 13, y - 4); ctx.lineTo(b.x + 13, y - 4);
    ctx.moveTo(b.x - 13, y + 4); ctx.lineTo(b.x + 13, y + 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawRacer(r, colors, label) {
  if (r.reachedTop) return;
  let x = r.x;
  let y;
  if (r.climbing) {
    y = platformY[r.level] - (platformY[r.level] - platformY[r.level + 1]) * r.climbProgress;
  } else {
    y = platformY[r.level];
  }
  const hop = r.jumping ? Math.sin(Math.min(1, r.jumpTime / 0.45) * Math.PI) * 22 : 0;
  const flash = r.stunned > 0 && Math.floor(r.stunned * 12) % 2 === 0;

  ctx.save();
  ctx.translate(x, y - hop);

  const bodyColor = flash ? '#ffffff' : colors.body;
  const isDk = label === 'DK';
  const w = isDk ? 26 : 18;
  const h = isDk ? 30 : 26;

  // legs
  ctx.strokeStyle = colors.trim;
  ctx.lineWidth = isDk ? 9 : 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -h * 0.5);
  ctx.lineTo(-8, 0);
  ctx.moveTo(6, -h * 0.5);
  ctx.lineTo(8, 0);
  ctx.stroke();

  // torso
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-w / 2, -h, w, h * 0.6);

  // head
  ctx.fillStyle = flash ? '#ffffff' : colors.skin;
  ctx.beginPath();
  ctx.arc(0, -h - (isDk ? 12 : 9), isDk ? 13 : 9, 0, Math.PI * 2);
  ctx.fill();

  // accent (DK's chest tuft or Mario's cap)
  ctx.fillStyle = colors.accent;
  if (isDk) {
    ctx.beginPath();
    ctx.ellipse(0, -h + 8, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(-9, -h - 20, 18, 6);
  }

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 0.35);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(p.x, p.y, 4, 4);
    ctx.restore();
  }
}

loadLeaderboard();
resetGame();
showStartScreen();
updateHud();
requestAnimationFrame(loop);
