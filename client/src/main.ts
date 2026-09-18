import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { SocketClient } from './network/SocketClient';
import { SERVER_URL } from './config';

interface LeaderboardRow {
  name: string;
  score: number;
}

async function loadTopScores() {
  const listEl = document.getElementById('top-scores-list');
  if (!listEl) return;
  try {
    const res = await fetch(`${SERVER_URL}/api/leaderboard/top`);
    const rows: LeaderboardRow[] = await res.json();
    if (rows.length === 0) {
      listEl.innerHTML = '<li class="dim">No scores yet — be the first!</li>';
      return;
    }
    listEl.innerHTML = rows
      .map((r) => `<li>${escapeHtml(r.name)} — ${r.score}</li>`)
      .join('');
  } catch {
    listEl.innerHTML = '<li class="dim">Leaderboard unavailable</li>';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const menuOverlay = document.getElementById('menu-overlay')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const statusLine = document.getElementById('status-line')!;

let game: Phaser.Game | null = null;
const socket = new SocketClient();

socket.onConnect(() => {
  statusLine.textContent = '';
  playBtn.disabled = false;
});
socket.onDisconnect(() => {
  statusLine.textContent = 'Disconnected from server — reconnecting...';
});

playBtn.disabled = true;
statusLine.textContent = 'Connecting to server...';
void loadTopScores();

function startGame() {
  const name = nameInput.value.trim() || 'Anon';
  menuOverlay.classList.add('hidden');

  if (game) {
    game.scene.start('GameScene', { socket, name });
    return;
  }

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0b0e14',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [GameScene],
  });
  game.scene.start('GameScene', { socket, name });
}

playBtn.addEventListener('click', startGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !playBtn.disabled) startGame();
});