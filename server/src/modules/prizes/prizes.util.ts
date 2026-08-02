// Prize distribution is a pure calculation over ranked players — no DB/IO here.
//
// The case spec defines shares only for N=100 (1st=20%, 2nd=15%, 3rd=10%, and
// the remaining 55% split across ranks 4-100 proportional to 1/rank). Rather
// than branching on N (<4, 4..99, ==100, etc.), we compute a fixed baseWeight
// per rank and then normalize by the sum of baseWeights for the ranks that
// actually exist. At N=100 the normalization factor is exactly 1 (the base
// weights already sum to 100), so behavior is identical to the spec. For
// N<100 it guarantees the whole pool is distributed instead of leaving the
// "ranks that don't exist" share undistributed.

const HARMONIC_START_RANK = 4;
const HARMONIC_END_RANK = 100;

export interface RankedPlayer {
  userId: string;
  rank: number;
}

export interface PrizeAward {
  userId: string;
  rank: number;
  prizeAmountInCents: number;
}

function harmonicSum(fromRank: number, toRank: number): number {
  let sum = 0;
  for (let r = fromRank; r <= toRank; r++) {
    sum += 1 / r;
  }
  return sum;
}

export function calculatePrizePool(totalEarningsInCents: number): number {
  return Math.round(totalEarningsInCents * 0.02);
}

export function calculateBaseWeights(maxRank: number): Map<number, number> {
  const weights = new Map<number, number>();
  const cap = Math.min(maxRank, HARMONIC_END_RANK);
  const tailHarmonicSum = harmonicSum(HARMONIC_START_RANK, HARMONIC_END_RANK);

  for (let rank = 1; rank <= cap; rank++) {
    if (rank === 1) {
      weights.set(rank, 20);
    } else if (rank === 2) {
      weights.set(rank, 15);
    } else if (rank === 3) {
      weights.set(rank, 10);
    } else {
      weights.set(rank, (55 * (1 / rank)) / tailHarmonicSum);
    }
  }

  return weights;
}

export function calculatePrizeDistribution(
  pool: number,
  rankedPlayers: RankedPlayer[]
): PrizeAward[] {
  if (rankedPlayers.length === 0) {
    return [];
  }

  const maxRank = Math.min(
    Math.max(...rankedPlayers.map((player) => player.rank)),
    HARMONIC_END_RANK
  );
  const baseWeights = calculateBaseWeights(maxRank);
  const totalBaseWeight = rankedPlayers.reduce(
    (sum, player) => sum + (baseWeights.get(player.rank) ?? 0),
    0
  );

  const awards: PrizeAward[] = rankedPlayers.map((player) => {
    const weight = baseWeights.get(player.rank) ?? 0;
    const normalizedWeight = totalBaseWeight > 0 ? weight / totalBaseWeight : 0;
    return {
      userId: player.userId,
      rank: player.rank,
      prizeAmountInCents: Math.floor(normalizedWeight * pool),
    };
  });

  const distributed = awards.reduce((sum, award) => sum + award.prizeAmountInCents, 0);
  const remainder = pool - distributed;

  const rank4Index = awards.findIndex((award) => award.rank === 4);
  const rank1Index = awards.findIndex((award) => award.rank === 1);
  const remainderIndex = rank4Index !== -1 ? rank4Index : rank1Index;

  const remainderAward = remainderIndex !== -1 ? awards[remainderIndex] : undefined;
  if (remainderAward) {
    remainderAward.prizeAmountInCents += remainder;
  }

  return awards;
}
