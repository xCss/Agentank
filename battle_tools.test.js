const assert = require("assert");

const {
  buildChallengeBody,
  inferOpponentSkill,
  summarizeBySkill,
} = require("./battle_tools");

assert.deepStrictEqual(
  buildChallengeBody(),
  { randomOpponent: true, mapId: "classic" },
  "default challenges should keep using random opponents on classic"
);

assert.deepStrictEqual(
  buildChallengeBody({ opponentTankId: "1021" }),
  { opponentTankId: 1021, mapId: "classic" },
  "targeted challenges should send opponentTankId"
);

assert.strictEqual(
  inferOpponentSkill({
    raw: { defenderSkillType: "teleport" },
  }),
  "teleport",
  "opponent skill should prefer direct defender skill metadata when present"
);

assert.strictEqual(
  inferOpponentSkill({
    raw: {
      replayData: {
        replay: {
          records: [
            [{ type: "skill", by: 0, skillType: "boost", action: "cast" }],
            [{ type: "skill", by: 1, skillType: "cloak", action: "cast" }],
          ],
        },
      },
    },
  }),
  "cloak",
  "opponent skill should be inferred from defender skill events, not Ant skill events"
);

assert.deepStrictEqual(
  summarizeBySkill([
    {
      status: "win",
      opponentTankId: 10,
      raw: {
        defenderTankName: "Cloaker",
        replayData: { replay: { records: [[{ type: "skill", by: 1, skillType: "cloak" }]] } },
      },
    },
    {
      status: "loss",
      opponentTankId: 11,
      raw: {
        defenderTankName: "Cloaker 2",
        replayData: { replay: { records: [[{ type: "skill", by: 1, skillType: "cloak" }]] } },
      },
    },
    {
      status: "draw",
      opponentTankId: 12,
      raw: {
        defenderTankName: "Mystery",
        replayData: { replay: { records: [[]] } },
      },
    },
  ]),
  {
    cloak: {
      skill: "cloak",
      total: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      errors: 0,
      winRate: 0.5,
      opponents: [
        { tankId: 10, name: "Cloaker", total: 1, wins: 1, losses: 0, draws: 0, errors: 0 },
        { tankId: 11, name: "Cloaker 2", total: 1, wins: 0, losses: 1, draws: 0, errors: 0 },
      ],
    },
    unknown: {
      skill: "unknown",
      total: 1,
      wins: 0,
      losses: 0,
      draws: 1,
      errors: 0,
      winRate: 0,
      opponents: [
        { tankId: 12, name: "Mystery", total: 1, wins: 0, losses: 0, draws: 1, errors: 0 },
      ],
    },
  },
  "summaries should group outcomes by inferred skill and preserve opponent breakdowns"
);

console.log("battle tools tests passed");
