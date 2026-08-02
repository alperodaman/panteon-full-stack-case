import "dotenv/config";
import { randomUUID } from "crypto";
import { faker } from "@faker-js/faker";
import { prisma } from "../config/postgres";
import { redis } from "../config/redis";
import { connectMongo, mongoose } from "../config/mongo";
import { EarningEvent } from "../db/mongo/models/earningEvent.model";
import { WeeklySnapshot } from "../db/mongo/models/weeklySnapshot.model";
import { getIsoWeekId } from "../modules/leaderboard/week.util";

// Population size is a demo/review-experience choice, NOT a scalability
// test. The architecture (Redis ZSET -> O(log N) ZADD/ZREVRANK/ZREVRANGE,
// a stateless Express API, and a cutover that only ever writes the top 100
// into Postgres) is already designed for 2M+ active users regardless of how
// many rows are seeded here -- the algorithmic guarantees don't change with
// N. 10,000 was picked as the top of the case's suggested 5,000-10,000
// range purely because it costs nothing extra at seed time and makes the
// top100 / +-3/-2 window scenarios look more populated in a demo.
const USER_COUNT = 10_000;
const MAX_EARNING_IN_CENTS = 5_000_000; // $50,000.00 ceiling for the power-law draw
const HISTORICAL_WEEKS = 2;
const HISTORY_TOP_N = 100;
const PRIZE_POOL_IN_CENTS = 1_000_000; // $10,000.00 per historical week
const PRIZED_RANKS = 10;

const ADMIN_USERNAME = "admin";
const DEMO_TOP_USERNAME = "demo_top_player";
const DEMO_REGULAR_USERNAME = "demo_regular_player";

interface SeedUser {
  id: string;
  username: string;
  email: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Power-law (whale) draw instead of flat Math.random(): real idle/clicker
// economies are dominated by a long tail of low/casual earners with a
// handful of "whale" outliers far above the median. Cubing a uniform [0,1)
// draw pushes most samples toward 0 while still letting a few land near 1 --
// exactly the shape needed to make the top100 cutoff and the +-3/-2 window
// scenarios look like a real leaderboard instead of a uniform, undifferentiated
// blob where everyone's earnings are roughly the same.
function powerLawEarningsInCents(): number {
  return Math.floor(Math.pow(Math.random(), 3) * MAX_EARNING_IN_CENTS);
}

async function clearExistingSeedData(): Promise<void> {
  // Postgres: demo data only lives in these four tables, deleted in
  // FK-safe order. deleteMany (not TRUNCATE) keeps this working the same
  // way whether or not the seed has ever run before.
  await prisma.prizeDistribution.deleteMany({});
  await prisma.weeklyResult.deleteMany({});
  await prisma.user.deleteMany({});

  // Mongo: all EarningEvent/WeeklySnapshot documents are seed/demo-produced.
  await EarningEvent.deleteMany({});
  await WeeklySnapshot.deleteMany({});

  // Redis: scoped SCAN+DEL rather than FLUSHDB. This is a local/demo seed
  // script, and FLUSHDB would be fine in that narrow context, but SCAN+DEL
  // is preferred anyway so the script only ever touches keys it owns --
  // it won't nuke unrelated keys (e.g. rate-limit-redis counters) that
  // might coexist in the same local Redis instance. Production would never
  // run this script or use FLUSHDB at all.
  const patterns = ["leaderboard:week:*", "leaderboard:archive:*", "earnings:week:*"];
  for (const pattern of patterns) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", "1000");
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  }
  await redis.del("config:currentWeekId");
}

function buildFakeUsers(count: number): SeedUser[] {
  const users: SeedUser[] = [];
  const usedUsernames = new Set<string>();

  for (let i = 0; i < count; i++) {
    let username = faker.internet.username().toLowerCase();
    while (usedUsernames.has(username)) {
      username = `${username}${i}`;
    }
    usedUsernames.add(username);

    users.push({
      id: randomUUID(),
      username,
      email: `player${i}@example.com`,
    });
  }

  return users;
}

