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
    listEl.innerHTML = rows.map((r) => `<li>${escapeHtml(r.name)} — ${r.score}</li>`).join('');
  } catch {
    listEl.innerHTML = '<li class="dim">Leaderboard unavailable</li>';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// --- Element references ---
const menuOverlay = document.getElementById('menu-overlay')!;
const lobbyView = document.getElementById('lobby-view')!;
const playView = document.getElementById('play-view')!;

const quickPlayBtn = document.getElementById('quickplay-btn') as HTMLButtonElement;
const createRoomBtn = document.getElementById('create-room-btn') as HTMLButtonElement;
const joinRoomBtn = document.getElementById('join-room-btn') as HTMLButtonElement;
const joinCodeInput = document.getElementById('join-code-input') as HTMLInputElement;
const lobbyStatus = document.getElementById('lobby-status')!;

const roomCodeText = document.getElementById('room-code-text')!;
const copyCodeBtn = document.getElementById('copy-code-btn')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const statusLine = document.getElementById('status-line')!;
const backToLobbyBtn = document.getElementById('back-to-lobby-btn') as HTMLButtonElement;

let game: Phaser.Game | null = null;
let currentRoomCode: string | null = null;
const socket = new SocketClient();

// --- Connection state gates the lobby buttons, same idea as before ---
socket.onConnect(() => {
  lobbyStatus.textContent = '';
  quickPlayBtn.disabled = false;
  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = false;
});
socket.onDisconnect(() => {
  lobbyStatus.textContent = 'Disconnected from server — reconnecting...';
  lobbyStatus.classList.add('error');
});

void loadTopScores();

function setLobbyStatus(text: string, isError = false) {
  lobbyStatus.textContent = text;
  lobbyStatus.classList.toggle('error', isError);
}

function showPlayView(roomCode: string) {
  currentRoomCode = roomCode;
  roomCodeText.textContent = roomCode;
  lobbyView.classList.add('hidden-view');
  playView.classList.remove('hidden-view');
  statusLine.textContent = '';
  nameInput.focus();
}

quickPlayBtn.addEventListener('click', async () => {
  setLobbyStatus('Finding a match...');
  const res = await socket.quickPlay();
  showPlayView(res.roomCode);
});

createRoomBtn.addEventListener('click', async () => {
  setLobbyStatus('Creating room...');
  const res = await socket.createRoom();
  showPlayView(res.roomCode);
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    setLobbyStatus('Enter a room code', true);
    return;
  }
  setLobbyStatus('Joining...');
  const res = await socket.joinRoom(code);
  if (res.error || !res.roomCode) {
    setLobbyStatus(res.error ?? 'Could not join room', true);
    return;
  }
  showPlayView(res.roomCode);
});
joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoomBtn.click();
});

copyCodeBtn.addEventListener('click', () => {
  if (!currentRoomCode) return;
  navigator.clipboard?.writeText(currentRoomCode).then(() => {
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => (copyCodeBtn.textContent = 'Click to copy'), 1500);
  });
});

// A socket can only join one room per connection (see server.ts), so
// "choosing a different room" is implemented as a fresh connection —
// simplest correct behavior, and the lobby state was trivial anyway.
backToLobbyBtn.addEventListener('click', () => window.location.reload());

function startGame() {
  if (!currentRoomCode) return;
  const name = nameInput.value.trim() || 'Anon';
  menuOverlay.classList.add('hidden');

  if (game) {
    game.scene.start('GameScene', { socket, name, roomCode: currentRoomCode });
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
  game.scene.start('GameScene', { socket, name, roomCode: currentRoomCode });
}

playBtn.addEventListener('click', startGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});