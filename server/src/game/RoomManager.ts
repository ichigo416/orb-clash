import { Server } from 'socket.io';
import { GameRoom } from './GameRoom';
import { MAX_PLAYERS_PER_ROOM } from '../types';

// Excludes 0/O and 1/I so a spoken or handwritten code is never ambiguous.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface JoinRoomResult {
  ok: boolean;
  error?: string;
}

/**
 * Owns every active GameRoom (arena) plus the lobby logic for getting a
 * player into one. Each GameRoom runs its own independent tick loop and
 * broadcasts only to its own socket.io room (`io.to(code).emit(...)`),
 * so arenas are fully isolated — players in room "ABC123" never see
 * players in room "XYZ789", even though both loops run in the same
 * Node process.
 *
 * Three ways in, mirroring how most real .io-style games do lobbies:
 * - Quick Play: auto-matched into any room under capacity, or a fresh
 *   one is spun up if every existing room is full (or none exist yet).
 * - Create Room: get a fresh shareable code, for playing with friends.
 * - Join Room: enter an existing code.
 *
 * Empty rooms are torn down immediately (tick interval cleared, entry
 * removed) so a stream of players creating and leaving rooms doesn't
 * leak timers or memory.
 */
export class RoomManager {
  private rooms = new Map<string, GameRoom>();

  constructor(private io: Server) {}

  createRoom(): string {
    const code = this.generateUniqueCode();
    const room = new GameRoom(this.io, code);
    room.start();
    this.rooms.set(code, room);
    return code;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  /** Finds a room with space; creates a new one if every room is full or none exist. */
  findOrCreateRoomForQuickPlay(): string {
    for (const [code, room] of this.rooms.entries()) {
      if (room.getPlayerCount() < MAX_PLAYERS_PER_ROOM) return code;
    }
    return this.createRoom();
  }

  joinRoomByCode(code: string): JoinRoomResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.getPlayerCount() >= MAX_PLAYERS_PER_ROOM) return { ok: false, error: 'Room is full' };
    return { ok: true };
  }

  /** Removes a player from their room and tears the room down if it's now empty. */
  handleDisconnect(code: string, socketId: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.removePlayer(socketId);
    if (room.getPlayerCount() === 0) {
      room.stop();
      this.rooms.delete(code);
    }
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private generateUniqueCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }
}