import { isMongoConnected } from '../db/mongo';
import { LeaderboardEntryModel } from '../db/LeaderboardEntry';

export interface LeaderboardRow {
  name: string;
  score: number;
}

/**
 * Records a finished run's score. Called from GameRoom on elimination
 * and on disconnect. Deliberately swallows its own errors — a DB
 * hiccup should never crash or stall the game loop that calls it.
 */
export async function recordScore(name: string, score: number): Promise<void> {
  if (!isMongoConnected() || score <= 0) return;
  try {
    await LeaderboardEntryModel.create({ name, score });
  } catch (err) {
    console.error('[leaderboard] failed to record score:', (err as Error).message);
  }
}

export async function getTopScores(limit = 10): Promise<LeaderboardRow[]> {
  if (!isMongoConnected()) return [];
  try {
    const docs = await LeaderboardEntryModel.find().sort({ score: -1 }).limit(limit).lean();
    return docs.map((d) => ({ name: d.name, score: d.score }));
  } catch (err) {
    console.error('[leaderboard] failed to fetch top scores:', (err as Error).message);
    return [];
  }
}