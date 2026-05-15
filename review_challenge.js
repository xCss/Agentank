const { runBatch } = require("./batch_battle");

async function main() {
  const opponentTankId = process.argv[2];
  if (!opponentTankId) {
    throw new Error("Usage: node review_challenge.js <opponentTankId> [count] [outputFile]");
  }
  const count = Number(process.argv[3] || 10);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Invalid count: ${process.argv[3]}`);
  }
  const outputFile = process.argv[4] || "review_report.json";
  await runBatch(count, outputFile, { opponentTankId });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
