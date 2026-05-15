const assert = require("assert");

const {
  STAGES,
  summarize,
  currentStage,
  shouldAdvance,
} = require("./progressive_battle");

assert.deepStrictEqual(
  STAGES.map((stage) => [stage.target, stage.minWins]),
  [[3, 2], [5, 4], [8, 7], [10, 9]],
  "progressive stages should screen 3 -> 5 -> 8 -> 10 with 90-ish final gate"
);

assert.deepStrictEqual(
  summarize([
    { status: "win" },
    { status: "loss" },
    { status: "draw" },
    { status: "error" },
  ]),
  { total: 4, wins: 1, losses: 1, draws: 1, errors: 1, winRate: 0.25 },
  "summarize should count every battle outcome"
);

assert.strictEqual(currentStage([{ status: "win" }, { status: "loss" }]).target, 3);
assert.strictEqual(currentStage(Array.from({ length: 3 }, () => ({ status: "win" }))).target, 5);
assert.strictEqual(currentStage(Array.from({ length: 5 }, () => ({ status: "win" }))).target, 8);
assert.strictEqual(currentStage(Array.from({ length: 8 }, () => ({ status: "win" }))).target, 10);
assert.strictEqual(currentStage(Array.from({ length: 10 }, () => ({ status: "win" }))), null);

assert.strictEqual(
  shouldAdvance([{ status: "win" }, { status: "loss" }, { status: "win" }], STAGES[0]),
  true,
  "2/3 should advance past the scout stage"
);

assert.strictEqual(
  shouldAdvance([{ status: "win" }, { status: "loss" }, { status: "loss" }], STAGES[0]),
  false,
  "1/3 should stop early for review"
);

assert.strictEqual(
  shouldAdvance([
    { status: "win" },
    { status: "win" },
    { status: "win" },
    { status: "loss" },
    { status: "win" },
  ], STAGES[1]),
  true,
  "4/5 should advance to the 8-battle gate"
);

assert.strictEqual(
  shouldAdvance([
    { status: "win" },
    { status: "win" },
    { status: "win" },
    { status: "loss" },
    { status: "loss" },
  ], STAGES[1]),
  false,
  "3/5 should stop before wasting more challenge time"
);

console.log("progressive battle tests passed");
