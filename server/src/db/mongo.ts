import mongoose from 'mongoose';

let connected = false;

/**
 * Connects to MongoDB if MONGODB_URI is set. Deliberately non-fatal:
 * if it's not set, or the connection fails, the game keeps running
 * with the persistent leaderboard simply disabled (getTopScores
 * returns [] and recordScore becomes a no-op). This means the project
 * runs with zero external setup for local dev/demo, while still being
 * "real" persistence when a URI is provided in production.
 */
export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[mongo] MONGODB_URI not set — persistent leaderboard disabled (in-memory only)');
    return;
  }
  try {
    await mongoose.connect(uri);
    connected = true;
    console.log('[mongo] connected — persistent leaderboard enabled');
  } catch (err) {
    console.error('[mongo] connection failed, continuing without persistence:', (err as Error).message);
  }
}

export function isMongoConnected(): boolean {
  return connected;
}