import mongoose, { Schema, Document } from 'mongoose';

export interface LeaderboardEntryDoc extends Document {
  name: string;
  score: number;
  createdAt: Date;
}

const leaderboardEntrySchema = new Schema<LeaderboardEntryDoc>({
  name: { type: String, required: true, maxlength: 16 },
  score: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Every read on this collection sorts by score descending, so index it.
leaderboardEntrySchema.index({ score: -1 });

export const LeaderboardEntryModel = mongoose.model<LeaderboardEntryDoc>(
  'LeaderboardEntry',
  leaderboardEntrySchema,
);