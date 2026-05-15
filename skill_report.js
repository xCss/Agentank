const fs = require("fs");
const { summarizeBySkill } = require("./battle_tools");

function loadReport(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeSkillReport(inputFile, outputFile) {
  const report = loadReport(inputFile);
  const skillSummary = summarizeBySkill(report.results || []);
  const output = {
    generatedAt: new Date().toISOString(),
    source: inputFile,
    tankId: report.tankId || 707,
    summary: skillSummary,
  };
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  return output;
}

function main() {
  const inputFile = process.argv[2] || "battle_report.json";
  const outputFile = process.argv[3] || "skill_report.json";
  const report = writeSkillReport(inputFile, outputFile);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`wrote ${outputFile}`);
}

if (require.main === module) {
  main();
}

module.exports = { writeSkillReport };
