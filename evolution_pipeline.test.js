const assert = require("assert");

const {
  buildRunId,
  classifyReport,
  decisionLine,
  runPaths,
} = require("./evolution_pipeline");

assert.strictEqual(
  buildRunId("progressive", "2026-05-15T12:34:56.789Z"),
  "20260515T123456789Z-progressive",
  "run IDs should be stable filesystem-safe timestamps plus source"
);

assert.strictEqual(
  buildRunId("../bad source", "2026-05-15T12:34:56.789Z"),
  "20260515T123456789Z-bad-source",
  "run IDs should sanitize caller-provided source labels"
);

assert.deepStrictEqual(
  runPaths("20260515T123456789Z-progressive"),
  {
    raw: "runs/raw/20260515T123456789Z-progressive.json",
    classified: "runs/classified/20260515T123456789Z-progressive.json",
    analysis: "runs/analysis/20260515T123456789Z-progressive.md",
    proposal: "runs/proposals/20260515T123456789Z-progressive.md",
    publish: "runs/publish/20260515T123456789Z-progressive.json",
    strategyState: "runs/strategy_state.json",
  },
  "run paths should define the full A/B/C/D/E and strategist file handoff contract"
);

assert.deepStrictEqual(
  classifyReport({
    generatedAt: "2026-05-15T12:34:56.789Z",
    tankId: 707,
    progressive: true,
    stages: [
      { target: 3, minWins: 2 },
      { target: 5, minWins: 4 },
    ],
    stoppedAt: 5,
    results: [
      {
        index: 1,
        status: "loss",
        reason: "star",
        opponentTankId: 11,
        matchUrlId: "mat_loss",
        replayUrl: "https://agentank.ai/history/mat_loss",
        raw: {
          defenderTankName: "Blink",
          replayData: {
            replay: {
              records: [[{ type: "skill", by: 1, skillType: "teleport", action: "cast" }]],
            },
          },
        },
      },
      {
        index: 2,
        status: "win",
        reason: "crashed",
        opponentTankId: 12,
        matchUrlId: "mat_win",
        raw: { defenderTankName: "Mystery", replayData: { replay: { records: [[]] } } },
      },
    ],
  }, "20260515T123456789Z-progressive", "progressive"),
  {
    runId: "20260515T123456789Z-progressive",
    source: "progressive",
    generatedAt: "2026-05-15T12:34:56.789Z",
    tankId: 707,
    summary: {
      total: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      errors: 0,
      winRate: 0.5,
    },
    gate: {
      mode: "progressive",
      stage: 5,
      minWins: 4,
      passed: false,
      eligibleForKeep: false,
    },
    bySkill: {
      teleport: {
        skill: "teleport",
        total: 1,
        wins: 0,
        losses: 1,
        draws: 0,
        errors: 0,
        winRate: 0,
        opponents: [
          { tankId: 11, name: "Blink", total: 1, wins: 0, losses: 1, draws: 0, errors: 0 },
        ],
      },
      unknown: {
        skill: "unknown",
        total: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        errors: 0,
        winRate: 1,
        opponents: [
          { tankId: 12, name: "Mystery", total: 1, wins: 1, losses: 0, draws: 0, errors: 0 },
        ],
      },
    },
    losses: [
      {
        index: 1,
        skill: "teleport",
        reason: "star",
        opponentTankId: 11,
        opponentName: "Blink",
        matchUrlId: "mat_loss",
        replayUrl: "https://agentank.ai/history/mat_loss",
        agentReplayUrl: undefined,
      },
    ],
  },
  "classification should summarize a run and emit the loss queue for analysts"
);

assert.deepStrictEqual(
  classifyReport({
    generatedAt: "2026-05-15T12:34:56.789Z",
    tankId: 707,
    progressive: true,
    results: [
      { index: 1, status: "win", raw: { replayData: { replay: { records: [[]] } } } },
      { index: 2, status: "win", raw: { replayData: { replay: { records: [[]] } } } },
      { index: 3, status: "loss", raw: { replayData: { replay: { records: [[]] } } } },
      { index: 4, status: "loss", raw: { replayData: { replay: { records: [[]] } } } },
      { index: 5, status: "loss", raw: { replayData: { replay: { records: [[]] } } } },
    ],
  }, "20260515T123456789Z-progressive", "progressive").gate,
  {
    mode: "progressive",
    stage: 5,
    minWins: 4,
    passed: false,
    eligibleForKeep: false,
  },
  "battle_report-only progressive archives should still use the 3/5/8/10 gates"
);

assert.strictEqual(
  decisionLine({
    runId: "20260515T123456789Z-progressive",
    actor: "top-level-strategist",
    decision: "rollback",
    basis: "3-stage gate failed",
    targetBucket: "random",
    baselineVersion: 102,
    candidateVersion: 103,
  }),
  "{\"at\":\"<now>\",\"runId\":\"20260515T123456789Z-progressive\",\"actor\":\"top-level-strategist\",\"decision\":\"rollback\",\"basis\":\"3-stage gate failed\",\"targetBucket\":\"random\",\"baselineVersion\":102,\"candidateVersion\":103}",
  "decision lines should be JSONL-shaped and deterministic when no time is supplied"
);

assert.throws(
  () => decisionLine({ runId: "x", decision: "maybe", basis: "unclear" }),
  /decision must be one of/,
  "strategy decisions should be constrained to auditable actions"
);

console.log("evolution pipeline tests passed");
