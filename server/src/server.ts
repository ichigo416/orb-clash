import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { GameRoom } from './game/GameRoom';
import { InputPacket, JoinPacket } from './types';
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

const room = new GameRoom(io);
room.start();

io.on('connection', (socket) => {
  let joined = false;

  socket.on('join', (packet: JoinPacket) => {
    if (joined) return;
    joined = true;
    room.addPlayer(socket.id, packet?.name ?? 'Anon');
  });

  socket.on('input', (packet: InputPacket) => {
    if (!joined) return;
    if (typeof packet?.targetX !== 'number' || typeof packet?.targetY !== 'number') return;
    room.setPlayerTarget(socket.id, packet.targetX, packet.targetY);
  });

  socket.on('disconnect', () => {
    room.removePlayer(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Orb Clash server listening on :${PORT}`);
});