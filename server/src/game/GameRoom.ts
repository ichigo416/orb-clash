import { Server } from 'socket.io';
import { Player } from './Player';
import { Orb } from './Orb';
import { SpatialGrid } from './SpatialGrid';
import { recordScore } from '../services/leaderboardService';
import {
  ABSORB_SIZE_RATIO,
  EliminationEvent,
  GameSnapshot,
  GRID_CELL_SIZE,
  MAX_ORBS,
  ORB_RADIUS,
  TICK_RATE_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../types';

/**
 * GameRoom owns all authoritative game state for one arena.
 *
 * Design notes for anyone reading this as a portfolio piece:
 * - The server is the only source of truth. Clients send *intent*
 *   (a target point), never position. This makes basic speed/teleport
 *   hacks impossible without server-side validation of movement deltas.
 * - State is broadcast on a fixed tick (TICK_RATE_HZ), decoupled from
 *   however fast any individual client's browser renders. Clients
 *   interpolate between snapshots for smooth visuals.
 * - Collision detection uses a uniform spatial grid (SpatialGrid.ts),
 *   rebuilt every tick, so each entity only checks distance against the
 *   handful of entities in nearby cells instead of every other entity
 *   in the game. Still O(n^2) in the pathological case where every
 *   entity is packed into the same cell, but that's a known, documented
 *   tradeoff — a quadtree would adapt to uneven density better, at the
 *   cost of more complex insert/query logic.
 */
export class GameRoom {
  private players = new Map<string, Player>();
  private orbs = new Map<string, Orb>();
  private io: Server;
  private tick = 0;
  private lastTickAt = Date.now();
  private intervalHandle: NodeJS.Timeout | null = null;

  private orbGrid = new SpatialGrid<Orb>(GRID_CELL_SIZE);
  private playerGrid = new SpatialGrid<Player>(GRID_CELL_SIZE);

  constructor(io: Server) {
    this.io = io;
    this.spawnOrbsUpTo(MAX_ORBS);
  }

  start() {
    const dtMs = 1000 / TICK_RATE_HZ;
    this.intervalHandle = setInterval(() => this.update(), dtMs);
  }

  stop() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  addPlayer(id: string, name: string): Player {
    const spawn = this.randomPoint();
    const player = new Player(id, name, spawn.x, spawn.y);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string) {
    const player = this.players.get(id);
    // Best-effort: record whatever score they had when they left, so
    // someone who quits mid-run with a good score still shows up on
    // the all-time board rather than only players who get eliminated.
    if (player && player.alive && player.score > 0) {
      void recordScore(player.name, player.score);
    }
    this.players.delete(id);
  }

  setPlayerTarget(id: string, tx: number, ty: number) {
    const player = this.players.get(id);
    if (!player || !player.alive) return;
    // Clamp target into world bounds so a malicious client can't send
    // wildly out-of-range coordinates.
    player.setTarget(
      Math.max(0, Math.min(WORLD_WIDTH, tx)),
      Math.max(0, Math.min(WORLD_HEIGHT, ty)),
    );
  }

  private randomPoint() {
    return { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
  }

  private spawnOrbsUpTo(count: number) {
    while (this.orbs.size < count) {
      const p = this.randomPoint();
      const orb = new Orb(p.x, p.y);
      this.orbs.set(orb.id, orb);
    }
  }

  private update() {
    const now = Date.now();
    const dt = (now - this.lastTickAt) / 1000;
    this.lastTickAt = now;
    this.tick++;

    for (const player of this.players.values()) {
      if (player.alive) player.step(dt, WORLD_WIDTH, WORLD_HEIGHT);
    }

    this.rebuildGrids();
    this.handleOrbConsumption();
    this.handlePlayerCollisions();
    this.spawnOrbsUpTo(MAX_ORBS);
    this.broadcastSnapshot();
  }

  private rebuildGrids() {
    this.orbGrid.clear();
    for (const orb of this.orbs.values()) this.orbGrid.insert(orb);

    this.playerGrid.clear();
    for (const player of this.players.values()) {
      if (player.alive) this.playerGrid.insert(player);
    }
  }

  private handleOrbConsumption() {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const reach = player.radius + ORB_RADIUS;
      const nearbyOrbs = this.orbGrid.queryRadius(player.x, player.y, reach);
      for (const orb of nearbyOrbs) {
        if (!this.orbs.has(orb.id)) continue; // already eaten by someone else this tick
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        if (dist < player.radius + orb.radius) {
          player.grow(Math.PI * ORB_RADIUS * ORB_RADIUS * 3);
          this.orbs.delete(orb.id);
        }
      }
    }
  }

  private handlePlayerCollisions() {
    const alivePlayers = [...this.players.values()].filter((p) => p.alive);
    if (alivePlayers.length < 2) return;

    // Upper bound on how far any collision could reach this tick — lets
    // us query a correctly-sized neighborhood per player without
    // needing to know the other party's radius in advance.
    const maxRadius = Math.max(...alivePlayers.map((p) => p.radius));
    const processedPairs = new Set<string>();

    for (const a of alivePlayers) {
      if (!a.alive) continue; // may have just been eliminated earlier in this same loop

      const candidates = this.playerGrid.queryRadius(a.x, a.y, a.radius + maxRadius);
      for (const b of candidates) {
        if (b.id === a.id || !b.alive) continue;

        const pairKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist >= Math.max(a.radius, b.radius)) continue; // no meaningful overlap

        const [big, small] = a.radius >= b.radius ? [a, b] : [b, a];
        if (big.radius >= small.radius * ABSORB_SIZE_RATIO) {
          big.grow(Math.PI * small.radius * small.radius * 0.8);
          small.alive = false;
          this.emitElimination(small, big);
        }
      }
    }
  }

  private emitElimination(eliminated: Player, by: Player) {
    const event: EliminationEvent = {
      eliminatedId: eliminated.id,
      eliminatedName: eliminated.name,
      by: by.id,
      byName: by.name,
    };
    this.io.emit('elimination', event);
    void recordScore(eliminated.name, eliminated.score);
    // Respawn after a short delay so death feels final but not punishing.
    setTimeout(() => this.respawn(eliminated), 1500);
  }

  private respawn(player: Player) {
    if (!this.players.has(player.id)) return; // disconnected while dead
    const spawn = this.randomPoint();
    player.x = spawn.x;
    player.y = spawn.y;
    player.targetX = spawn.x;
    player.targetY = spawn.y;
    player.radius = 16;
    player.score = 0;
    player.alive = true;
  }

  private broadcastSnapshot() {
    const snapshot: GameSnapshot = {
      tick: this.tick,
      serverTime: Date.now(),
      players: [...this.players.values()].map((p) => p.toState()),
      orbs: [...this.orbs.values()].map((o) => o.toState()),
    };
    this.io.emit('snapshot', snapshot);
  }
}