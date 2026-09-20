import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './game/RoomManager';
import { CreateRoomResponse, InputPacket, JoinPacket, JoinRoomResponse, QuickPlayResponse } from './types';
import { connectMongo } from './db/mongo';
import { getTopScores } from './services/leaderboardService';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Returns [] (never an error) if MongoDB isn't configured — see db/mongo.ts.
app.get('/api/leaderboard/top', async (_req, res) => {
  const rows = await getTopScores(10);
  res.json(rows);
});

void connectMongo();

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  // Each connection can only ever be in one room at a time. These are
  // per-connection closure state, not shared across sockets.
  let roomCode: string | null = null;
  let joinedGame = false;

  socket.on('quickPlay', (_data: unknown, callback: (res: QuickPlayResponse) => void) => {
    if (roomCode) return;
    const code = roomManager.findOrCreateRoomForQuickPlay();
    socket.join(code);
    roomCode = code;
    callback({ roomCode: code });
  });

  socket.on('createRoom', (_data: unknown, callback: (res: CreateRoomResponse) => void) => {
    if (roomCode) return;
    const code = roomManager.createRoom();
    socket.join(code);
    roomCode = code;
    callback({ roomCode: code });
  });

  socket.on('joinRoom', (data: { code?: string }, callback: (res: JoinRoomResponse) => void) => {
    if (roomCode) return;
    const requestedCode = (data?.code ?? '').trim().toUpperCase();
    if (!requestedCode) {
      callback({ error: 'Enter a room code' });
      return;
    }
    const result = roomManager.joinRoomByCode(requestedCode);
    if (!result.ok) {
      callback({ error: result.error });
      return;
    }
    socket.join(requestedCode);
    roomCode = requestedCode;
    callback({ roomCode: requestedCode });
  });

  socket.on('join', (packet: JoinPacket) => {
    if (!roomCode || joinedGame) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    joinedGame = true;
    room.addPlayer(socket.id, packet?.name ?? 'Anon');
  });

  socket.on('input', (packet: InputPacket) => {
    if (!roomCode || !joinedGame) return;
    if (typeof packet?.targetX !== 'number' || typeof packet?.targetY !== 'number') return;
    roomManager.getRoom(roomCode)?.setPlayerTarget(socket.id, packet.targetX, packet.targetY);
  });

  socket.on('disconnect', () => {
    if (roomCode) roomManager.handleDisconnect(roomCode, socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Orb Clash server listening on :${PORT}`);
});