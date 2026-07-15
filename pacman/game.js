// PAC-MAN - retro neon arcade clone
// Grid-based maze, 4 ghosts with simple chase/frighten/eaten AI, 10 levels of ramping difficulty.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const COLS = 19, ROWS = 21, CELL = 28;
const TUNNEL_ROW = 11;
const W = COLS * CELL, H = ROWS * CELL;

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const startBtn = document.getElementById('startBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const upBtn = document.getElementById('upBtn');
const downBtn = document.getElementById('downBtn');
const nameEntry = document.getElementById('nameEntry');
const nameInput = document.getElementById('nameInput');
const submitNameBtn = document.getElementById('submitNameBtn');
const leaderboardEl = document.getElementById('leaderboard');
const leaderboardListEl = document.getElementById('leaderboardList');
const restartBtn = document.getElementById('restartBtn');

// ---------- maze ----------
function generateMaze() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) row.push('#');
      else if (r % 2 === 0 && c % 2 === 0) row.push('#');
      else row.push('.');
    }
    grid.push(row);
  }
  // ghost house
  for (let r = 9; r <= 11; r++) {
    for (let c = 7; c <= 11; c++) grid[r][c] = ' ';
  }
  // power pellets at the four inner corners
  grid[1][1] = 'o';
  grid[1][COLS - 2] = 'o';
  grid[ROWS - 2][1] = 'o';
  grid[ROWS - 2][COLS - 2] = 'o';
  // side tunnel
  grid[TUNNEL_ROW][0] = ' ';
  grid[TUNNEL_ROW][COLS - 1] = ' ';
  return grid;
}

let grid = generateMaze();
let pelletsRemaining = 0;

function countPellets() {
  let n = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === '.' || grid[r][c] === 'o') n++;
  return n;
}

function isWall(col, row) {
  if (row === TUNNEL_ROW && (col < 0 || col >= COLS)) return false;
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
  return grid[row][col] === '#';
}

function cellCenter(col, row) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

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
  pellet: () => beep(520, 0.04, 'square', 0.025),
  power: () => beep(220, 0.2, 'sawtooth', 0.05),
  eatGhost: () => beep(880, 0.15, 'square', 0.06),
  hit: () => beep(90, 0.35, 'sawtooth', 0.08),
  level: () => beep(660, 0.4, 'triangle', 0.05),
  highscore: () => beep(1046, 0.5, 'triangle', 0.06),
};

// ---------- leaderboard (separate storage from Neon Raiders) ----------
const LEADERBOARD_KEY = 'neonPacmanLeaderboard';
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

// ---------- entities ----------
const DIRS = {
  ArrowLeft: { dx: -1, dy: 0 }, a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 }, d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 }, w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 }, s: { dx: 0, dy: 1 }, S: { dx: 0, dy: 1 },
};

const GHOST_DEFS = [
  { name: 'blinky', color: '#ff2d2d', startCol: 9, startRow: 10, release: 0 },
  { name: 'pinky', color: '#ff5da2', startCol: 8, startRow: 10, release: 2 },
  { name: 'inky', color: '#39e0ff', startCol: 10, startRow: 10, release: 4 },
  { name: 'clyde', color: '#ffb347', startCol: 9, startRow: 9, release: 6 },
];

const player = {
  x: 0, y: 0,
  dir: { dx: 0, dy: 0 },
  nextDir: { dx: 0, dy: 0 },
  speed: 5.2 * CELL,
  mouthPhase: 0,
};

let ghosts = [];
let score = 0;
let lives = 3;
let level = 1;
let running = false;
let gameOver = false;
let awaitingName = false;
let frightTimer = 0;
let levelBanner = 0; // seconds remaining for the "LEVEL X" transient text
let respawnTimer = 0; // brief freeze after losing a life

function difficultyLevel() { return Math.min(level, 10); }
function ghostSpeed() { return (4.4 + (difficultyLevel() - 1) * 0.16) * CELL; }
function frightDuration() { return Math.max(2, 7 - (difficultyLevel() - 1) * 0.5); }

