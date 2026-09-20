import { io, Socket } from 'socket.io-client';
import {
  CreateRoomResponse,
  EliminationEvent,
  GameSnapshot,
  InputPacket,
  JoinPacket,
  JoinRoomResponse,
  QuickPlayResponse,
} from '../types';
import { SERVER_URL } from '../config';

export class SocketClient {
  private socket: Socket;

  constructor() {
    this.socket = io(SERVER_URL, { transports: ['websocket'] });
  }

  // --- Lobby: exactly one of these should be called, before join() ---

  quickPlay(): Promise<QuickPlayResponse> {
    return new Promise((resolve) => {
      this.socket.emit('quickPlay', {}, (res: QuickPlayResponse) => resolve(res));
    });
  }

  createRoom(): Promise<CreateRoomResponse> {
    return new Promise((resolve) => {
      this.socket.emit('createRoom', {}, (res: CreateRoomResponse) => resolve(res));
    });
  }

  joinRoom(code: string): Promise<JoinRoomResponse> {
    return new Promise((resolve) => {
      this.socket.emit('joinRoom', { code }, (res: JoinRoomResponse) => resolve(res));
    });
  }

  // --- Gameplay: only valid after one of the lobby calls above resolves ---

  join(name: string) {
    const packet: JoinPacket = { name };
    this.socket.emit('join', packet);
  }

  // Input is sent on every pointer move, throttled by the caller —
  // NOT every render frame. See GameScene for the throttling.
  sendInput(targetX: number, targetY: number) {
    const packet: InputPacket = { targetX, targetY };
    this.socket.emit('input', packet);
  }

  onSnapshot(cb: (snapshot: GameSnapshot) => void) {
    this.socket.on('snapshot', cb);
  }

  onElimination(cb: (event: EliminationEvent) => void) {
    this.socket.on('elimination', cb);
  }

  onConnect(cb: () => void) {
    this.socket.on('connect', cb);
  }

  onDisconnect(cb: () => void) {
    this.socket.on('disconnect', cb);
  }

  get id(): string | undefined {
    return this.socket.id;
  }
}