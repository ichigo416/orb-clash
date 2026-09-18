import { BASE_PLAYER_RADIUS, BASE_PLAYER_SPEED, PlayerState } from '../types';

const COLORS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x1a936f, 0xa06cd5, 0xff9f1c, 0x2ec4b6, 0xe63946];

export class Player {
  id: string;
  name: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number = BASE_PLAYER_RADIUS;
  score: number = 0;
  color: number;
  alive: boolean = true;
  lastInputAt: number = Date.now();

  constructor(id: string, name: string, x: number, y: number) {
    this.id = id;
    this.name = name.slice(0, 16) || 'Anon';
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  // Speed shrinks slightly as the player grows, so bigger blobs are
  // powerful but not simply "always optimal" — keeps chases fair.
  get speed(): number {
    return Math.max(70, BASE_PLAYER_SPEED - (this.radius - BASE_PLAYER_RADIUS) * 0.8);
  }

  setTarget(tx: number, ty: number) {
    this.targetX = tx;
    this.targetY = ty;
    this.lastInputAt = Date.now();
  }

  // Advances the player toward its target by one tick's worth of movement.
  // This is the ONLY place player position changes — never trust a
  // client-reported x/y directly.
  step(dtSeconds: number, worldWidth: number, worldHeight: number) {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const moveDist = Math.min(dist, this.speed * dtSeconds);
      this.x += (dx / dist) * moveDist;
      this.y += (dy / dist) * moveDist;
    }
    this.x = Math.max(this.radius, Math.min(worldWidth - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(worldHeight - this.radius, this.y));
  }

  grow(amount: number) {
    // Area-based growth (not linear radius) so early orbs matter more
    // proportionally than late ones — mirrors real agar-style balancing.
    const currentArea = Math.PI * this.radius * this.radius;
    const newArea = currentArea + amount;
    this.radius = Math.sqrt(newArea / Math.PI);
    this.score += Math.round(amount);
  }

  toState(): PlayerState {
    return {
      id: this.id,
      name: this.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      radius: Math.round(this.radius * 10) / 10,
      color: this.color,
      score: this.score,
      alive: this.alive,
    };
  }
}
