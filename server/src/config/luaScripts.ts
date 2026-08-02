import fs from "fs";
import path from "path";
import type Redis from "ioredis";
import { redis } from "./redis";

declare module "ioredis" {
  interface RedisCommander<Context> {
    earnScore(
      earningsKey: string,
      userId: string,
      amountInCents: number | string,
      minutesSinceWeekStart: number | string,
      weekId: string,
    ): Promise<[number, number]>;

    rankWindow(
      leaderboardKey: string,
      userId: string,
    ): Promise<[number, number, string[]] | null>;

    weekCutover(oldWeekId: string, newWeekId: string): Promise<"OK">;
  }
}

const LUA_DIR = path.join(__dirname, "..", "lua");

function readScript(fileName: string): string {
  return fs.readFileSync(path.join(LUA_DIR, fileName), "utf8");
}

export function loadLuaScripts(client: Redis): void {
  client.defineCommand("earnScore", {
    numberOfKeys: 1,
    lua: readScript("earnScore.lua"),
  });

  client.defineCommand("rankWindow", {
    numberOfKeys: 1,
    lua: readScript("rankWindow.lua"),
  });

  client.defineCommand("weekCutover", {
    numberOfKeys: 0,
    lua: readScript("weekCutover.lua"),
  });
}

loadLuaScripts(redis);
