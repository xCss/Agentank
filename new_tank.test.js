const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const code = fs.readFileSync("new_tank.js", "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(code, context);

function openMap(size) {
  const map = [];
  for (let x = 0; x < size; x++) {
    map[x] = [];
    for (let y = 0; y < size; y++) map[x][y] = ".";
  }
  return map;
}

function borderedMap(size) {
  const map = openMap(size);
  for (let i = 0; i < size; i++) {
    map[i][0] = "x";
    map[i][size - 1] = "x";
    map[0][i] = "x";
    map[size - 1][i] = "x";
  }
  return map;
}

function leftLaneMap(size) {
  const map = borderedMap(size);
  map[2][3] = "x";
  map[3][3] = "x";
  map[3][5] = "x";
  map[4][5] = "x";
  return map;
}

function mapFromRows(rows) {
  const map = [];
  for (let x = 0; x < rows[0].length; x++) {
    map[x] = [];
    for (let y = 0; y < rows.length; y++) map[x][y] = rows[y][x];
  }
  return map;
}

function classicMap() {
  return mapFromRows([
    "xxxxxxxxxxxxxxxxxxx",
    "xooo..............x",
    "xo.x.....x........x",
    "xxxx.....x........x",
    "x........x........x",
    "x..xxxxxxxxxxx....x",
    "x....ooxoooooo....x",
    "x....ooooooooo....x",
    "x....ooooooxoo....x",
    "x....xxxxxxxxxxx..x",
    "x........x........x",
    "x........x.....xxxx",
    "x........x.....x.ox",
    "x..............ooox",
    "xxxxxxxxxxxxxxxxxxx",
  ]);
}

function makeMe(direction, position) {
  const calls = [];
  return {
    tank: { position: position || [4, 4], direction: direction || "right" },
    status: {},
    bullet: null,
    turn(dir) { calls.push("turn:" + dir); },
    go() { calls.push("go"); },
    fire() { calls.push("fire"); },
    boost() { calls.push("boost"); },
    calls,
  };
}

function countPathDistanceCalls(run) {
  const original = context.pathDistance;
  let calls = 0;
  context.pathDistance = function () {
    calls++;
    return original.apply(context, arguments);
  };
  try {
    return { result: run(), calls };
  } finally {
    context.pathDistance = original;
  }
}

assert.strictEqual(
  context.enemyAimsAt({ position: [8, 4], direction: "left" }, [4, 4], openMap(12)),
  true,
  "enemyAimsAt detects current enemy firing lane"
);

assert.notDeepStrictEqual(
  context.nextVetoedStep([4, 4], [8, 4], openMap(12), { position: [8, 4], direction: "left" }),
  [5, 4],
  "nextVetoedStep should not take the direct step into a current enemy firing lane"
);

assert.notDeepStrictEqual(
  context.nextVetoedStep([4, 4], [5, 4], openMap(12), { position: [6, 4], direction: "right" }),
  [5, 4],
  "nextVetoedStep should refuse the direct same-line step when the enemy is near enough to snap-shoot"
);

assert.notDeepStrictEqual(
  context.nextVetoedStep([4, 4], [6, 4], openMap(12), { position: [5, 4], direction: "right" }),
  [5, 4],
  "nextVetoedStep should never route through the enemy tank tile"
);

assert.notDeepStrictEqual(
  context.nextVetoedStep([15, 1], [15, 2], openMap(20), { position: [16, 3], direction: "up" }),
  [15, 2],
  "nextVetoedStep should avoid stepping beside an enemy's likely next position"
);

assert.notDeepStrictEqual(
  context.nextVetoedStep(
    [15, 1],
    [5, 7],
    openMap(20),
    { position: [16, 2], direction: "up" },
    null,
    "left",
    { tank: { position: [16, 2], direction: "up" }, status: {}, skill: null }
  ),
  [14, 1],
  "nextVetoedStep should avoid entering a boundary lane trap near a predicted enemy gunline"
);

assert.strictEqual(
  JSON.stringify(context.nextVetoedStep([13, 2], [16, 6], borderedMap(20), null, null, "right", {})),
  JSON.stringify([13, 3]),
  "nextVetoedStep should prefer stepping inward over skimming along the outer edge when distances tie"
);

assert.strictEqual(
  JSON.stringify(context.nextVetoedStep([2, 4], [3, 9], leftLaneMap(20), null, null, "left", {})),
  JSON.stringify([2, 5]),
  "nextVetoedStep should keep moving toward a reachable left-lane star instead of oscillating inward"
);

assert(
  context.threatLevel(
    [17, 4],
    { position: [16, 10], direction: "up" },
    null,
    openMap(20),
    { status: { overloaded: true }, skill: { type: "overload", remainingCooldownFrames: 0 } }
  ) > 0,
  "threatLevel should treat an active overload side lane as dangerous"
);

assert(
  context.threatLevel(
    [18, 5],
    { position: [16, 4], direction: "right" },
    null,
    openMap(20),
    { status: { boosted: true }, skill: { type: "boost", remainingCooldownFrames: 0 } }
  ) > 0,
  "threatLevel should include the second-step neighborhood for boosted enemies"
);

assert(
  context.threatLevel(
    [14, 6],
    { position: [12, 4], direction: "right" },
    null,
    openMap(20),
    { status: {}, skill: { type: "phase", remainingCooldownFrames: 0 } }
  ) > 0,
  "threatLevel should treat unknown ready movement skills as short-range danger"
);

assert(
  context.threatLevel(
    [12, 12],
    { position: [10, 10], direction: "right" },
    null,
    openMap(20),
    { status: {}, skill: { type: "stun", remainingCooldownFrames: 0 } }
  ) > 0,
  "threatLevel should widen danger around ready control skills"
);

{
  const original = context.tankThreatLevel;
  let calls = 0;
  context.antMemory = {};
  context.tankThreatLevel = function () {
    calls++;
    return original.apply(context, arguments);
  };
  try {
    const map = openMap(12);
    const enemyTank = { position: [8, 4], direction: "left" };
    const enemy = { status: {}, skill: null };
    assert.strictEqual(context.threatLevel([4, 4], enemyTank, null, map, enemy), 4);
    assert.strictEqual(context.threatLevel([4, 4], enemyTank, null, map, enemy), 4);
    assert.strictEqual(
      calls,
      1,
      "threatLevel should memoize repeated checks for the same frame state"
    );
    context.threatLevel([5, 4], enemyTank, null, map, enemy);
    assert.strictEqual(
      calls,
      2,
      "threatLevel cache keys should still distinguish different positions"
    );
  } finally {
    context.tankThreatLevel = original;
    context.antMemory = {};
  }
}

{
  const original = context.isOpen;
  let calls = 0;
  context.antMemory = {};
  context.isOpen = function () {
    calls++;
    return original.apply(context, arguments);
  };
  try {
    const map = openMap(20);
    const first = context.nearbyReachableOrigins([8, 8], map, 3);
    const afterFirst = calls;
    const second = context.nearbyReachableOrigins([8, 8], map, 3);
    assert.deepStrictEqual(
      second,
      first,
      "nearbyReachableOrigins cache should preserve returned positions"
    );
    assert.strictEqual(
      calls,
      afterFirst,
      "nearbyReachableOrigins should reuse repeated BFS results"
    );
  } finally {
    context.isOpen = original;
    context.antMemory = {};
  }
}

{
  const me = makeMe("up", [4, 4]);
  context.onIdle(
    me,
    { tank: { position: [6, 4], direction: "right" }, bullet: null, status: {} },
    { map: openMap(12), star: null, frames: 12 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "turn:right",
    "onIdle should not spend a frame turning to aim while the enemy has a near snap-shot lane"
  );
}

{
  const me = makeMe("right", [4, 4]);
  context.onIdle(
    me,
    { tank: { position: [8, 4], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: openMap(12), star: null, frames: 32 }
  );
  assert.strictEqual(
    me.calls[0],
    "fire",
    "onIdle should fire when already aimed and the enemy is not currently aiming back"
  );
}

{
  const me = makeMe("left", [12, 4]);
  context.onIdle(
    me,
    { tank: { position: [16, 4], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [11, 4], frames: 4200 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "turn:right",
    "onIdle should not spend a frame turning to aim when a same-line enemy can turn and fire before Ant clears the lane"
  );
}

{
  const me = makeMe("right", [15, 6]);
  me.status = { stunned: true };
  context.antMemory = {};
  context.onIdle(
    me,
    { tank: { position: [16, 8], direction: "up" }, bullet: null, status: {}, skill: { type: "stun", remainingCooldownFrames: 20 } },
    { map: classicMap(), star: [13, 6], frames: 9300 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should use reversed movement while stunned when already facing opposite the target step"
  );
}

{
  const me = makeMe("left", [15, 6]);
  me.status = { stunned: true };
  context.antMemory = {};
  context.onIdle(
    me,
    { tank: { position: [16, 8], direction: "up" }, bullet: null, status: {}, skill: { type: "stun", remainingCooldownFrames: 20 } },
    { map: classicMap(), star: [13, 6], frames: 9301 }
  );
  assert.strictEqual(
    me.calls[0],
    "turn:left",
    "onIdle should not go while stunned when reverse movement would drive away from the target step"
  );
}

{
  const me = makeMe("right", [4, 4]);
  me.bullet = { position: [6, 4], direction: "right" };
  context.onIdle(
    me,
    { tank: { position: [8, 4], direction: "right" }, bullet: null, status: {}, skill: null },
    { map: openMap(12), star: null, frames: 33 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "turn:right",
    "onIdle should not waste a frame turning to the same direction when fire is blocked by our active bullet"
  );
}

{
  const map = classicMap();
  context.antMemory = {};
  context.onIdle(
    makeMe("right", [4, 6]),
    { tank: { position: [13, 7], direction: "left" }, bullet: null, status: {}, skill: { type: "stun", remainingCooldownFrames: 0 } },
    { map, star: [7, 13], frames: 20 }
  );

  const me = makeMe("down", [4, 6]);
  context.onIdle(
    me,
    { tank: null, bullet: null, status: {}, skill: { type: "stun", remainingCooldownFrames: 0 } },
    { map, star: [7, 13], frames: 32 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not drive into a remembered close stun lane after the enemy disappears"
  );
}

{
  const me = makeMe("down", [15, 1]);
  context.onIdle(
    me,
    { tank: { position: [16, 3], direction: "up" }, bullet: null, status: {} },
    { map: openMap(20), star: [15, 2], frames: 20 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not move into a tile beside the enemy's likely next position"
  );
}

{
  const map = openMap(20);
  const scout = makeMe("left", [2, 7]);
  context.onIdle(
    scout,
    { tank: { position: [4, 7], direction: "right" }, bullet: null, status: { boosted: true }, skill: { type: "boost", remainingCooldownFrames: 0 } },
    { map, star: [8, 7], frames: 40 }
  );

  const me = makeMe("right", [2, 7]);
  me.status = { boosted: true };
  context.onIdle(
    me,
    { tank: null, bullet: null, status: { boosted: true }, skill: { type: "boost", remainingCooldownFrames: 0 } },
    { map, star: [8, 7], frames: 42 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not boost into a hidden enemy's remembered snap-shot lane"
  );
}

{
  const map = classicMap();
  context.antMemory = {};
  const scout = makeMe("right", [10, 7]);
  scout.skill = { type: "boost", remainingCooldownFrames: 20 };
  context.onIdle(
    scout,
    { tank: { position: [9, 7], direction: "down" }, bullet: null, status: {}, skill: null },
    { map, star: [11, 12], frames: 24 }
  );

  const me = makeMe("right", [14, 7]);
  me.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.onIdle(
    me,
    { tank: null, bullet: null, status: {}, skill: null },
    { map, star: [11, 12], frames: 40 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "boost",
    "onIdle should not boost down a recently hidden grass gunline"
  );
}

{
  const me = makeMe("up", [4, 7]);
  context.onIdle(
    me,
    { tank: { position: [7, 7], direction: "left" }, bullet: null, status: {}, skill: { type: "boost", remainingCooldownFrames: 20 } },
    { map: openMap(20), star: [8, 7], frames: 70 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should take an immediate safe escape step instead of turning toward a star while threatened"
  );
}

{
  const me = makeMe("right", [10, 7]);
  context.onIdle(
    me,
    { tank: { position: [4, 7], direction: "right" }, bullet: { position: [8, 7], direction: "right" }, status: {}, skill: null },
    { map: openMap(20), star: null, frames: 710 }
  );
  assert.deepStrictEqual(
    me.calls.slice(0, 2),
    ["turn:up", "go"],
    "onIdle should queue turn and go when a close bullet will arrive before the next idle"
  );
}

{
  const me = makeMe("right", [3, 4]);
  context.onIdle(
    me,
    { tank: { position: [5, 4], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 5201 }
  );
  assert.strictEqual(
    me.calls[0],
    "fire",
    "onIdle should take a last-resort shot from a two-tile aimed gunline when no off-line escape exists"
  );
}

{
  const me = makeMe("right", [2, 6]);
  context.onIdle(
    me,
    { tank: { position: [4, 6], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [10, 10], frames: 712 }
  );
  assert.deepStrictEqual(
    me.calls.slice(0, 2),
    ["turn:up", "go"],
    "onIdle should queue a zero-threat sidestep when an aimed enemy gun is two tiles away"
  );
}

{
  const me = makeMe("down", [10, 10]);
  context.onIdle(
    me,
    { tank: { position: [10, 13], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 713 }
  );
  assert.deepStrictEqual(
    me.calls.slice(0, 2),
    ["turn:right", "go"],
    "onIdle should queue a zero-threat sidestep when an aimed enemy gun is three tiles away"
  );
}

{
  const me = makeMe("left", [14, 7]);
  context.onIdle(
    me,
    { tank: { position: [8, 7], direction: "right" }, bullet: { position: [10, 7], direction: "right" }, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 711 }
  );
  assert.deepStrictEqual(
    me.calls.slice(0, 2),
    ["turn:up", "go"],
    "onIdle should queue a perpendicular escape when a speed-2 bullet is four tiles away"
  );
}

{
  const me = makeMe("down", [3, 6]);
  context.onIdle(
    me,
    { tank: { position: [4, 6], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [11, 4], frames: 999 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should drive out of a point-blank gunline when already facing the best escape step"
  );
}

{
  const me = makeMe("up", [1, 5]);
  context.onIdle(
    me,
    { tank: { position: [2, 5], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [1, 1], frames: 1000 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should leave a wall-side point-blank gunline instead of spending the frame turning"
  );
}

{
  const me = makeMe("left", [2, 5]);
  context.onIdle(
    me,
    { tank: { position: [2, 6], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [6, 6], frames: 3000 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not re-enable wall-landing soft escapes after v44 produced a 3-of-10 regression"
  );
}

{
  const me = makeMe("left", [14, 1]);
  context.onIdle(
    me,
    { tank: { position: [16, 1], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [5, 7], frames: 24 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not drive straight away along a boundary gunline that bullets can catch"
  );
}

{
  const me = makeMe("left", [12, 1]);
  context.onIdle(
    me,
    { tank: { position: [15, 1], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [5, 7], frames: 27 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not keep driving along a close gunline when the enemy can turn and fire"
  );
}

{
  const me = makeMe("up", [15, 7]);
  context.onIdle(
    me,
    { tank: { position: [16, 7], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [11, 10], frames: 1001 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not soft-escape away from center after v40 showed that broad hard-gunline escapes collapse win rate"
  );
}

{
  const me = makeMe("right", [13, 3]);
  context.onIdle(
    me,
    { tank: { position: [17, 6], direction: "down" }, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: null, frames: 30 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not chase the enemy deeper toward the outer edge when no star exists"
  );
}

{
  const me = makeMe("up", [6, 1]);
  context.onIdle(
    me,
    { tank: { position: [2, 4], direction: "right" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 41 }
  );
  assert.strictEqual(
    me.calls[0],
    "turn:down",
    "onIdle should leave the top outer lane before pathing sideways toward center"
  );
}

{
  const me = makeMe("down", [10, 1]);
  context.onIdle(
    me,
    { tank: { position: [15, 1], direction: "right" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [13, 8], frames: 6202 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should keep leaving a top-lane same-line standoff instead of turning back to aim"
  );
}

{
  const me = makeMe("right", [2, 1]);
  context.onIdle(
    me,
    { tank: { position: [16, 12], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [1, 13], frames: 621 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should not retreat from the top lane into a dead end when the only target route exits along the lane"
  );
}

{
  const map = borderedMap(20);
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([14, 5], { position: [18, 10], direction: "up" }, [18, 12], map)),
    JSON.stringify(context.centerPoint(map)),
    "chooseTarget should not chase an outer-edge star when the enemy is much closer"
  );
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([5, 7], { position: [12, 12], direction: "up" }, [1, 8], map)),
    JSON.stringify([1, 8]),
    "chooseTarget should still chase an outer-edge star when we have a clear path advantage"
  );
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([14, 4], { position: [12, 4], direction: "left" }, [16, 1], map)),
    JSON.stringify(context.centerPoint(map)),
    "chooseTarget should skip top-edge stars unless we have a clear path advantage"
  );
}

{
  const map = classicMap();
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([8, 7], { position: [1, 13], direction: "left" }, [4, 1], map, 79)),
    JSON.stringify([4, 1]),
    "chooseTarget should chase a distant outer-edge star when both tanks are far and Ant is not behind"
  );
}

{
  const map = classicMap();
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([9, 8], { position: [14, 13], direction: "right" }, [17, 5], map, 110)),
    JSON.stringify([17, 5]),
    "chooseTarget should race a distant side-edge star when both tanks are far and Ant is not behind"
  );
}

{
  const map = classicMap();
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([13, 4], { position: [14, 1], direction: "left" }, [13, 1], map, 310)),
    JSON.stringify([13, 1]),
    "chooseTarget should not abandon a near edge star when giving it up causes local oscillation"
  );
}

{
  const map = classicMap();
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([8, 7], { position: [16, 13], direction: "right" }, [17, 4], map)),
    JSON.stringify(context.centerPoint(map)),
    "chooseTarget should skip marginal edge stars that pull us away from center control"
  );
}

{
  const map = classicMap();
  context.antMemory = {};
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([10, 7], { position: [3, 4], direction: "up" }, [6, 4], map, 1200)),
    JSON.stringify(context.centerPoint(map)),
    "chooseTarget should abandon a clearly lost interior star instead of wasting boost route tempo"
  );
}

{
  const map = classicMap();
  context.antMemory = {};
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([2, 2], { position: [16, 12], direction: "down" }, [13, 10], map, 4201)),
    JSON.stringify(context.centerPoint(map)),
    "chooseTarget should abandon a far interior star when the enemy has a large path advantage"
  );
}

{
  const map = classicMap();
  context.antMemory = {};
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([8, 6], { position: [15, 7], direction: "left" }, [4, 9], map, 1201)),
    JSON.stringify([4, 9]),
    "chooseTarget should still chase interior stars when Ant is not clearly beaten"
  );
}

{
  const map = classicMap();
  context.antMemory.starKey = "13,12";
  context.antMemory.starBestDistance = 7;
  context.antMemory.starLastImprovedFrame = 100;
  assert.strictEqual(
    JSON.stringify(context.chooseTarget([6, 12], { position: [13, 13], direction: "left" }, [13, 12], map, 109)),
    JSON.stringify([13, 12]),
    "chooseTarget should not abandon a near-edge star on stall memory alone after v55/v56 regressed to 4-of-10"
  );
}

{
  const map = classicMap();
  context.antMemory = {};
  const measured = countPathDistanceCalls(() =>
    context.chooseTarget([8, 7], { position: [16, 13], direction: "right" }, [10, 8], map, 200)
  );
  assert.strictEqual(
    JSON.stringify(measured.result),
    JSON.stringify([10, 8]),
    "chooseTarget should still chase an interior star"
  );
  assert.strictEqual(
    measured.calls,
    0,
    "chooseTarget should not spend BFS work on interior stars"
  );
}

{
  const map = classicMap();
  context.antMemory.starKey = "13,12";
  context.antMemory.starBestDistance = 7;
  context.antMemory.starLastImprovedFrame = 100;
  const measured = countPathDistanceCalls(() =>
    context.chooseTarget([6, 12], { position: [13, 13], direction: "left" }, [13, 12], map, 109)
  );
  assert.strictEqual(
    JSON.stringify(measured.result),
    JSON.stringify([13, 12]),
    "chooseTarget should keep chasing near-edge stars unless the older outer-edge path rule applies"
  );
  assert.strictEqual(
    measured.calls,
    0,
    "near-edge stall detection should not add BFS work every frame"
  );
}

{
  const me = makeMe("right", [15, 4]);
  me.status = { boosted: true };
  me.skill = { type: "boost", remainingCooldownFrames: 20 };
  context.onIdle(
    me,
    { tank: null, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [16, 2], frames: 60 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not use boosted movement when the two-tile landing worsens edge exposure"
  );
}

{
  const me = makeMe("right", [1, 1]);
  context.safeMoveToward(
    me,
    "right",
    [1, 1],
    [2, 1],
    classicMap(),
    { position: [1, 2], direction: "right" },
    null,
    { status: {}, skill: null }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "safeMoveToward should not fall back to go after rejecting a threatened landing"
  );
}

{
  const me = makeMe("up", [2, 2]);
  me.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.antMemory.lastBoostFrame = undefined;
  context.onIdle(
    me,
    { tank: null, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [6, 3], frames: 700 }
  );
  assert.strictEqual(
    me.calls[0],
    "boost",
    "onIdle should pre-activate boost before a safe turn toward a reachable star"
  );
}

{
  const me = makeMe("right", [4, 4]);
  me.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.antMemory.lastBoostFrame = undefined;
  context.onIdle(
    me,
    { tank: null, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [6, 4], frames: 720 }
  );
  assert.strictEqual(
    me.calls[0],
    "boost",
    "onIdle should boost to collect a safe star exactly two tiles ahead"
  );
}

{
  const me = makeMe("right", [4, 4]);
  me.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.antMemory.lastBoostFrame = undefined;
  context.onIdle(
    me,
    { tank: null, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [5, 4], frames: 721 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "boost",
    "onIdle should not boost when a near star would be overshot"
  );
}

{
  const me = makeMe("right", [4, 4]);
  me.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.antMemory.lastBoostFrame = undefined;
  context.onIdle(
    me,
    { tank: { position: [6, 6], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [6, 4], frames: 722 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "boost",
    "onIdle should not boost to a two-tile star if the boosted landing is threatened"
  );
}

{
  const me = makeMe("down", [13, 2]);
  me.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.antMemory.lastBoostFrame = undefined;
  context.onIdle(
    me,
    { tank: { position: [16, 7], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 2000 }
  );
  assert.strictEqual(
    me.calls[0],
    "boost",
    "onIdle may boost during center patrol because v42 showed suppressing no-star boost hurts overall tempo"
  );
  context.antMemory.lastBoostFrame = undefined;
}

{
  const map = borderedMap(20);
  const first = makeMe("right", [3, 4]);
  first.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.onIdle(
    first,
    { tank: null, bullet: null, status: {}, skill: null },
    { map, star: [10, 4], frames: 800 }
  );
  assert.strictEqual(first.calls[0], "boost", "test setup should cast boost first");

  const second = makeMe("right", [4, 4]);
  second.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.onIdle(
    second,
    { tank: null, bullet: null, status: {}, skill: null },
    { map, star: [10, 4], frames: 810 }
  );
  assert.notStrictEqual(
    second.calls[0],
    "boost",
    "onIdle should remember boost cooldown locally when API cooldown appears stale"
  );
}

{
  const me = makeMe("right", [2, 1]);
  me.skill = { type: "boost", remainingCooldownFrames: 0 };
  context.onIdle(
    me,
    { tank: { position: [16, 13], direction: "right" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [15, 3], frames: 300 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "boost",
    "onIdle should not start boost while already on an outer lane"
  );
}

{
  const me = makeMe("down", [14, 1]);
  context.onIdle(
    me,
    { tank: { position: [16, 1], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: borderedMap(20), star: [5, 7], frames: 25 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should immediately leave a boundary gunline when already facing a safe perpendicular exit"
  );
}

{
  const me = makeMe("left", [13, 1]);
  context.onIdle(
    me,
    { tank: { position: [15, 1], direction: "left" }, bullet: null, status: {}, skill: { type: "freeze", remainingCooldownFrames: 0 } },
    { map: classicMap(), star: null, frames: 4101 }
  );
  assert.deepStrictEqual(
    me.calls.slice(0, 2),
    ["turn:down", "go"],
    "onIdle should queue an off-line step from a hard boundary gunline even when the landing only drops to soft control risk"
  );
}

{
  const me = makeMe("left", [4, 6]);
  context.onIdle(
    me,
    { tank: { position: [6, 6], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [1, 4], frames: 3100 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not extend a close same-line escape when the enemy can turn and fire before we clear it"
  );
}

{
  const map = classicMap();
  const me = makeMe("left", [3, 6]);
  context.onIdle(
    me,
    { tank: { position: [4, 6], direction: "left" }, bullet: null, status: { cloaked: true }, skill: { type: "cloak", remainingCooldownFrames: 20 } },
    { map, star: [6, 6], frames: 4301 }
  );
  assert.notDeepStrictEqual(
    me.calls.slice(0, 2),
    ["turn:down", "go"],
    "onIdle should not queue adjacent hard-gunline escape when the landing only drops to soft cloak risk"
  );
}

{
  const me = makeMe("up", [10, 4]);
  context.onIdle(
    me,
    {
      tank: { position: [10, 1], direction: "down" },
      bullet: { position: [10, 2], direction: "down" },
      status: {},
      skill: null,
    },
    { map: borderedMap(20), star: null, frames: 44 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "fire",
    "onIdle should not fire while an incoming bullet is already on our lane"
  );
}

{
  const me = makeMe("left", [3, 6]);
  context.onIdle(
    me,
    { tank: { position: [3, 8], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 3200 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should take the already-facing脱线 escape from a two-tile turn-shot lane"
  );
}

{
  const me = makeMe("left", [11, 1]);
  context.onIdle(
    me,
    { tank: { position: [11, 3], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 3201 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should take the wall-side already-facing脱线 escape from a two-tile turn-shot lane"
  );
}

{
  const me = makeMe("down", [15, 7]);
  context.onIdle(
    me,
    { tank: { position: [16, 7], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: [11, 12], frames: 4000 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should use an already-facing non-edge escape from an adjacent aimed gunline"
  );
}

{
  const me = makeMe("up", [13, 4]);
  context.onIdle(
    me,
    { tank: { position: [14, 4], direction: "left" }, bullet: null, status: {}, skill: null },
    { map: classicMap(), star: null, frames: 4001 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should step off an adjacent aimed lane instead of turning in place"
  );
}

{
  const me = makeMe("right", [3, 7]);
  context.onIdle(
    me,
    { tank: { position: [2, 7], direction: "up" }, bullet: null, status: {}, skill: null },
    { map: openMap(20), star: [2, 12], frames: 4100 }
  );
  assert.deepStrictEqual(
    me.calls.slice(0, 2),
    ["turn:down", "go"],
    "onIdle should queue the off-line step when a close enemy can turn and fire before the next idle"
  );
}

{
  const map = classicMap();
  const scout = makeMe("down", [14, 6]);
  context.onIdle(
    scout,
    { tank: { position: [16, 8], direction: "up" }, bullet: null, status: {}, skill: { type: "cloak", remainingCooldownFrames: 0 } },
    { map, star: [1, 6], frames: 500 }
  );

  const me = makeMe("left", [14, 6]);
  context.onIdle(
    me,
    { tank: null, bullet: null, status: { cloaked: true }, skill: { type: "cloak", remainingCooldownFrames: 20 } },
    { map, star: [1, 6], frames: 504 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not drive into a likely cloak ambush lane from a remembered enemy"
  );
}

{
  const map = classicMap();
  const scout = makeMe("right", [5, 6]);
  context.onIdle(
    scout,
    { tank: { position: [4, 7], direction: "right" }, bullet: null, status: {}, skill: { type: "overload", remainingCooldownFrames: 0 } },
    { map, star: [5, 7], frames: 600 }
  );

  const me = makeMe("right", [2, 6]);
  context.onIdle(
    me,
    { tank: null, bullet: null, status: { overloaded: true }, skill: { type: "overload", remainingCooldownFrames: 20 } },
    { map, star: [5, 7], frames: 604 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not drive toward a remembered hidden overload crossfire lane"
  );
}

{
  const map = classicMap();
  const me = makeMe("up", [2, 5]);
  context.onIdle(
    me,
    { tank: { position: [5, 6], direction: "right" }, bullet: null, status: {}, skill: null },
    { map, star: [2, 10], frames: 620 }
  );
  assert.strictEqual(
    me.calls[0],
    "turn:down",
    "onIdle should keep chasing a near lane star when a nearby enemy is not aimed at the route"
  );
}

{
  const map = classicMap();
  assert(
    context.threatLevel(
      [17, 1],
      { position: [16, 10], direction: "left" },
      null,
      map,
      { status: { overloaded: true }, skill: { type: "overload", remainingCooldownFrames: 20 } }
    ) > 0,
    "threatLevel should treat active overload as dangerous even if the enemy can turn before firing"
  );
}

{
  const map = classicMap();
  const me = makeMe("right", [14, 5]);
  context.onIdle(
    me,
    { tank: { position: [14, 4], direction: "down" }, bullet: null, status: {}, skill: null },
    { map, star: [13, 4], frames: 640 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not step into a close enemy's next-turn firing lane"
  );
}

{
  const map = classicMap();
  const me = makeMe("down", [4, 9]);
  context.onIdle(
    me,
    { tank: { position: [2, 8], direction: "right" }, bullet: null, status: {}, skill: { type: "teleport", remainingCooldownFrames: 0 } },
    { map, star: [2, 11], frames: 4202 }
  );
  assert.strictEqual(
    me.calls[0],
    "go",
    "onIdle should keep moving toward a near star when teleport only creates equal soft risk"
  );
}

{
  const map = classicMap();
  const me = makeMe("down", [4, 9]);
  context.onIdle(
    me,
    { tank: { position: [2, 8], direction: "right" }, bullet: null, status: {}, skill: { type: "poison", remainingCooldownFrames: 0 } },
    { map, star: [2, 11], frames: 4203 }
  );
  assert.notStrictEqual(
    me.calls[0],
    "go",
    "onIdle should not generalize the soft star step to ready control skills"
  );
}

console.log("new_tank tests passed");
