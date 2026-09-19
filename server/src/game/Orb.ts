import { ORB_RADIUS, OrbState } from '../types';

let orbCounter = 0;

export class Orb {
  id: string;
  x: number;
  y: number;
  radius: number = ORB_RADIUS;
  color: number;

  constructor(x: number, y: number) {
    this.id = `orb_${orbCounter++}`;
    this.x = x;
    this.y = y;
    // Warm palette so orbs read as "food" distinct from player blobs.
    const hues = [0xffd166, 0x06d6a0, 0xef476f, 0x118ab2];
    this.color = hues[Math.floor(Math.random() * hues.length)];
  }

  toState(): OrbState {
    return { id: this.id, x: this.x, y: this.y, radius: this.radius, color: this.color };
  }
}