// NEON BRAWLER - retro 1v1 fighting game
// Player (BLAZE) vs CPU (TANK). Best of 3 rounds, KO or time-out decides each round.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const GROUND_Y = H - 60;
const STAGE_MARGIN = 50;
const MIN_SEPARATION = 76;

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const highScoreEl = document.getElementById('highScore');
const timerEl = document.getElementById('timer');
const p1HealthEl = document.getElementById('p1Health');
const p2HealthEl = document.getElementById('p2Health');
const p1PipsEl = document.getElementById('p1Pips');
const p2PipsEl = document.getElementById('p2Pips');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const startBtn = document.getElementById('startBtn');
const nameEntry = document.getElementById('nameEntry');
const nameInput = document.getElementById('nameInput');
const submitNameBtn = document.getElementById('submitNameBtn');
const leaderboardEl = document.getElementById('leaderboard');
const leaderboardListEl = document.getElementById('leaderboardList');
const restartBtn = document.getElementById('restartBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const jumpBtn = document.getElementById('jumpBtn');
const blockBtn = document.getElementById('blockBtn');
const punchBtn = document.getElementById('punchBtn');
const kickBtn = document.getElementById('kickBtn');

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
  punch: () => beep(180, 0.08, 'square', 0.06),
  kick: () => beep(140, 0.12, 'square', 0.07),
  block: () => beep(400, 0.05, 'triangle', 0.04),
  ko: () => beep(80, 0.6, 'sawtooth', 0.09),
  round: () => beep(660, 0.4, 'triangle', 0.05),
  win: () => beep(880, 0.5, 'triangle', 0.07),
  highscore: () => beep(1046, 0.5, 'triangle', 0.06),
};

// ---------- leaderboard (separate storage from the other games) ----------
const LEADERBOARD_KEY = 'neonBrawlerLeaderboard';
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

// ---------- fighters ----------
function makeFighter(isPlayer, x, colors) {
  return {
    isPlayer, x, feetY: 0, vy: 0, facing: isPlayer ? 1 : -1,
    hp: 100, state: 'idle', stateTime: 0, hasHit: false,
    blocking: false, colors, roundsWon: 0,
  };
}

const BLAZE_COLORS = { gi: '#39c6ff', trim: '#0a3a55', skin: '#e8b07a', glove: '#ff3b3b', hair: '#2a1a0a' };
const TANK_COLORS = { gi: '#c23b2a', trim: '#5a1a10', skin: '#d99a66', glove: '#d99a66', hair: '#1a0a05' };

let player, cpu;
let score = 0;
let running = false;
let gameOver = false;
let awaitingName = false;
let roundTime = 60;
let roundTimerAcc = 0;
let phase = 'fight'; // 'intro' | 'fight' | 'ko' | 'roundend'
let phaseTimer = 0;
let matchOver = false;
let particles = [];
let shake = 0;

const ATTACKS = {
  punch: { startup: 0.08, active: 0.09, recovery: 0.16, reach: 84, damage: 6, knockback: 30 },
  kick: { startup: 0.14, active: 0.10, recovery: 0.24, reach: 88, damage: 10, knockback: 55 },
};

function resetFighters() {
  player = makeFighter(true, 200, BLAZE_COLORS);
  cpu = makeFighter(false, W - 200, TANK_COLORS);
}

function resetMatch() {
  score = 0;
  gameOver = false;
  awaitingName = false;
  matchOver = false;
  resetFighters();
  startRoundIntro(1);
  updateHud();
}

function startRoundIntro(roundNum) {
  resetFighters();
  roundTime = 60;
  roundTimerAcc = 0;
  phase = 'intro';
  phaseTimer = 1.6;
  overlaySub.dataset.round = roundNum;
}