function playerStart() { return cellCenter(9, 15); }

function resetPositions() {
  const p = playerStart();
  player.x = p.x; player.y = p.y;
  player.dir = { dx: 0, dy: 0 };
  player.nextDir = { dx: 0, dy: 0 };
  ghosts = GHOST_DEFS.map(def => {
    const c = cellCenter(def.startCol, def.startRow);
    return {
      ...def,
      x: c.x, y: c.y,
      dir: { dx: 0, dy: -1 },
      mode: 'idle',
      releaseTimer: def.release,
      bob: Math.random() * Math.PI * 2,
    };
  });
  frightTimer = 0;
}

function resetGameState() {
  score = 0;
  lives = 3;
  level = 1;
  gameOver = false;
  awaitingName = false;
  grid = generateMaze();
  pelletsRemaining = countPellets();
  resetPositions();
  levelBanner = 1.2;
  updateHud();
}

function startLevel() {
  grid = generateMaze();
  pelletsRemaining = countPellets();
  resetPositions();
  levelBanner = 1.2;
  updateHud();
}

function updateHud() {
  scoreEl.textContent = score;
  highScoreEl.textContent = Math.max(currentHighScore(), score);
  levelEl.textContent = level;
  livesEl.textContent = '●'.repeat(Math.max(0, lives));
}

// ---------- input ----------
const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'];
window.addEventListener('keydown', (e) => {
  if (MOVE_KEYS.includes(e.key)) e.preventDefault();
  const d = DIRS[e.key];
  if (d) player.nextDir = d;
  if ((e.key === 'r' || e.key === 'R') && running) restartGame();
});

function bindTap(btn, dir) {
  const set = (e) => { e.preventDefault(); player.nextDir = dir; };
  btn.addEventListener('mousedown', set);
  btn.addEventListener('touchstart', set, { passive: false });
}
bindTap(leftBtn, DIRS.ArrowLeft);
bindTap(rightBtn, DIRS.ArrowRight);
bindTap(upBtn, DIRS.ArrowUp);
bindTap(downBtn, DIRS.ArrowDown);

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
  overlaySub.innerHTML = `SCORE <b>${score}</b> &mdash; LEVEL <b>${level}</b>`;
  startBtn.textContent = 'PLAY AGAIN';
}

function startGame() {
  overlay.classList.add('hidden');
  resetGameState();
  running = true;
  restartBtn.classList.remove('hidden');
}

function restartGame() {
  resetGameState();
  running = true;
}

function showStartScreen() {
  overlayTitle.textContent = 'PAC-MAN';
  overlaySub.innerHTML = 'move <b>◀ ▶ ▲ ▼</b> / <b>WASD</b> &mdash; eat every dot, dodge the ghosts, grab a power pellet to turn the tables';
  startBtn.textContent = 'PRESS START';
  nameEntry.classList.add('hidden');
  leaderboardEl.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  restartBtn.classList.add('hidden');
  renderLeaderboard();
  overlay.classList.remove('hidden');
}

// ---------- movement helpers ----------
function nearCenter(x, y, threshold) {
  const col = Math.round((x - CELL / 2) / CELL);
  const row = Math.round((y - CELL / 2) / CELL);
  const c = cellCenter(col, row);
  return Math.abs(x - c.x) <= threshold && Math.abs(y - c.y) <= threshold;
}
function gridPos(x, y) {
  return { col: Math.round((x - CELL / 2) / CELL), row: Math.round((y - CELL / 2) / CELL) };
}

function moveEntity(entity, dt, speed) {
  const threshold = Math.max(1, speed * dt * 0.6);
  if (nearCenter(entity.x, entity.y, threshold)) {
    const { col, row } = gridPos(entity.x, entity.y);
    const c = cellCenter(col, row);
    entity.x = c.x; entity.y = c.y;
    return { col, row, atCenter: true };
  }
  return { atCenter: false };
}

