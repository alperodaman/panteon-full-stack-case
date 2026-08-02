-- KEYS[1]: leaderboard:week:{weekId} ZSET key
-- ARGV[1]: userId
--
-- Returns, in a single round-trip, the rank window centered on userId:
-- up to 3 places above and 2 places below their own rank (0-indexed,
-- highest score first). Clamps at both edges of the ZSET so it never
-- requests a negative start index or overruns the end.
--
-- Return shape:
--   nil                                     -- userId not on the leaderboard
--   { selfRank, startRank, { id, score, id, score, ... } }

local leaderboardKey = KEYS[1]
local userId = ARGV[1]

local selfRank = redis.call("ZREVRANK", leaderboardKey, userId)

if selfRank == false or selfRank == nil then
  return nil
end

local startRank = selfRank - 3
if startRank < 0 then
  startRank = 0
end

local stopRank = selfRank + 2

local entries = redis.call("ZREVRANGE", leaderboardKey, startRank, stopRank, "WITHSCORES")

return { selfRank, startRank, entries }
