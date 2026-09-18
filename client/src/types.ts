// Mirrors server/src/types.ts. Kept as a plain duplicate rather than a
// shared package to keep this a two-folder deploy (server + client)
// with zero build-tooling coupling between them. In a larger project
// this would live in a shared workspace package instead.

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: number;
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
  serverTime: number;
  players: PlayerState[];
  orbs: OrbState[];
}

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
