import Phaser from 'phaser';
import { SocketClient } from '../network/SocketClient';
import { EliminationEvent, GameSnapshot, OrbState, PlayerState, WORLD_HEIGHT, WORLD_WIDTH } from '../types';

interface RenderEntity {
  container: Phaser.GameObjects.Container;
  circle: Phaser.GameObjects.Arc;
  label?: Phaser.GameObjects.Text;
  // Server-reported target position (updated on each snapshot).
  targetX: number;
  targetY: number;
  targetRadius: number;
}

// How quickly rendered entities chase their latest server-reported
// position. This is exponential smoothing rather than buffered
// snapshot interpolation: simpler to implement correctly, and hides
// the gap between the server's 20Hz tick and the client's 60fps
// render loop. Buffered interpolation (rendering slightly in the past
// between two known snapshots) is the more "correct" approach used in
// most production netcode and would be the natural next step here.
const SMOOTHING_RATE = 12;

const INPUT_SEND_INTERVAL_MS = 50; // ~20Hz, matches server tick rate

export class GameScene extends Phaser.Scene {
  private socket!: SocketClient;
  private playerName: string = 'Anon';
  private myId?: string;

  private playerEntities = new Map<string, RenderEntity>();
  private orbEntities = new Map<string, RenderEntity>();

  private lastInputSentAt = 0;
  private worldGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super('GameScene');
  }

  init(data: { socket: SocketClient; name: string }) {
    this.socket = data.socket;
    this.playerName = data.name;
  }

      create() {
    this.myId = this.socket.id;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.drawWorldBackground();

    this.socket.onSnapshot((snapshot) => this.handleSnapshot(snapshot));
    this.socket.onElimination((event) => this.handleElimination(event));

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));

    this.socket.join(this.playerName);
  }

  private drawWorldBackground() {
    this.cameras.main.setBackgroundColor(0x0b0e14);
    const g = this.add.graphics();
    g.lineStyle(1, 0x1a2233, 0.6);
    const step = 100;
    for (let x = 0; x <= WORLD_WIDTH; x += step) {
      g.lineBetween(x, 0, x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += step) {
      g.lineBetween(0, y, WORLD_WIDTH, y);
    }
    // Border to make world extent visible.
    g.lineStyle(3, 0x4ecdc4, 0.5);
    g.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.worldGraphics = g;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    const now = Date.now();
    if (now - this.lastInputSentAt < INPUT_SEND_INTERVAL_MS) return;
    this.lastInputSentAt = now;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.socket.sendInput(worldPoint.x, worldPoint.y);
  }

  private handleSnapshot(snapshot: GameSnapshot) {
    this.syncEntities(snapshot.players, this.playerEntities, true);
    this.syncEntities(snapshot.orbs, this.orbEntities, false);
    this.updateLeaderboard(snapshot.players);

    const me = snapshot.players.find((p) => p.id === this.myId);
    if (me) {
      this.followCameraOnce(me);
    }
  }

  private followingCameraTarget = false;
  private followCameraOnce(me: PlayerState) {
    if (this.followingCameraTarget) return;
    this.followingCameraTarget = true;
    const container = this.playerEntities.get(me.id)?.container;
    if (container) {
      this.cameras.main.startFollow(container, true, 0.15, 0.15);
    }
  }

  private syncEntities(
    states: (PlayerState | OrbState)[],
    map: Map<string, RenderEntity>,
    isPlayer: boolean,
  ) {
    const seen = new Set<string>();

    for (const state of states) {
      seen.add(state.id);
      let entity = map.get(state.id);

      if (!entity) {
        entity = this.createEntity(state, isPlayer);
        map.set(state.id, entity);
      }

      entity.targetX = state.x;
      entity.targetY = state.y;
      entity.targetRadius = state.radius;

      if (isPlayer) {
        const p = state as PlayerState;
        entity.circle.setFillStyle(p.color);
        entity.container.setAlpha(p.alive ? 1 : 0);
        if (entity.label) entity.label.setText(`${p.name} (${p.score})`);
      }
    }

    // Remove entities no longer present (orb eaten, player disconnected).
    for (const [id, entity] of map.entries()) {
      if (!seen.has(id)) {
        entity.container.destroy();
        map.delete(id);
      }
    }
  }

  private createEntity(state: PlayerState | OrbState, isPlayer: boolean): RenderEntity {
    const circle = this.add.circle(0, 0, state.radius, state.color);
    circle.setStrokeStyle(isPlayer ? 2 : 0, 0xffffff, 0.5);

    const container = this.add.container(state.x, state.y, [circle]);

    let label: Phaser.GameObjects.Text | undefined;
    if (isPlayer) {
      const p = state as PlayerState;
      label = this.add.text(0, -state.radius - 14, `${p.name} (${p.score})`, {
        fontSize: '12px',
        color: '#e8ecf1',
        fontFamily: 'Segoe UI, sans-serif',
      });
      label.setOrigin(0.5, 1);
      container.add(label);
    }

    return { container, circle, label, targetX: state.x, targetY: state.y, targetRadius: state.radius };
  }

  private updateLeaderboard(players: PlayerState[]) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    const top = [...players]
      .filter((p) => p.alive)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    listEl.innerHTML = top
      .map((p) => `<li class="${p.id === this.myId ? 'me' : ''}">${escapeHtml(p.name)} — ${p.score}</li>`)
      .join('');
  }

  private handleElimination(event: EliminationEvent) {
    if (event.eliminatedId !== this.myId) return;
    const toast = document.getElementById('death-toast');
    if (!toast) return;
    toast.textContent = `${event.byName} absorbed you. Respawning...`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    const smoothing = 1 - Math.exp(-SMOOTHING_RATE * dt);

    this.smoothTowardTarget(this.playerEntities, smoothing);
    this.smoothTowardTarget(this.orbEntities, smoothing);
  }

  private smoothTowardTarget(map: Map<string, RenderEntity>, smoothing: number) {
    for (const entity of map.values()) {
      const cx = entity.container.x + (entity.targetX - entity.container.x) * smoothing;
      const cy = entity.container.y + (entity.targetY - entity.container.y) * smoothing;
      entity.container.setPosition(cx, cy);

      const currentRadius = entity.circle.radius;
      const newRadius = currentRadius + (entity.targetRadius - currentRadius) * smoothing;
      if (Math.abs(newRadius - currentRadius) > 0.05) {
        entity.circle.setRadius(newRadius);
        if (entity.label) entity.label.setY(-newRadius - 14);
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
