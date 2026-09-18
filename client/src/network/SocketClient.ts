import { io, Socket } from 'socket.io-client';
import { EliminationEvent, GameSnapshot, InputPacket, JoinPacket } from '../types';
import { SERVER_URL } from '../config';

export class SocketClient {
  private socket: Socket;

  constructor() {
    this.socket = io(SERVER_URL, { transports: ['websocket'] });
  }

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