// ---------- ghost AI ----------
function chooseDirection(col, row, currentDir, targetCol, targetRow, randomize) {
  const options = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
  ].filter(d => !isWall(col + d.dx, row + d.dy));

  const forward = options.filter(d => !(d.dx === -currentDir.dx && d.dy === -currentDir.dy));
  const usable = forward.length ? forward : options;
  if (!usable.length) return currentDir;

  if (randomize) {
    return usable[Math.floor(Math.random() * usable.length)];
  }
  let best = usable[0];
  let bestDist = Infinity;
  for (const d of usable) {
    const nc = col + d.dx, nr = row + d.dy;
    const dist = (nc - targetCol) ** 2 + (nr - targetRow) ** 2;
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

function updateGhost(ghost, dt) {
  if (ghost.mode === 'idle') {
    ghost.bob += dt * 4;
    ghost.releaseTimer -= dt;
    if (ghost.releaseTimer <= 0) ghost.mode = 'chase';
    return;
  }

  const speed = ghost.mode === 'frightened' ? ghostSpeed() * 0.6
    : ghost.mode === 'eaten' ? ghostSpeed() * 1.6
    : ghostSpeed();

  const result = moveEntity(ghost, dt, speed);
  if (result.atCenter) {
    let targetCol = gridPos(player.x, player.y).col;
    let targetRow = gridPos(player.x, player.y).row;
    if (ghost.mode === 'eaten') { targetCol = 9; targetRow = 10; }

    ghost.dir = chooseDirection(result.col, result.row, ghost.dir, targetCol, targetRow, ghost.mode === 'frightened');

    if (ghost.mode === 'eaten' && result.col === 9 && result.row === 10) {
      ghost.mode = 'chase';
    }
  }

  ghost.x += ghost.dir.dx * speed * dt;
  ghost.y += ghost.dir.dy * speed * dt;
  wrapTunnel(ghost);
}

function wrapTunnel(entity) {
  if (entity.x < -CELL / 2) entity.x = W + CELL / 2;
  if (entity.x > W + CELL / 2) entity.x = -CELL / 2;
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
  if (levelBanner > 0) { levelBanner -= dt; return; }
  if (respawnTimer > 0) { respawnTimer -= dt; return; }

  // player movement
  const result = moveEntity(player, dt, player.speed);
  if (result.atCenter) {
    if (!isWall(result.col + player.nextDir.dx, result.row + player.nextDir.dy)) {
      player.dir = player.nextDir;
    } else if (isWall(result.col + player.dir.dx, result.row + player.dir.dy)) {
      player.dir = { dx: 0, dy: 0 };
    }

    // eat pellet
    const cell = grid[result.row][result.col];
    if (cell === '.' || cell === 'o') {
      grid[result.row][result.col] = ' ';
      pelletsRemaining--;
      if (cell === 'o') {
        score += 50;
        frightTimer = frightDuration();
        for (const g of ghosts) if (g.mode === 'chase') g.mode = 'frightened';
        sfx.power();
      } else {
        score += 10;
        sfx.pellet();
      }
      updateHud();
    }
  }
  player.x += player.dir.dx * player.speed * dt;
  player.y += player.dir.dy * player.speed * dt;
  wrapTunnel(player);

  // frighten timer
  if (frightTimer > 0) {
    frightTimer -= dt;
    if (frightTimer <= 0) {
      for (const g of ghosts) if (g.mode === 'frightened') g.mode = 'chase';
    }
  }

  // ghosts
  for (const g of ghosts) updateGhost(g, dt);

  // collisions
  for (const g of ghosts) {
    const dist = Math.hypot(g.x - player.x, g.y - player.y);
    if (dist < CELL * 0.6) {
      if (g.mode === 'frightened') {
        g.mode = 'eaten';
        score += 200;
        sfx.eatGhost();
        updateHud();
      } else if (g.mode === 'chase') {
        loseLife();
        return;
      }
    }
  }

  // level clear
  if (pelletsRemaining <= 0) {
    level += 1;
    sfx.level();
    startLevel();
  }
}

function loseLife() {
  lives -= 1;
  sfx.hit();
  updateHud();
  if (lives <= 0) {
    endGame();
  } else {
    resetPositions();
    respawnTimer = 1.2;
  }
}

function endGame() {
  running = false;
  gameOver = true;
  updateHud();
  restartBtn.classList.add('hidden');

  if (qualifiesForLeaderboard(score)) {
    awaitingName = true;
    sfx.highscore();
    overlayTitle.textContent = 'NEW TOP SCORE!';
    overlaySub.innerHTML = `SCORE <b>${score}</b> &mdash; LEVEL <b>${level}</b>`;
    nameEntry.classList.remove('hidden');
    leaderboardEl.classList.add('hidden');
    startBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  } else {
    overlayTitle.textContent = 'GAME OVER';
    overlaySub.innerHTML = `SCORE <b>${score}</b> &mdash; LEVEL <b>${level}</b><br>press start to try again`;
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
  ctx.fillStyle = '#04040c';
  ctx.fillRect(0, 0, W, H);

  drawMaze();
  for (const g of ghosts) drawGhost(g);
  if (running || gameOver) drawPlayer();

  if (levelBanner > 0 && running) {
    ctx.save();
    ctx.fillStyle = '#ffe93b';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 14;
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${level}`, W / 2, H / 2);
    ctx.restore();
  }
}

function drawMaze() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      const x = c * CELL, y = r * CELL;
      if (cell === '#') {
        ctx.save();
        ctx.fillStyle = '#12277a';
        ctx.shadowColor = '#3a6bff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 4);
        ctx.fill();
        ctx.restore();
      } else if (cell === '.') {
        ctx.save();
        ctx.fillStyle = '#ffd9a0';
        ctx.shadowColor = '#ffd9a0';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (cell === 'o') {
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 180);
        ctx.save();
        ctx.fillStyle = '#fff2b0';
        ctx.shadowColor = '#ffe93b';
        ctx.shadowBlur = 14 * pulse;
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, 6 * pulse + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function drawPlayer() {
  const angleFor = (dir) => {
    if (dir.dx === 1) return 0;
    if (dir.dx === -1) return Math.PI;
    if (dir.dy === -1) return -Math.PI / 2;
    if (dir.dy === 1) return Math.PI / 2;
    return 0;
  };
  player.mouthPhase += 0.18;
  const mouth = Math.abs(Math.sin(player.mouthPhase)) * 0.28 + 0.05;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(angleFor(player.dir));
  ctx.fillStyle = '#ffe93b';
  ctx.shadowColor = '#ffcc00';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  const r = CELL * 0.42;
  ctx.arc(0, 0, r, mouth * Math.PI, (2 - mouth) * Math.PI);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGhost(g) {
  const bobY = g.mode === 'idle' ? Math.sin(g.bob) * 3 : 0;
  const x = g.x, y = g.y + bobY;
  const r = CELL * 0.42;

  if (g.mode === 'eaten') {
    drawEyes(x, y, g.dir);
    return;
  }

  const color = g.mode === 'frightened'
    ? (frightTimer < 1.5 ? (Math.floor(frightTimer * 8) % 2 === 0 ? '#2233ff' : '#ffffff') : '#2233ff')
    : g.color;

  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0, false);
  ctx.lineTo(x + r, y + r);
  const scallops = 4;
  for (let i = 0; i < scallops; i++) {
    const sx = x + r - (i + 0.5) * (2 * r / scallops);
    ctx.quadraticCurveTo(sx + (r / scallops), y + r + 6, sx, y + r);
  }
  ctx.lineTo(x - r, y + r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (g.mode !== 'frightened') drawEyes(x, y, g.dir);
  else {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('><', x, y + 3);
    ctx.restore();
  }
}

function drawEyes(x, y, dir) {
  const offX = dir.dx * 3, offY = dir.dy * 3;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - 5, y - 2, 4, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a2a6e';
  ctx.beginPath();
  ctx.arc(x - 5 + offX, y - 2 + offY, 2, 0, Math.PI * 2);
  ctx.arc(x + 5 + offX, y - 2 + offY, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

loadLeaderboard();
showStartScreen();
updateHud();
requestAnimationFrame(loop);