function weekIdWeeksAgo(weeksAgo: number): string {
  const now = new Date();
  const past = new Date(now.getTime() - weeksAgo * 7 * 24 * 60 * 60 * 1000);
  return getIsoWeekId(past);
}

function compoundScore(earningsInCents: number, minutesSinceWeekStart: number): number {
  return earningsInCents * 20000 + (20000 - minutesSinceWeekStart);
}

async function seedActiveWeek(
  currentWeekId: string,
  fakeUsers: SeedUser[],
  fakeEarnings: number[],
  demoTop: SeedUser,
  demoRegular: SeedUser,
): Promise<{ demoTopRank: number; demoRegularRank: number }> {
  const sortedEarnings = [...fakeEarnings].sort((a, b) => a - b);
  const maxFakeEarning = sortedEarnings[sortedEarnings.length - 1] ?? 0;
  const medianFakeEarning = sortedEarnings[Math.floor(sortedEarnings.length / 2)] ?? 0;

  // Deterministic, not probabilistic: rather than trust the power-law draw
  // to naturally place these two accounts on either side of the top100 cut,
  // pin their earnings directly against the generated distribution so the
  // demo reliably has one known top100 login and one known outside-top100
  // login to walk through in review.
  const demoTopEarnings = maxFakeEarning + 100_000; // guaranteed rank 1
  const demoRegularEarnings = medianFakeEarning; // ~5,000 users above it, guaranteed outside top100

  const entries: { userId: string; earningsInCents: number }[] = fakeUsers.map((user, i) => ({
    userId: user.id,
    earningsInCents: fakeEarnings[i]!,
  }));
  entries.push({ userId: demoTop.id, earningsInCents: demoTopEarnings });
  entries.push({ userId: demoRegular.id, earningsInCents: demoRegularEarnings });

  const zaddArgs: (string | number)[] = [];
  const hsetArgs: (string | number)[] = [];
  for (const entry of entries) {
    const minutesSinceWeekStart = Math.floor(Math.random() * 10_080); // random point in the week
    zaddArgs.push(compoundScore(entry.earningsInCents, minutesSinceWeekStart), entry.userId);
    hsetArgs.push(entry.userId, entry.earningsInCents);
  }

  const leaderboardKey = `leaderboard:week:${currentWeekId}`;
  const earningsKey = `earnings:week:${currentWeekId}`;

  for (const batch of chunk(zaddArgs, 2000)) {
    await redis.zadd(leaderboardKey, ...batch);
  }
  for (const batch of chunk(hsetArgs, 2000)) {
    await redis.hset(earningsKey, ...batch);
  }

  await redis.set("config:currentWeekId", currentWeekId);

  const demoTopRank = (await redis.zrevrank(leaderboardKey, demoTop.id))! + 1;
  const demoRegularRank = (await redis.zrevrank(leaderboardKey, demoRegular.id))! + 1;

  return { demoTopRank, demoRegularRank };
}

