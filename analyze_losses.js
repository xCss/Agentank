const report = require("./battle_report.json");

function samePos(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function cloneTank(tank) {
  return tank && {
    position: [tank.position[0], tank.position[1]],
    direction: tank.direction,
  };
}

function tankLabel(id, meta) {
  const index = meta.players.findIndex((player) => player.tank.id === id);
  return index === 0 ? "Ant" : index === 1 ? "Enemy" : id;
}

function summarizeLoss(result) {
  const replay = result.raw.replayData.replay;
  const records = replay.records;
  const meta = replay.meta;
  const tanks = new Map(meta.players.map((player) => [player.tank.id, cloneTank(player.tank)]));
  const bullets = new Map();
  const starEvents = [];
  const hits = [];
  const crashes = [];
  const timeline = [];

  for (let frame = 0; frame < records.length; frame++) {
    for (const event of records[frame]) {
      if (event.type === "tank" && event.objectId) {
        const tank = tanks.get(event.objectId) || {};
        if (event.position) tank.position = [event.position[0], event.position[1]];
        if (event.direction) tank.direction = event.direction;
        tanks.set(event.objectId, tank);
      }

      if (event.type === "bullet") {
        if (event.action === "created") {
          bullets.set(event.objectId, {
            position: event.position && [event.position[0], event.position[1]],
            direction: event.direction,
            tankId: event.tank && event.tank.id,
          });
        } else if (event.action === "go") {
          const bullet = bullets.get(event.objectId) || {};
          bullet.position = event.position && [event.position[0], event.position[1]];
          bullet.direction = event.direction || bullet.direction;
          bullet.tankId = event.tank && event.tank.id || bullet.tankId;
          bullets.set(event.objectId, bullet);
        } else if (event.action === "hit" || event.action === "crashed") {
          const bullet = bullets.get(event.objectId) || {};
          const owner = event.tank && event.tank.id || bullet.tankId;
          if (event.action === "hit") hits.push({ frame, owner: tankLabel(owner, meta), event });
          if (event.action === "crashed") crashes.push({ frame, owner: tankLabel(owner, meta), event });
          bullets.delete(event.objectId);
        }
      }

      if (event.type === "star") {
        starEvents.push({ frame, event });
      }
    }

    if (frame >= records.length - 14) {
      timeline.push({
        frame,
        ant: cloneTank(tanks.get(meta.players[0].tank.id)),
        enemy: cloneTank(tanks.get(meta.players[1].tank.id)),
        events: records[frame].map((event) => {
          if (event.type === "tank") {
            return `${tankLabel(event.objectId, meta)}:${event.action}${event.direction ? ":" + event.direction : ""}${event.position ? "@" + event.position.join(",") : ""}`;
          }
          if (event.type === "bullet") {
            const owner = event.tank && event.tank.id;
            return `bullet:${tankLabel(owner, meta)}:${event.action}:${event.direction || ""}${event.position ? "@" + event.position.join(",") : ""}`;
          }
          if (event.type === "star") return `star:${event.action}${event.position ? "@" + event.position.join(",") : ""}${event.by !== undefined ? ":by" + event.by : ""}`;
          if (event.type === "skill") return `skill:${event.skillType}:${event.action}:by${event.by}`;
          return `${event.type}:${event.action}`;
        }),
      });
    }
  }

  return {
    index: result.index,
    matchUrlId: result.matchUrlId,
    opponent: result.raw.defenderTankName,
    opponentTankId: result.opponentTankId,
    reason: result.reason,
    result: replay.meta.result,
    frames: records.length,
    hits: hits.map((hit) => ({ frame: hit.frame, owner: hit.owner, target: hit.event.targetObjectId && tankLabel(hit.event.targetObjectId, meta) })),
    bulletCrashes: crashes.slice(-5),
    stars: starEvents.slice(-8),
    finalAnt: tanks.get(meta.players[0].tank.id),
    finalEnemy: tanks.get(meta.players[1].tank.id),
    finalTimeline: timeline,
  };
}

const losses = report.results.filter((result) => result.status === "loss").map(summarizeLoss);
console.log(JSON.stringify(losses, null, 2));
