import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  // Defaults to 2h rather than a production-sane 15m: this case ships with
  // no refresh-token flow, and a reviewer clicking around the demo shouldn't
  // get logged out mid-session. See README for the production recommendation.
  JWT_EXPIRY: z.string().min(1).default("2h"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Missing or invalid environment variables. See errors above.");
}

export const env = parsed.data;
