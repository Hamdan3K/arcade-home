// BROKEN GLASS - retro 4x4 grid battle
// Place 3 glass cups, then take turns guessing where the other hid theirs. First to 3 hits wins.

const SIZE = 4;
const COLS = ['A', 'B', 'C', 'D'];

const playerBoardEl = document.getElementById('playerBoard');
const enemyBoardEl = document.getElementById('enemyBoard');
const playerScoreEl = document.getElementById('playerScore');
const cpuScoreEl = document.getElementById('cpuScore');
const turnIndicatorEl = document.getElementById('turnIndicator');
const setupHintEl = document.getElementById('setupHint');
const cupCountEl = document.getElementById('cupCount');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
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
  place: () => beep(500, 0.05, 'square', 0.04),
  remove: () => beep(300, 0.05, 'square', 0.03),
  shatter: () => beep(140, 0.3, 'sawtooth', 0.08),
  miss: () => beep(600, 0.05, 'triangle', 0.03),
  win: () => beep(880, 0.5, 'triangle', 0.07),
  lose: () => beep(120, 0.5, 'sawtooth', 0.07),
};

// ---------- state ----------
let playerCups = new Set();      // indices 0-15 where the player has placed cups
let cpuCups = new Set();         // indices where the CPU hid its cups
let playerGuesses = new Map();   // index -> 'hit' | 'miss', guesses the player made on the enemy board
let cpuGuesses = new Map();      // index -> 'hit' | 'miss', guesses the CPU made on the player's board
let playerScore = 0;
let cpuScore = 0;
let phase = 'setup'; // 'setup' | 'player-turn' | 'cpu-turn' | 'gameover'
let huntQueue = [];   // CPU's queue of cells to try next after a hit

function idx(col, row) { return row * SIZE + col; }
function cellLabel(i) { return `${COLS[i % SIZE]}${Math.floor(i / SIZE) + 1}`; }
function neighbors(i) {
  const col = i % SIZE, row = Math.floor(i / SIZE);
  const out = [];
  if (col > 0) out.push(idx(col - 1, row));
  if (col < SIZE - 1) out.push(idx(col + 1, row));
  if (row > 0) out.push(idx(col, row - 1));
  if (row < SIZE - 1) out.push(idx(col, row + 1));
  return out;
}

function resetGame() {
  playerCups = new Set();
  cpuCups = new Set();
  playerGuesses = new Map();
  cpuGuesses = new Map();
  playerScore = 0;
  cpuScore = 0;
  phase = 'setup';
  huntQueue = [];
  updateHud();
  buildBoards();
}

function updateHud() {
  playerScoreEl.textContent = playerScore;
  cpuScoreEl.textContent = cpuScore;
  cupCountEl.textContent = playerCups.size;
  setupHintEl.classList.toggle('hidden', phase !== 'setup');

  if (phase === 'setup') {
    turnIndicatorEl.textContent = playerCups.size < 3 ? 'PLACE YOUR CUPS' : 'READY! CLICK START';
  } else if (phase === 'player-turn') {
    turnIndicatorEl.textContent = 'YOUR TURN - GUESS!';
  } else if (phase === 'cpu-turn') {
    turnIndicatorEl.textContent = "COMPUTER'S TURN...";
  }
}

// ---------- board rendering ----------
function buildBoards() {
  playerBoardEl.innerHTML = '';
  enemyBoardEl.innerHTML = '';
  playerBoardEl.appendChild(makeLabel(''));
  enemyBoardEl.appendChild(makeLabel(''));
  for (let c = 0; c < SIZE; c++) {
    playerBoardEl.appendChild(makeLabel(COLS[c]));
    enemyBoardEl.appendChild(makeLabel(COLS[c]));
  }
  for (let r = 0; r < SIZE; r++) {
    playerBoardEl.appendChild(makeLabel(String(r + 1)));
    for (let c = 0; c < SIZE; c++) playerBoardEl.appendChild(makeCell(idx(c, r), 'player'));
    enemyBoardEl.appendChild(makeLabel(String(r + 1)));
    for (let c = 0; c < SIZE; c++) enemyBoardEl.appendChild(makeCell(idx(c, r), 'enemy'));
  }
}

function makeLabel(text) {
  const d = document.createElement('div');
  d.className = 'label';
  d.textContent = text;
  return d;
}

function makeCell(i, board) {
  const btn = document.createElement('button');
  btn.className = 'cell';
  btn.dataset.index = i;
  btn.dataset.board = board;
  btn.addEventListener('click', onCellClick);
  return btn;
}

