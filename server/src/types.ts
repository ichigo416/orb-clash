

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: number; // hex packed as number, e.g. 0xff6b6b
  score: number;
  alive: boolean;
}

export interface OrbState {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: number;
}

export interface GameSnapshot {
  tick: number;
  serverTime: number; // Date.now() at time of snapshot, for interpolation
  players: PlayerState[];
  orbs: OrbState[];
}

// Sent from client -> server whenever the player's target changes
// (i.e. on pointer move), NOT every frame. The server does not trust
// client-reported position — only ever the desired direction/target.
export interface InputPacket {
  targetX: number;
  targetY: number;
}

export interface JoinPacket {
  name: string;
}

export interface EliminationEvent {
  eliminatedId: string;
  eliminatedName: string;
  by: string;
  byName: string;
}

export const WORLD_WIDTH = 3000;
export const WORLD_HEIGHT = 3000;
export const TICK_RATE_HZ = 20;
export const MAX_ORBS = 250;
export const ORB_RADIUS = 6;
export const BASE_PLAYER_RADIUS = 16;
export const BASE_PLAYER_SPEED = 220; // px/sec at minimum size
export const ABSORB_SIZE_RATIO = 1.15; // must be this much bigger to absorb another player
export const GRID_CELL_SIZE = 150; // spatial grid cell size for collision queries, in px
