import { describe, expect, it } from "vitest";
import {
  calculateBaseWeights,
  calculatePrizeDistribution,
  calculatePrizePool,
  RankedPlayer,
} from "../src/modules/prizes/prizes.util";

function makeRankedPlayers(count: number): RankedPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `user-${i + 1}`,
    rank: i + 1,
  }));
}

function sumPrizes(awards: { prizeAmountInCents: number }[]): number {
  return awards.reduce((sum, award) => sum + award.prizeAmountInCents, 0);
}

describe("calculatePrizePool", () => {
  it("takes 2% of total weekly earnings", () => {
    expect(calculatePrizePool(1_000_000)).toBe(20_000);
  });

  it("rounds to the nearest cent", () => {
    expect(calculatePrizePool(101)).toBe(2);
  });
});

describe("calculateBaseWeights", () => {
  it("sums to exactly 100 when computed for all 100 ranks", () => {
    const weights = calculateBaseWeights(100);
    const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(100, 9);
  });

  it("assigns fixed 20/15/10 base weights to ranks 1-3", () => {
    const weights = calculateBaseWeights(100);
    expect(weights.get(1)).toBe(20);
    expect(weights.get(2)).toBe(15);
    expect(weights.get(3)).toBe(10);
  });
});

describe("calculatePrizeDistribution", () => {
  it("matches the case spec exactly at N=100: 20%/15%/10% for top 3, full pool distributed", () => {
    const pool = 1_000_000; // whole-cent-friendly pool
    const players = makeRankedPlayers(100);
    const awards = calculatePrizeDistribution(pool, players);

    expect(sumPrizes(awards)).toBe(pool);
    // Floating-point normalization can be off by a cent from the pure integer
    // floor (and any shortfall lands on rank 4 as the rounding remainder), so
    // compare within 1 cent rather than requiring bit-exact equality.
    expect(awards[0].prizeAmountInCents).toBeGreaterThanOrEqual(Math.floor(pool * 0.2) - 1);
    expect(awards[0].prizeAmountInCents).toBeLessThanOrEqual(Math.floor(pool * 0.2) + 1);
    expect(awards[1].prizeAmountInCents).toBeGreaterThanOrEqual(Math.floor(pool * 0.15) - 1);
    expect(awards[1].prizeAmountInCents).toBeLessThanOrEqual(Math.floor(pool * 0.15) + 1);
    expect(awards[2].prizeAmountInCents).toBeGreaterThanOrEqual(Math.floor(pool * 0.1) - 1);
    expect(awards[2].prizeAmountInCents).toBeLessThanOrEqual(Math.floor(pool * 0.1) + 1);
  });

  it("distributes the full pool across 5 ranked players", () => {
    const pool = 123_456;
    const players = makeRankedPlayers(5);
    const awards = calculatePrizeDistribution(pool, players);

    expect(sumPrizes(awards)).toBe(pool);
  });

  it("distributes the full pool and preserves 20:15:10 ratio when only 3 players exist", () => {
    const pool = 100_000;
    const players = makeRankedPlayers(3);
    const awards = calculatePrizeDistribution(pool, players);

    expect(sumPrizes(awards)).toBe(pool);
    // Ratios must stay 20:15:10 -> 40%/30%/20% of pool once normalized over just these 3.
    const [first, second, third] = awards;
    expect(first.prizeAmountInCents / pool).toBeCloseTo(20 / 45, 3);
    expect(second.prizeAmountInCents / pool).toBeCloseTo(15 / 45, 3);
    expect(third.prizeAmountInCents / pool).toBeCloseTo(10 / 45, 3);
  });

  it("awards the entire pool to a single ranked player", () => {
    const pool = 77_777;
    const players = makeRankedPlayers(1);
    const awards = calculatePrizeDistribution(pool, players);

    expect(awards).toHaveLength(1);
    expect(awards[0].prizeAmountInCents).toBe(pool);
  });

  it("returns an empty array when there are no ranked players", () => {
    expect(calculatePrizeDistribution(1000, [])).toEqual([]);
  });

  it("adds the rounding remainder to rank 4 when it exists", () => {
    const pool = 1_000_000 + 1; // deliberately odd to force a remainder
    const players = makeRankedPlayers(100);
    const awards = calculatePrizeDistribution(pool, players);
    const weights = calculateBaseWeights(100);
    const totalBaseWeight = [...weights.values()].reduce((sum, w) => sum + w, 0);

    expect(sumPrizes(awards)).toBe(pool);

    // Every rank other than 4 must be the plain floor of its normalized
    // share; rank 4 alone absorbs whatever floor() left on the table.
    for (const award of awards) {
      const expectedFloor = Math.floor(((weights.get(award.rank) ?? 0) / totalBaseWeight) * pool);
      if (award.rank === 4) {
        expect(award.prizeAmountInCents).toBeGreaterThanOrEqual(expectedFloor);
      } else {
        expect(award.prizeAmountInCents).toBe(expectedFloor);
      }
    }
  });

  it("adds the rounding remainder to rank 1 when rank 4 does not exist", () => {
    const pool = 100_001; // forces a non-zero remainder with only 3 players
    const players = makeRankedPlayers(3);
    const awards = calculatePrizeDistribution(pool, players);

    expect(sumPrizes(awards)).toBe(pool);

    const flooredTotal = Math.floor((20 / 45) * pool) + Math.floor((15 / 45) * pool) + Math.floor((10 / 45) * pool);
    const expectedRemainder = pool - flooredTotal;
    const rank1 = awards.find((a) => a.rank === 1)!;
    expect(rank1.prizeAmountInCents).toBe(Math.floor((20 / 45) * pool) + expectedRemainder);
  });
});