function renderCell(i, board) {
  const btn = (board === 'player' ? playerBoardEl : enemyBoardEl).querySelector(`[data-index="${i}"]`);
  if (!btn) return;
  btn.className = 'cell';
  btn.textContent = '';

  if (board === 'player') {
    const guess = cpuGuesses.get(i);
    if (guess === 'hit') { btn.classList.add('hit'); btn.textContent = '💥'; }
    else if (guess === 'miss') { btn.classList.add('miss'); btn.textContent = '•'; }
    else if (playerCups.has(i)) { btn.classList.add('cup'); btn.textContent = '🥃'; }
    if (phase === 'setup') btn.classList.add('clickable');
  } else {
    const guess = playerGuesses.get(i);
    if (guess === 'hit') { btn.classList.add('hit'); btn.textContent = '💥'; }
    else if (guess === 'miss') { btn.classList.add('miss'); btn.textContent = '•'; }
    else if (phase === 'player-turn') btn.classList.add('clickable');
  }
}

function renderAll() {
  for (let i = 0; i < SIZE * SIZE; i++) {
    renderCell(i, 'player');
    renderCell(i, 'enemy');
  }
}

// ---------- setup ----------
function onCellClick(e) {
  const i = parseInt(e.currentTarget.dataset.index, 10);
  const board = e.currentTarget.dataset.board;

  if (phase === 'setup' && board === 'player') {
    if (playerCups.has(i)) {
      playerCups.delete(i);
      sfx.remove();
    } else if (playerCups.size < 3) {
      playerCups.add(i);
      sfx.place();
    }
    renderCell(i, 'player');
    updateHud();
    return;
  }

  if (phase === 'player-turn' && board === 'enemy' && !playerGuesses.has(i)) {
    playerGuess(i);
  }
}

function attemptStart() {
  while (playerCups.size < 3) {
    const i = Math.floor(Math.random() * SIZE * SIZE);
    if (!playerCups.has(i)) { playerCups.add(i); renderCell(i, 'player'); }
  }
  placeCpuCups();
  overlay.classList.add('hidden');
  phase = 'player-turn';
  restartBtn.classList.remove('hidden');
  updateHud();
  renderAll();
}

startBtn.addEventListener('click', attemptStart);

restartBtn.addEventListener('click', restartGame);

function placeCpuCups() {
  const cells = Array.from({ length: SIZE * SIZE }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  cpuCups = new Set(cells.slice(0, 3));
}

// ---------- turns ----------
function playerGuess(i) {
  const hit = cpuCups.has(i);
  playerGuesses.set(i, hit ? 'hit' : 'miss');
  renderCell(i, 'enemy');

  if (hit) {
    playerScore += 1;
    sfx.shatter();
  } else {
    sfx.miss();
  }
  updateHud();

  if (playerScore >= 3) { endGame(true); return; }

  phase = 'cpu-turn';
  updateHud();
  renderAll();
  setTimeout(cpuTurn, 700);
}

function cpuTurn() {
  let target = null;
  while (huntQueue.length && target === null) {
    const candidate = huntQueue.shift();
    if (!cpuGuesses.has(candidate)) target = candidate;
  }
  if (target === null) {
    const untried = [];
    for (let i = 0; i < SIZE * SIZE; i++) if (!cpuGuesses.has(i)) untried.push(i);
    target = untried[Math.floor(Math.random() * untried.length)];
  }

  const hit = playerCups.has(target);
  cpuGuesses.set(target, hit ? 'hit' : 'miss');
  renderCell(target, 'player');

  if (hit) {
    cpuScore += 1;
    sfx.shatter();
    for (const n of neighbors(target)) if (!cpuGuesses.has(n)) huntQueue.push(n);
  } else {
    sfx.miss();
  }
  updateHud();

  if (cpuScore >= 3) { endGame(false); return; }

  phase = 'player-turn';
  updateHud();
  renderAll();
}

function endGame(playerWon) {
  phase = 'gameover';
  restartBtn.classList.add('hidden');
  if (playerWon) sfx.win(); else sfx.lose();
  revealRemaining();
  renderAll();

  document.getElementById('overlay').innerHTML = `
    <h1 class="title">${playerWon ? 'YOU WIN!' : 'COMPUTER WINS'}</h1>
    <p class="sub">final score &mdash; YOU ${playerScore} : ${cpuScore} CPU</p>
    <button id="startBtn" class="arcade-btn">PLAY AGAIN</button>
  `;
  overlay.classList.remove('hidden');
  document.getElementById('startBtn').addEventListener('click', restartGame);
}

function revealRemaining() {
  for (const i of cpuCups) if (!playerGuesses.has(i)) playerGuesses.set(i, 'miss');
  for (const i of playerCups) if (!cpuGuesses.has(i)) { /* keep visible as cup, no change needed */ }
}

function restartGame() {
  resetGame();
  overlay.innerHTML = `
    <h1 class="title">BROKEN GLASS</h1>
    <p class="sub">place 3 glass cups on your grid, then take turns guessing where the computer hid its cups. find all 3 first to win &mdash; but the computer is hunting yours too.</p>
    <button id="startBtn" class="arcade-btn">PRESS START</button>
  `;
  overlay.classList.remove('hidden');
  restartBtn.classList.add('hidden');
  document.getElementById('startBtn').addEventListener('click', attemptStart);
}

resetGame();
