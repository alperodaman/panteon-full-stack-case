import { Schema, model } from "mongoose";

export interface EarningEventDocument {
  userId: string;
  weekId: string;
  amountInCents: number;
  source: string;
  createdAt: Date;
}

const earningEventSchema = new Schema<EarningEventDocument>({
  userId: { type: String, required: true, index: true },
  weekId: { type: String, required: true, index: true },
  amountInCents: { type: Number, required: true },
  source: { type: String, required: true },
  // TTL index: documents are purged 90 days after createdAt.
  createdAt: { type: Date, required: true, default: () => new Date(), expires: 60 * 60 * 24 * 90 },
});

export const EarningEvent = model<EarningEventDocument>("EarningEvent", earningEventSchema);
