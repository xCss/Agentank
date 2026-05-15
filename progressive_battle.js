const fs = require("fs");
const { challenge } = require("./batch_battle");

const STAGES = [
  { target: 3, minWins: 2 },
  { target: 5, minWins: 4 },
  { target: 8, minWins: 7 },
  { target: 10, minWins: 9 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(results) {
  const summary = { total: results.length, wins: 0, losses: 0, draws: 0, errors: 0, winRate: 0 };
  for (const result of results) {
    if (result.status === "win") summary.wins++;
    else if (result.status === "loss") summary.losses++;
    else if (result.status === "error") summary.errors++;
    else summary.draws++;
  }
  summary.winRate = summary.total ? summary.wins / summary.total : 0;
  return summary;
}

function currentStage(results) {
  for (const stage of STAGES) {
    if (results.length < stage.target) return stage;
  }
  return null;
}

function shouldAdvance(results, stage) {
  return results.length >= stage.target && summarize(results).wins >= stage.minWins;
}

function writeReports(results, stoppedAt) {
  const report = {
    generatedAt: new Date().toISOString(),
    tankId: 707,
    progressive: true,
    stages: STAGES,
    stoppedAt: stoppedAt || null,
    summary: summarize(results),
    results,
  };
  fs.writeFileSync("progressive_report.json", JSON.stringify(report, null, 2));
  fs.writeFileSync("battle_report.json", JSON.stringify({
    generatedAt: report.generatedAt,
    tankId: report.tankId,
    progressive: true,
    results,
  }, null, 2));
  return report;
}

async function runProgressive() {
  const results = [];
  for (const stage of STAGES) {
    while (results.length < stage.target) {
      const result = await challenge(results.length + 1);
      results.push(result);
      console.log(
        `battle ${results.length}/${stage.target}: ${result.status} ${result.replayUrl || result.error || ""}`
      );
      writeReports(results, null);
      if (results.length < stage.target) await sleep(2500);
    }

    const summary = summarize(results);
    console.log(`stage ${stage.target}: ${summary.wins}/${summary.total}`);
    if (!shouldAdvance(results, stage)) {
      writeReports(results, stage.target);
      console.log(`stopped at ${stage.target}: need ${stage.minWins} wins`);
      return results;
    }
  }
  writeReports(results, 10);
  return results;
}

async function main() {
  await runProgressive();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  STAGES,
  summarize,
  currentStage,
  shouldAdvance,
  runProgressive,
};
