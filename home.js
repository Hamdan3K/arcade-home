// Arcade home page - renders app tiles from GAMES and filters them via the search bar.

const GAMES = [
  { name: 'Neon Raiders', icon: 'emoji', glyph: '🚀', url: 'game/index.html' },
  { name: 'Pac-Man', icon: 'pacman', url: 'pacman/index.html' },
  { name: 'Neon Brawler', icon: 'emoji', glyph: '🥊', url: 'fighter/index.html' },
];

const appGrid = document.getElementById('appGrid');
const noResults = document.getElementById('noResults');
const searchInput = document.getElementById('gameSearch');

function renderGames(list) {
  appGrid.innerHTML = '';
  for (const g of list) {
    const tile = document.createElement('a');
    tile.className = 'app-tile';
    tile.href = g.url;

    const icon = document.createElement('div');
    icon.className = 'app-icon';
    if (g.icon === 'pacman') {
      const glyph = document.createElement('span');
      glyph.className = 'icon-pacman';
      icon.appendChild(glyph);
      const badge = document.createElement('span');
      badge.className = 'icon-badge';
      badge.textContent = '👻';
      icon.appendChild(badge);
    } else {
      const glyph = document.createElement('span');
      glyph.className = g.glyph === '🚀' ? 'emoji-glyph rocket-tilt' : 'emoji-glyph';
      glyph.textContent = g.glyph;
      icon.appendChild(glyph);
    }

    const label = document.createElement('div');
    label.className = 'app-label';
    label.textContent = g.name.toUpperCase();

    tile.appendChild(icon);
    tile.appendChild(label);
    appGrid.appendChild(tile);
  }
  noResults.classList.toggle('hidden', list.length > 0);
}

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q ? GAMES.filter(g => g.name.toLowerCase().includes(q)) : GAMES;
  renderGames(filtered);
});

renderGames(GAMES);
