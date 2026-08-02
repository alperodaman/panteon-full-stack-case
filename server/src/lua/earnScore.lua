-- KEYS[1]: earnings:week:{weekId} hash key
-- ARGV[1]: userId
-- ARGV[2]: amountInCents
-- ARGV[3]: minutesSinceWeekStart
-- ARGV[4]: weekId
--
-- Atomically accumulates a user's weekly earnings and recomputes their
-- compound leaderboard score in a single round-trip, so no reader can ever
-- observe an earnings hash that is out of sync with the leaderboard ZSET.

local earningsKey = KEYS[1]
local userId = ARGV[1]
local amountInCents = tonumber(ARGV[2])
local minutesSinceWeekStart = tonumber(ARGV[3])
local weekId = ARGV[4]

local leaderboardKey = "leaderboard:week:" .. weekId

local newEarnings = redis.call("HINCRBY", earningsKey, userId, amountInCents)

local score = newEarnings * 20000 + (20000 - minutesSinceWeekStart)

redis.call("ZADD", leaderboardKey, score, userId)

return { newEarnings, score }
