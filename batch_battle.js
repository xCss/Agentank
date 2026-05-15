const fs = require("fs");

let cachedEnv = null;

function readEnv() {
  if (!cachedEnv) {
    cachedEnv = Object.fromEntries(
      fs.readFileSync(".env", "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  }
  return cachedEnv;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function challenge(index) {
  const env = readEnv();
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch("https://agentank.ai/api/agent/tank/challenge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TANK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ randomOpponent: true, mapId: "classic" }),
    });
    const text = await response.text();
    if (response.status === 429 && attempt < 4) {
      await sleep(retryDelay(text));
      continue;
    }
    if (!response.ok) return { index, status: "error", error: `${response.status}: ${text}` };

    const raw = JSON.parse(text);
    const winnerTankId = raw.winnerTankId || raw.match?.winnerTankId || null;
    const tankId = raw.challengerTankId || raw.match?.challengerTankId || 707;
    const status = winnerTankId === tankId ? "win" : winnerTankId ? "loss" : "draw";
    const matchUrlId = raw.urlId || raw.matchUrlId || raw.match?.urlId || null;
    return {
      index,
      status,
      winnerTankId,
      reason: raw.resultReason || raw.reason || raw.match?.resultReason || null,
      opponentTankId: raw.defenderTankId || raw.match?.defenderTankId || null,
      matchUrlId,
      agentReplayUrl: matchUrlId ? `https://agentank.ai/api/matches/${matchUrlId}/agent.json` : null,
      replayUrl: matchUrlId ? `https://agentank.ai/history/${matchUrlId}` : null,
      raw,
    };
  }
}

function retryDelay(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed.nextSimulationAt) {
      var wait = Date.parse(parsed.nextSimulationAt) - Date.now() + 750;
      if (wait > 0) return Math.min(wait, 10000);
    }
  } catch (error) {}
  return 3500;
}

async function runBatch(count, outputFile) {
  const results = [];
  for (let i = 1; i <= count; i++) {
    const result = await challenge(i);
    results.push(result);
    console.log(`battle ${i}/${count}: ${result.status} ${result.replayUrl || result.error || ""}`);
    if (i < count) await sleep(2500);
  }
  const report = { generatedAt: new Date().toISOString(), tankId: 707, results };
  fs.writeFileSync(outputFile || "battle_report.json", JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const count = Number(process.argv[2] || 10);
  await runBatch(count);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { challenge, retryDelay, runBatch };
