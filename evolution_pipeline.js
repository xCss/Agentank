const fs = require("fs");
const path = require("path");
const { inferOpponentSkill, summarizeBySkill } = require("./battle_tools");

const DECISIONS = new Set(["keep", "rollback", "narrow", "continue", "publish"]);
const PROGRESSIVE_GATES = [
  { target: 3, minWins: 2 },
  { target: 5, minWins: 4 },
  { target: 8, minWins: 7 },
  { target: 10, minWins: 9 },
];

function safeLabel(value) {
  const label = String(value || "run")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return label || "run";
}

function buildRunId(source, generatedAt) {
  const stamp = String(generatedAt || new Date().toISOString()).replace(/[-:.]/g, "").replace("T", "T");
  return `${stamp}-${safeLabel(source)}`;
}

function runPaths(runId) {
  return {
    raw: `runs/raw/${runId}.json`,
    classified: `runs/classified/${runId}.json`,
    analysis: `runs/analysis/${runId}.md`,
    proposal: `runs/proposals/${runId}.md`,
    publish: `runs/publish/${runId}.json`,
    strategyState: "runs/strategy_state.json",
  };
}

function summarize(results) {
  const summary = { total: 0, wins: 0, losses: 0, draws: 0, errors: 0, winRate: 0 };
  for (const result of results || []) {
    summary.total++;
    if (result.status === "win") summary.wins++;
    else if (result.status === "loss") summary.losses++;
    else if (result.status === "error") summary.errors++;
    else summary.draws++;
  }
  summary.winRate = summary.total ? summary.wins / summary.total : 0;
  return summary;
}

function opponentName(result) {
  const raw = result && result.raw || {};
  return raw.defenderTankName || raw.match && raw.match.defenderTankName || "unknown";
}

function gateStatus(report, summary) {
  if (report.progressive) {
    const stage = report.stoppedAt || summary.total;
    const stageSpec = (report.stages || PROGRESSIVE_GATES).find((candidate) => candidate.target === stage) || {};
    const minWins = stageSpec.minWins || Math.ceil(stage * 0.9);
    const passed = summary.wins >= minWins;
    return {
      mode: "progressive",
      stage,
      minWins,
      passed,
      eligibleForKeep: stage >= 10 && passed,
    };
  }
  const minWins = Math.ceil(summary.total * 0.9);
  return {
    mode: "fixed",
    stage: summary.total,
    minWins,
    passed: summary.total > 0 && summary.wins >= minWins,
    eligibleForKeep: summary.total >= 10 && summary.wins >= minWins,
  };
}

function classifyReport(report, runId, source) {
  const results = report.results || [];
  const summary = summarize(results);
  return {
    runId,
    source: source || "unknown",
    generatedAt: report.generatedAt,
    tankId: report.tankId || 707,
    summary,
    gate: gateStatus(report, summary),
    bySkill: summarizeBySkill(results),
    losses: results
      .filter((result) => result.status === "loss")
      .map((result) => ({
        index: result.index,
        skill: inferOpponentSkill(result),
        reason: result.reason,
        opponentTankId: result.opponentTankId || (result.raw && result.raw.defenderTankId),
        opponentName: opponentName(result),
        matchUrlId: result.matchUrlId,
        replayUrl: result.replayUrl,
        agentReplayUrl: result.agentReplayUrl,
      })),
  };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function archiveReport(inputFile, source, now) {
  const report = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const runId = buildRunId(source || path.basename(inputFile, ".json"), now || report.generatedAt);
  const paths = runPaths(runId);
  ensureDir(paths.raw);
  ensureDir(paths.classified);
  fs.writeFileSync(paths.raw, JSON.stringify(report, null, 2));
  const classified = classifyReport(report, runId, source || path.basename(inputFile, ".json"));
  fs.writeFileSync(paths.classified, JSON.stringify(classified, null, 2));
  return { runId, paths, classified };
}

function validateDecision(decision) {
  if (!DECISIONS.has(decision.decision)) {
    throw new Error(`decision must be one of: ${Array.from(DECISIONS).join(", ")}`);
  }
  const required = [
    "runId",
    "actor",
    "basis",
    "targetBucket",
    "baselineVersion",
    "candidateVersion",
  ];
  for (const field of required) {
    if (decision[field] === undefined || decision[field] === null || decision[field] === "") {
      throw new Error(`decision.${field} is required`);
    }
  }
}

function decisionLine(decision) {
  validateDecision(decision || {});
  const copy = Object.assign({ at: decision.at || "<now>" }, decision);
  return JSON.stringify(copy);
}

function appendDecision(decision, filePath) {
  const target = filePath || "runs/decisions.jsonl";
  ensureDir(target);
  fs.appendFileSync(target, decisionLine(Object.assign({ at: new Date().toISOString() }, decision)) + "\n");
}

function main() {
  const command = process.argv[2];
  if (command === "archive") {
    const inputFile = process.argv[3] || "battle_report.json";
    const source = process.argv[4] || path.basename(inputFile, ".json");
    const result = archiveReport(inputFile, source);
    console.log(JSON.stringify({ runId: result.runId, paths: result.paths, summary: result.classified.summary }, null, 2));
    return;
  }
  if (command === "decide") {
    const payload = JSON.parse(process.argv[3] || "{}");
    appendDecision(payload);
    console.log(decisionLine(Object.assign({ at: "<now>" }, payload)));
    return;
  }
  throw new Error("Usage: node evolution_pipeline.js archive [report.json] [source] | decide '{...}'");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  archiveReport,
  buildRunId,
  classifyReport,
  decisionLine,
  runPaths,
};