function updateHud() {
  scoreEl.textContent = score;
  highScoreEl.textContent = Math.max(currentHighScore(), score);
  timerEl.textContent = Math.ceil(roundTime);
  p1HealthEl.style.width = Math.max(0, player.hp) + '%';
  p2HealthEl.style.width = Math.max(0, cpu.hp) + '%';
  p1PipsEl.textContent = '●'.repeat(player.roundsWon) + '○'.repeat(2 - player.roundsWon);
  p2PipsEl.textContent = '○'.repeat(2 - cpu.roundsWon) + '●'.repeat(cpu.roundsWon);
}

// ---------- input ----------
let movingLeft = false, movingRight = false, jumpPressed = false, blockHeld = false;
let punchPressed = false, kickPressed = false;

const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S', 'j', 'J', 'k', 'K'];
window.addEventListener('keydown', (e) => {
  if (MOVE_KEYS.includes(e.key)) e.preventDefault();
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = true;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = true;
  if (['ArrowUp', 'w', 'W'].includes(e.key)) jumpPressed = true;
  if (['ArrowDown', 's', 'S'].includes(e.key)) blockHeld = true;
  if (e.key === 'j' || e.key === 'J') punchPressed = true;
  if (e.key === 'k' || e.key === 'K') kickPressed = true;
  if ((e.key === 'r' || e.key === 'R') && running) restartGame();
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) movingLeft = false;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) movingRight = false;
  if (['ArrowDown', 's', 'S'].includes(e.key)) blockHeld = false;
});

function bindHold(btn, onDown, onUp) {
  btn.addEventListener('mousedown', onDown);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => btn.addEventListener(ev, onUp));
}
bindHold(leftBtn, () => movingLeft = true, () => movingLeft = false);
bindHold(rightBtn, () => movingRight = true, () => movingRight = false);
bindHold(blockBtn, () => blockHeld = true, () => blockHeld = false);
bindHold(jumpBtn, () => jumpPressed = true, () => {});
bindHold(punchBtn, () => punchPressed = true, () => {});
bindHold(kickBtn, () => kickPressed = true, () => {});

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
  overlayTitle.textContent = matchOver === 'win' ? 'YOU WIN!' : 'GAME OVER';
  overlaySub.innerHTML = `SCORE <b>${score}</b>`;
  startBtn.textContent = 'PLAY AGAIN';
}

function startGame() {
  overlay.classList.add('hidden');
  resetMatch();
  running = true;
  restartBtn.classList.remove('hidden');
}

function restartGame() {
  resetMatch();
  running = true;
}

function showStartScreen() {
  overlayTitle.textContent = 'NEON BRAWLER';
  overlaySub.innerHTML = 'move <b>◀ ▶</b> / <b>A D</b> &mdash; <b>W</b> jump &mdash; <b>J</b> punch &mdash; <b>K</b> kick &mdash; hold <b>S</b> to block';
  startBtn.textContent = 'PRESS START';
  nameEntry.classList.add('hidden');
  leaderboardEl.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  renderLeaderboard();
  overlay.classList.remove('hidden');
  restartBtn.classList.add('hidden');
}

// ---------- combat ----------
function distanceBetween(a, b) { return Math.abs(a.x - b.x); }

function tryStartAttack(f, type) {
  if (f.state !== 'idle' && f.state !== 'walk') return;
  f.state = type;
  f.stateTime = 0;
  f.hasHit = false;
}

function applyDamage(attacker, defender, atk) {
  let dmg = atk.damage;
  let knockback = atk.knockback;
  if (defender.blocking) {
    dmg = Math.round(dmg * 0.2);
    knockback *= 0.3;
    sfx.block();
    spawnSpark(defender.x - defender.facing * 20, GROUND_Y - 55, '#8fd8ff');
  } else {
    defender.state = 'hitstun';
    defender.stateTime = 0;
    spawnSpark(defender.x - defender.facing * 20, GROUND_Y - 55, '#ffd23f');
    shake = 6;
  }
  defender.hp = Math.max(0, defender.hp - dmg);
  defender.x += (defender.x > attacker.x ? 1 : -1) * knockback;
  clampFighterX(defender);
  if (attacker.isPlayer) { score += 10; }
  updateHud();
  if (defender.hp <= 0) triggerKo(defender);
}