async function seedHistoricalWeeks(candidateUsers: SeedUser[]): Promise<string[]> {
  const weekIds: string[] = [];

  for (let weeksAgo = 1; weeksAgo <= HISTORICAL_WEEKS; weeksAgo++) {
    const weekId = weekIdWeeksAgo(weeksAgo);
    weekIds.push(weekId);

    const participants = faker.helpers.arrayElements(candidateUsers, HISTORY_TOP_N);
    const earnings = participants
      .map(() => powerLawEarningsInCents())
      .sort((a, b) => b - a);

    const weeklyResultRows = participants.map((user, index) => ({
      weekId,
      userId: user.id,
      rank: index + 1,
      earningsInCents: earnings[index]!,
    }));
    await prisma.weeklyResult.createMany({ data: weeklyResultRows });

    const prizeRows = participants.slice(0, PRIZED_RANKS).map((user, index) => {
      const rank = index + 1;
      // Simple decreasing curve (weight ~ 1/rank), normalized against the
      // fixed pool so shares fall off quickly after the first few ranks --
      // "reasonable" rather than an exact economic model, per the brief.
      const weight = 1 / rank;
      const totalWeight = Array.from({ length: PRIZED_RANKS }, (_, i) => 1 / (i + 1)).reduce(
        (a, b) => a + b,
        0,
      );
      return {
        weekId,
        userId: user.id,
        rank,
        prizeAmountInCents: Math.floor((weight / totalWeight) * PRIZE_POOL_IN_CENTS),
        poolTotalInCents: PRIZE_POOL_IN_CENTS,
      };
    });
    await prisma.prizeDistribution.createMany({ data: prizeRows });

    const usernameById = new Map(participants.map((user) => [user.id, user.username]));
    await WeeklySnapshot.create({
      weekId,
      entries: weeklyResultRows.map((row) => ({
        rank: row.rank,
        userId: row.userId,
        username: usernameById.get(row.userId) ?? "unknown",
        earningsInCents: row.earningsInCents,
      })),
    });
  }

  return weekIds;
}

async function main(): Promise<void> {
  await connectMongo();

  console.log("Clearing previously seeded data (idempotent re-run)...");
  await clearExistingSeedData();

  console.log(`Generating ${USER_COUNT} fake users with power-law earnings...`);
  const fakeUsers = buildFakeUsers(USER_COUNT);
  const fakeEarnings = fakeUsers.map(() => powerLawEarningsInCents());

  const adminUser: SeedUser = {
    id: randomUUID(),
    username: ADMIN_USERNAME,
    email: "admin@example.com",
  };
  const demoTop: SeedUser = {
    id: randomUUID(),
    username: DEMO_TOP_USERNAME,
    email: "demo_top_player@example.com",
  };
  const demoRegular: SeedUser = {
    id: randomUUID(),
    username: DEMO_REGULAR_USERNAME,
    email: "demo_regular_player@example.com",
  };

  console.log("Writing users to Postgres...");
  for (const batch of chunk(fakeUsers, 2000)) {
    await prisma.user.createMany({
      data: batch.map((user) => ({ id: user.id, username: user.username, email: user.email })),
    });
  }
  await prisma.user.create({
    data: { id: adminUser.id, username: adminUser.username, email: adminUser.email, role: "ADMIN" },
  });
  await prisma.user.create({
    data: { id: demoTop.id, username: demoTop.username, email: demoTop.email },
  });
  await prisma.user.create({
    data: { id: demoRegular.id, username: demoRegular.username, email: demoRegular.email },
  });

  const currentWeekId = getIsoWeekId(new Date());
  console.log(`Seeding active week ${currentWeekId} into Redis...`);
  const { demoTopRank, demoRegularRank } = await seedActiveWeek(
    currentWeekId,
    fakeUsers,
    fakeEarnings,
    demoTop,
    demoRegular,
  );

  console.log(`Seeding ${HISTORICAL_WEEKS} historical week(s) into Postgres + Mongo...`);
  const historicalWeekIds = await seedHistoricalWeeks(fakeUsers);

  const totalUsers = fakeUsers.length + 3; // + admin + demoTop + demoRegular

  console.log("\nSeed complete.");
  console.log(`Total users seeded: ${totalUsers}`);
  console.log(`Current week: ${currentWeekId}`);
  console.log(`Historical weeks seeded: ${historicalWeekIds.join(", ")}`);
  console.log(`Admin login username: ${adminUser.username} (role ADMIN)`);
  console.log(
    `Demo top-100 login username: ${demoTop.username} (rank ${demoTopRank} in ${currentWeekId})`,
  );
  console.log(
    `Demo outside-top-100 login username: ${demoRegular.username} (rank ${demoRegularRank} in ${currentWeekId})`,
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.quit();
    await mongoose.connection.close();
  });
