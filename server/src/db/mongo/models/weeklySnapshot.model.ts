import { Schema, model } from "mongoose";

// A frozen copy of a past week's leaderboard, taken at cutover time, so the
// history UI has something richer to render than Postgres's WeeklyResult
// (which only holds rank/earnings, not the point-in-time top-N listing).
export interface WeeklySnapshotEntry {
  rank: number;
  userId: string;
  username: string;
  earningsInCents: number;
}

export interface WeeklySnapshotDocument {
  weekId: string;
  entries: WeeklySnapshotEntry[];
  createdAt: Date;
}

const weeklySnapshotEntrySchema = new Schema<WeeklySnapshotEntry>(
  {
    rank: { type: Number, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    earningsInCents: { type: Number, required: true },
  },
  { _id: false },
);

const weeklySnapshotSchema = new Schema<WeeklySnapshotDocument>({
  weekId: { type: String, required: true, unique: true, index: true },
  entries: { type: [weeklySnapshotEntrySchema], required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

export const WeeklySnapshot = model<WeeklySnapshotDocument>("WeeklySnapshot", weeklySnapshotSchema);