function clampFighterX(f) {
  f.x = Math.max(STAGE_MARGIN, Math.min(W - STAGE_MARGIN, f.x));
}

function spawnSpark(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 100;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.2, color,
    });
  }
}

function triggerKo(loser) {
  phase = 'ko';
  phaseTimer = 1.8;
  sfx.ko();
  shake = 14;
}

function resolveRound(winner) {
  winner.roundsWon += 1;
  updateHud();
  if (winner.isPlayer) score += 150;
  if (winner.roundsWon >= 2) {
    endMatch(winner.isPlayer);
  } else {
    phase = 'roundend';
    phaseTimer = 1.4;
  }
}

function endMatch(playerWon) {
  running = false;
  gameOver = true;
  matchOver = playerWon ? 'win' : 'lose';
  if (playerWon) { score += 400; sfx.win(); }
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

// ---------- CPU AI ----------
let aiTimer = 0;
let aiAction = 'approach';
function updateCpuAI(dt) {
  if (cpu.state === 'hitstun' || cpu.state === 'punch' || cpu.state === 'kick') return;
  aiTimer -= dt;
  const dist = distanceBetween(player, cpu);

  if (aiTimer <= 0) {
    aiTimer = 0.35 + Math.random() * 0.35;
    if (dist > 100) {
      aiAction = 'approach';
    } else if (dist < 60) {
      aiAction = Math.random() < 0.3 ? 'retreat' : (Math.random() < 0.5 ? 'punch' : 'kick');
    } else {
      const roll = Math.random();
      aiAction = roll < 0.4 ? 'punch' : roll < 0.7 ? 'kick' : roll < 0.85 ? 'block' : 'retreat';
    }
  }

  cpu.blocking = aiAction === 'block';
  if (aiAction === 'approach') {
    cpu.x += (player.x < cpu.x ? -1 : 1) * 160 * dt;
    cpu.state = 'walk';
  } else if (aiAction === 'retreat') {
    cpu.x += (player.x < cpu.x ? 1 : -1) * 140 * dt;
    cpu.state = 'walk';
  } else if (aiAction === 'punch' && dist <= ATTACKS.punch.reach + 10) {
    tryStartAttack(cpu, 'punch');
  } else if (aiAction === 'kick' && dist <= ATTACKS.kick.reach + 10) {
    tryStartAttack(cpu, 'kick');
  } else if (aiAction === 'block') {
    cpu.state = 'idle';
  } else {
    cpu.state = 'idle';
  }
  clampFighterX(cpu);
  if (Math.abs(cpu.x - player.x) < MIN_SEPARATION) {
    cpu.x = player.x + (cpu.x > player.x ? MIN_SEPARATION : -MIN_SEPARATION);
    clampFighterX(cpu);
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

function updateFighterPhysics(f, dt) {
  f.vy -= 1400 * dt;
  f.feetY += f.vy * dt;
  if (f.feetY <= 0) { f.feetY = 0; f.vy = 0; }
}

function updateFighterState(f, dt) {
  f.stateTime += dt;
  if (f.state === 'punch' || f.state === 'kick') {
    const atk = ATTACKS[f.state];
    const total = atk.startup + atk.active + atk.recovery;
    if (f.stateTime >= atk.startup && f.stateTime < atk.startup + atk.active && !f.hasHit) {
      const opponent = f.isPlayer ? cpu : player;
      if (distanceBetween(f, opponent) <= atk.reach) {
        f.hasHit = true;
        (f.state === 'punch' ? sfx.punch : sfx.kick)();
        applyDamage(f, opponent, atk);
      }
    }
    if (f.stateTime >= total) { f.state = 'idle'; f.stateTime = 0; }
  } else if (f.state === 'hitstun') {
    if (f.stateTime >= 0.35) { f.state = 'idle'; f.stateTime = 0; }
  }
}

function update(dt) {
  // facing
  player.facing = player.x <= cpu.x ? 1 : -1;
  cpu.facing = cpu.x <= player.x ? 1 : -1;

  if (phase === 'intro') {
    phaseTimer -= dt;
    if (phaseTimer <= 0) { phase = 'fight'; sfx.round(); }
    updateParticles(dt);
    if (shake > 0) shake -= dt * 30;
    return;
  }
  if (phase === 'ko') {
    phaseTimer -= dt;
    updateParticles(dt);
    if (shake > 0) shake -= dt * 30;
    if (phaseTimer <= 0) {
      const winner = player.hp <= 0 && cpu.hp <= 0 ? null : (player.hp <= 0 ? cpu : player);
      if (winner) resolveRound(winner);
      else { phase = 'roundend'; phaseTimer = 1.4; }
    }
    return;
  }
  if (phase === 'roundend') {
    phaseTimer -= dt;
    if (phaseTimer <= 0 && !gameOver) startRoundIntro(player.roundsWon + cpu.roundsWon + 1);
    return;
  }

  // ---- active fight phase ----
  player.blocking = blockHeld && player.state !== 'punch' && player.state !== 'kick';
  if (player.state === 'idle' || player.state === 'walk') {
    player.state = 'idle';
    if (blockHeld) player.state = 'block';
    else {
      if (movingLeft) { player.x -= 220 * dt; player.state = 'walk'; }
      if (movingRight) { player.x += 220 * dt; player.state = 'walk'; }
      if (jumpPressed && player.feetY === 0) { player.vy = 480; }
    }
  }
  jumpPressed = false;
  if (punchPressed) { tryStartAttack(player, 'punch'); punchPressed = false; }
  if (kickPressed) { tryStartAttack(player, 'kick'); kickPressed = false; }

  clampFighterX(player);
  if (Math.abs(player.x - cpu.x) < MIN_SEPARATION) {
    player.x = cpu.x + (player.x > cpu.x ? MIN_SEPARATION : -MIN_SEPARATION);
    clampFighterX(player);
  }

  updateCpuAI(dt);
  updateFighterPhysics(player, dt);
  updateFighterPhysics(cpu, dt);
  updateFighterState(player, dt);
  updateFighterState(cpu, dt);
  updateParticles(dt);
  if (shake > 0) shake -= dt * 30;

  // round timer
  roundTime -= dt;
  if (roundTime <= 0) {
    roundTime = 0;
    phase = 'ko';
    phaseTimer = 1.6;
    if (player.hp === cpu.hp) { /* draw: replay round via null winner path */ }
  }
  updateHud();
}

function updateParticles(dt) {
  particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
  particles = particles.filter(p => p.life > 0);
}

// ---------- render ----------
function render() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  drawBackground();
  drawFighter(cpu);
  drawFighter(player);
  drawParticles();

  if (phase === 'intro') drawBanner(`ROUND ${(player.roundsWon + cpu.roundsWon + 1)}`, 'FIGHT!', phaseTimer);
  if (phase === 'ko') drawBanner('K.O.!', '', phaseTimer);
  if (phase === 'roundend') drawBanner(player.roundsWon > cpu.roundsWon ? 'BLAZE WINS ROUND' : 'TANK WINS ROUND', '', phaseTimer);

  ctx.restore();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#3a1a2e');
  grad.addColorStop(0.5, '#5a2a1e');
  grad.addColorStop(0.7, '#7a3a1a');
  grad.addColorStop(0.7, '#241210');
  grad.addColorStop(1, '#120a08');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // distant factory silhouettes
  ctx.fillStyle = 'rgba(20, 10, 10, 0.6)';
  ctx.fillRect(20, GROUND_Y - 140, 60, 140);
  ctx.fillRect(100, GROUND_Y - 100, 40, 100);
  ctx.fillRect(W - 90, GROUND_Y - 160, 70, 160);
  ctx.fillRect(W - 160, GROUND_Y - 90, 50, 90);

  // chain-link fence
  ctx.save();
  ctx.strokeStyle = 'rgba(200, 200, 210, 0.18)';
  ctx.lineWidth = 1;
  const fenceTop = GROUND_Y - 130, fenceBottom = GROUND_Y;
  ctx.beginPath();
  for (let x = -40; x < W + 40; x += 18) {
    ctx.moveTo(x, fenceTop);
    ctx.lineTo(x + 40, fenceBottom);
    ctx.moveTo(x + 40, fenceTop);
    ctx.lineTo(x, fenceBottom);
  }
  ctx.stroke();
  ctx.restore();

  // ground
  ctx.fillStyle = '#241612';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.strokeStyle = 'rgba(255, 150, 80, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();

  // subtle CRT scanlines
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  ctx.restore();
}

function drawFighter(f) {
  const x = f.x, groundY = GROUND_Y - f.feetY;
  const crouch = f.state === 'block';
  const legH = crouch ? 26 : 40;
  const torsoH = crouch ? 26 : 30;

  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(f.facing, 1);

  const flash = f.state === 'hitstun' && Math.floor(f.stateTime * 20) % 2 === 0;
  const bodyColor = flash ? '#ffffff' : f.colors.gi;

  // back leg
  ctx.strokeStyle = f.colors.trim;
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -legH);
  ctx.lineTo(-10, 0);
  ctx.stroke();

  // front leg (extends for kick)
  let footX = 8, footY = 0;
  if (f.state === 'kick') {
    const atk = ATTACKS.kick;
    const t = Math.min(1, Math.max(0, (f.stateTime - atk.startup) / atk.active));
    const extend = Math.sin(Math.min(1, t) * Math.PI) * atk.reach;
    footX = 10 + extend;
    footY = -legH * 0.55;
  }
  ctx.strokeStyle = f.colors.trim;
  ctx.beginPath();
  ctx.moveTo(6, -legH);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  ctx.fillStyle = f.colors.skin;
  ctx.beginPath();
  ctx.arc(footX, footY, 6, 0, Math.PI * 2);
  ctx.fill();

  // torso
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-14, -legH - torsoH, 28, torsoH);

  // head
  ctx.fillStyle = flash ? '#ffffff' : f.colors.skin;
  ctx.beginPath();
  ctx.arc(0, -legH - torsoH - 12, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.colors.hair;
  ctx.fillRect(-12, -legH - torsoH - 22, 24, 8);

  // back arm
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-10, -legH - torsoH + 6);
  ctx.lineTo(-16, -legH - torsoH + 24);
  ctx.stroke();

  // front arm (extends for punch, raises for block)
  let handX = 16, handY = -legH - torsoH + 14;
  if (f.state === 'punch') {
    const atk = ATTACKS.punch;
    const t = Math.min(1, Math.max(0, (f.stateTime - atk.startup) / atk.active));
    const extend = Math.sin(Math.min(1, t) * Math.PI) * atk.reach;
    handX = 14 + extend;
    handY = -legH - torsoH + 10;
  } else if (f.state === 'block') {
    handX = 14; handY = -legH - torsoH + 2;
  }
  ctx.strokeStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(10, -legH - torsoH + 6);
  ctx.lineTo(handX, handY);
  ctx.stroke();
  ctx.fillStyle = f.colors.glove;
  ctx.beginPath();
  ctx.arc(handX, handY, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 0.5);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(p.x, p.y, 4, 4);
    ctx.restore();
  }
}

function drawBanner(mainText, subText, timer) {
  ctx.save();
  const alpha = Math.min(1, timer * 2);
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.shadowColor = '#ff9500';
  ctx.shadowBlur = 16;
  ctx.font = 'bold 34px monospace';
  ctx.fillText(mainText, W / 2, H / 2 - 10);
  if (subText) {
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ff5d3a';
    ctx.fillText(subText, W / 2, H / 2 + 26);
  }
  ctx.restore();
}

loadLeaderboard();
resetFighters();
showStartScreen();
updateHud();
requestAnimationFrame(loop);
