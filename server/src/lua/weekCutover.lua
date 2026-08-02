-- ARGV[1]: oldWeekId
-- ARGV[2]: newWeekId
--
-- Idempotent weekly cutover: archives the outgoing leaderboard, drops the
-- now-useless earnings hash, and advances the active week pointer.

local oldWeekId = ARGV[1]
local newWeekId = ARGV[2]

local oldLeaderboardKey = "leaderboard:week:" .. oldWeekId
local archiveKey = "leaderboard:archive:" .. oldWeekId
local oldEarningsKey = "earnings:week:" .. oldWeekId

-- Archive the leaderboard only if it still exists under its live key. If a
-- previous, partially-retried call already renamed it, this is a no-op and
-- we leave the existing archive key untouched (idempotent).
if redis.call("EXISTS", oldLeaderboardKey) == 1 then
  redis.call("RENAME", oldLeaderboardKey, archiveKey)
  redis.call("EXPIRE", archiveKey, 2592000)
end

-- earnings:week:{weekId} only ever exists to let earnScore.lua recompute a
-- compound score during the *active* week. Post-cutover, results and prizes
-- are derived solely from the archived ZSET scores, so this hash serves no
-- further purpose. We delete it explicitly here rather than relying on a
-- TTL: at 10M registered / 2M active users, letting weeks of dead hashes
-- accumulate until they expire is pure memory waste for zero benefit. DEL
-- is a no-op on a key that doesn't exist, so this stays idempotent too.
redis.call("DEL", oldEarningsKey)

redis.call("SET", "config:currentWeekId", newWeekId)

return "OK"
