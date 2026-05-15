function buildChallengeBody(options) {
  const opts = options || {};
  const mapId = opts.mapId || "classic";
  if (opts.opponentTankId !== undefined && opts.opponentTankId !== null && opts.opponentTankId !== "") {
    const opponentTankId = Number(opts.opponentTankId);
    if (!Number.isFinite(opponentTankId)) {
      throw new Error(`Invalid opponentTankId: ${opts.opponentTankId}`);
    }
    return { opponentTankId, mapId };
  }
  return { randomOpponent: true, mapId };
}

function rawResult(result) {
  return result && result.raw ? result.raw : {};
}

function replayRecords(result) {
  const raw = rawResult(result);
  return (raw.replayData && raw.replayData.replay && raw.replayData.replay.records) || [];
}

function inferOpponentSkill(result) {
  const raw = rawResult(result);
  const direct =
    result && result.opponentSkillType ||
    raw.defenderSkillType ||
    raw.defenderTankSkillType ||
    raw.defenderSkill && raw.defenderSkill.type ||
    raw.defender && raw.defender.skillType ||
    raw.defenderTank && raw.defenderTank.skillType ||
    raw.match && raw.match.defenderSkillType ||
    raw.match && raw.match.defenderSkill && raw.match.defenderSkill.type;
  if (direct) return direct;

  for (const frame of replayRecords(result)) {
    for (const event of frame || []) {
      if (event && event.type === "skill" && Number(event.by) === 1 && event.skillType) {
        return event.skillType;
      }
    }
  }
  return "unknown";
}

function outcomeKey(status) {
  if (status === "win") return "wins";
  if (status === "loss") return "losses";
  if (status === "error") return "errors";
  return "draws";
}

function opponentName(result) {
  const raw = rawResult(result);
  return raw.defenderTankName || raw.match && raw.match.defenderTankName || "unknown";
}

function emptySkillBucket(skill) {
  return {
    skill,
    total: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    errors: 0,
    winRate: 0,
    opponents: [],
  };
}

function emptyOpponent(tankId, name) {
  return {
    tankId,
    name,
    total: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    errors: 0,
  };
}

function summarizeBySkill(results) {
  const buckets = {};
  const opponentMaps = {};
  for (const result of results || []) {
    const skill = inferOpponentSkill(result);
    if (!buckets[skill]) {
      buckets[skill] = emptySkillBucket(skill);
      opponentMaps[skill] = new Map();
    }

    const bucket = buckets[skill];
    const outcome = outcomeKey(result && result.status);
    bucket.total++;
    bucket[outcome]++;

    const tankId = result && result.opponentTankId || rawResult(result).defenderTankId || "unknown";
    const key = String(tankId);
    if (!opponentMaps[skill].has(key)) {
      opponentMaps[skill].set(key, emptyOpponent(tankId, opponentName(result)));
    }
    const opponent = opponentMaps[skill].get(key);
    opponent.total++;
    opponent[outcome]++;
  }

  for (const bucket of Object.values(buckets)) {
    bucket.winRate = bucket.total ? bucket.wins / bucket.total : 0;
    bucket.opponents = opponentMaps[bucket.skill].values ? Array.from(opponentMaps[bucket.skill].values()) : [];
  }
  return buckets;
}

module.exports = {
  buildChallengeBody,
  inferOpponentSkill,
  summarizeBySkill,
};
