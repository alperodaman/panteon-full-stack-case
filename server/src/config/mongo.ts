import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../logger";

mongoose.connection.on("connected", () => {
  logger.info("MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  logger.error({ err }, "MongoDB connection error");
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected");
});

export const connectMongo = () => mongoose.connect(env.MONGO_URI);

export { mongoose };
