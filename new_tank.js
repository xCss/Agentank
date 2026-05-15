function onIdle(me, enemy, game) {
  var myPos = me.tank.position;
  var myDir = me.tank.direction;
  var enemyTank = rememberedEnemyTank(enemy, game.frames);
  var enemyBullet = enemy.bullet;
  var map = game.map;
  antMemory.threatCache = {};
  var danger = isThreatened(myPos, enemyTank, enemyBullet, map, enemy);

  if (shouldKeepLeavingEdgeStandoff(myPos, myDir, map, enemyTank, enemyBullet, enemy)) {
    me.go();
    return;
  }

  // 射击优先级最高
  if (enemyTank && canShoot(myPos, enemyTank.position, map) && !enemyShielded(enemy)) {
    var shotDir = directionTo(myPos, enemyTank.position);
    if (myDir === shotDir && canFire(me) &&
        (canTakeShot(myPos, enemyTank, enemyBullet, map) ||
          shouldTakeLastResortShot(myPos, myDir, enemyTank, enemyBullet, map, enemy))) {
      me.fire();
      return;
    }
    if (!danger && myDir !== shotDir && !shouldSkipAimTurn(myPos, enemyTank, map)) {
      me.turn(shotDir);
      return;
    }
  }

  // 闪避 - 仅在高度威胁时执行
  if (danger) {
    if (shouldAdvanceSoftStarNow(me, myPos, myDir, map, enemyTank, enemyBullet, enemy, game.star, game.frames)) {
      me.go();
      return;
    }
    if (shouldDriveAwayNow(myPos, myDir, map, enemyTank, enemyBullet, enemy, game.star)) {
      me.go();
      return;
    }
    var escape = bestEscapeStep(myPos, myDir, map, enemyTank, enemyBullet, enemy, null);
    if (escape) {
      safeMoveToward(me, myDir, myPos, escape, map, enemyTank, enemyBullet, enemy);
      return;
    }
  }

  // 提前选定目标，抢星优先
  var target = chooseTarget(myPos, enemyTank, game.star, map, game.frames);

  // 向中心移动或正常移动
  if (target && samePos(target, centerPoint(map))) {
    var retreat = edgeRetreatStep(myPos, target, map, enemyTank, enemyBullet, enemy);
    if (retreat) {
      safeMoveToward(me, myDir, myPos, retreat, map, enemyTank, enemyBullet, enemy);
      return;
    }
  }
  var next = target && nextVetoedStep(myPos, target, map, enemyTank, enemyBullet, myDir, enemy, me.status && me.status.boosted);
  if (next) {
    if (shouldPreBoost(me, myPos, next, target, map, enemyTank, enemyBullet, enemy, game.frames)) {
      antMemory.lastBoostFrame = game.frames || 0;
      me.boost();
      return;
    }
    if (shouldBoost(me, myDir, myPos, next, target, map, enemyTank, enemyBullet, enemy, game.frames)) {
      antMemory.lastBoostFrame = game.frames || 0;
      me.boost();
      return;
    }
    safeMoveToward(me, myDir, myPos, next, map, enemyTank, enemyBullet, enemy, target);
    return;
  }

  patrol(me, myDir, myPos, map, enemyTank, enemyBullet, enemy);
}

var antMemory = {};

function rememberedEnemyTank(enemy, frame) {
  if (enemy.tank) {
    antMemory.enemyTank = {
      position: [enemy.tank.position[0], enemy.tank.position[1]],
      direction: enemy.tank.direction,
      frame: frame || 0,
      skill: enemy.skill && {
        type: enemy.skill.type,
        remainingCooldownFrames: enemy.skill.remainingCooldownFrames
      },
      status: enemy.status && {
        shielded: enemy.status.shielded,
        cloaked: enemy.status.cloaked,
        boosted: enemy.status.boosted,
        overloaded: enemy.status.overloaded,
        frozen: enemy.status.frozen,
        stunned: enemy.status.stunned,
        poisoned: enemy.status.poisoned
      }
    };
    return enemy.tank;
  }
  if (!antMemory.enemyTank) return null;
  var age = (frame || 0) - antMemory.enemyTank.frame;
  var maxAge = hasRememberedControlSkill(antMemory.enemyTank) ? 14 : 8;
  if (age > maxAge) return null;
  return antMemory.enemyTank;
}

function hasRememberedControlSkill(enemyTank) {
  return !!(enemyTank && enemyTank.skill &&
    (enemyTank.skill.type === "freeze" || enemyTank.skill.type === "stun" || enemyTank.skill.type === "poison"));
}

function canFire(me) {
  return !me.bullet && !(me.status && me.status.fireLocked);
}

function canTakeShot(myPos, enemyTank, enemyBullet, map) {
  if (bulletThreatLevel(myPos, enemyBullet, map) > 0) return false;
  return !enemyAimsAt(enemyTank, myPos, map);
}

function shouldTakeLastResortShot(myPos, myDir, enemyTank, enemyBullet, map, enemy) {
  if (!enemyTank || !enemyAimsAt(enemyTank, myPos, map)) return false;
  if (bulletThreatLevel(myPos, enemyBullet, map) > 0) return false;
  var distance = manhattan(myPos, enemyTank.position);
  if (distance < 2 || distance > 4) return false;
  if (directionTo(myPos, enemyTank.position) !== myDir) return false;
  return !hasCleanOffLineEscape(myPos, enemyTank, enemyBullet, map, enemy);
}

function hasCleanOffLineEscape(myPos, enemyTank, enemyBullet, map, enemy) {
  var dirs = ["up", "right", "down", "left"];
  for (var i = 0; i < dirs.length; i++) {
    var next = add(myPos, delta(dirs[i]));
    if (!isPassable(next, map, enemyTank)) continue;
    if (canShoot(enemyTank.position, next, map)) continue;
    if (isThreatened(next, enemyTank, enemyBullet, map, enemy)) continue;
    return true;
  }
  return false;
}

function shouldSkipAimTurn(myPos, enemyTank, map) {
  return enemyTank &&
    canShoot(enemyTank.position, myPos, map) &&
    !enemyAimsAt(enemyTank, myPos, map) &&
    manhattan(myPos, enemyTank.position) <= 4;
}

function shouldKeepLeavingEdgeStandoff(position, direction, map, enemyTank, enemyBullet, enemy) {
  if (!enemyTank || position[0] !== enemyTank.position[0] && position[1] !== enemyTank.position[1]) return false;
  var maxY = map[0].length - 2;
  if (position[1] === 1 && direction !== "down") return false;
  if (position[1] === maxY && direction !== "up") return false;
  if (position[1] !== 1 && position[1] !== maxY) return false;
  if (manhattan(position, enemyTank.position) < 3 || manhattan(position, enemyTank.position) > 8) return false;
  var next = add(position, delta(direction));
  if (!isPassable(next, map, enemyTank)) return false;
  if (canShoot(enemyTank.position, next, map)) return false;
  if (isThreatened(next, enemyTank, enemyBullet, map, enemy)) return false;
  return edgePenalty(next, map) < edgePenalty(position, map);
}

function shouldDriveAwayNow(position, direction, map, enemyTank, enemyBullet, enemy, goal) {
  if (!enemyTank) return false;
  var next = add(position, delta(direction));
  if (!isPassable(next, map, enemyTank)) return false;
  if (shouldStepOutOfAdjacentAim(position, next, enemyTank, enemyBullet, map, goal)) return true;
  if (shouldStepOutOfTwoTileTurnShot(position, next, enemyTank, enemyBullet, map, enemy)) return true;
  if (!canShoot(enemyTank.position, position, map)) return false;
  if (canShoot(enemyTank.position, next, map)) return false;
  if (isThreatened(next, enemyTank, enemyBullet, map, enemy)) return false;
  if (!isMovingAway(position, next, enemyTank.position)) return false;
  return manhattan(next, enemyTank.position) > manhattan(position, enemyTank.position);
}

function shouldStepOutOfAdjacentAim(position, next, enemyTank, enemyBullet, map, goal) {
  if (manhattan(enemyTank.position, position) !== 1) return false;
  if (!enemyAimsAt(enemyTank, position, map)) return false;
  if (canShoot(enemyTank.position, next, map)) return false;
  if (bulletThreatLevel(next, enemyBullet, map) > 0) return false;
  if (isOuterEdge(next, map)) return false;
  return !goal || manhattan(next, goal) <= manhattan(position, goal);
}

function shouldStepOutOfTwoTileTurnShot(position, next, enemyTank, enemyBullet, map, enemy) {
  if (!canShoot(enemyTank.position, position, map)) return false;
  if (manhattan(enemyTank.position, position) !== 2) return false;
  if (canShoot(enemyTank.position, next, map)) return false;
  if (bulletThreatLevel(next, enemyBullet, map) > 0) return false;
  return tankThreatLevel(next, enemyTank, map, enemy) < 4;
}

function isMovingAway(from, to, origin) {
  return manhattan(to, origin) > manhattan(from, origin);
}

function moveToward(me, currentDir, from, to) {
  var dir = directionTo(from, to);
  if (currentDir === dir) {
    me.go();
  } else {
    me.turn(dir);
  }
}

function safeMoveToward(me, currentDir, from, to, map, enemyTank, enemyBullet, enemy, goal) {
  var dir = directionTo(from, to);
  if (currentDir === dir) {
    var landing = moveLanding(from, dir, map, enemyTank, me.status && me.status.boosted);
    if (!samePos(landing, from) && !isThreatened(landing, enemyTank, enemyBullet, map, enemy)) {
      me.go();
      return;
    }
    var currentLevel = threatLevel(from, enemyTank, enemyBullet, map, enemy);
    var landingLevel = threatLevel(landing, enemyTank, enemyBullet, map, enemy);
    if (shouldTakeSoftStarStep(from, landing, goal, map, currentLevel, landingLevel, enemyBullet, enemy)) {
      me.go();
      return;
    }
    if (shouldTakeSoftEscape(from, landing, map, currentLevel, landingLevel, enemyBullet)) {
      me.go();
      return;
    }
    var escape = bestEscapeStep(from, currentDir, map, enemyTank, enemyBullet, enemy, null);
    if (escape && !samePos(escape, to)) {
      moveToward(me, currentDir, from, escape);
      return;
    }
    var turn = safestTurn(from, currentDir, map, enemyTank, enemyBullet, enemy);
    if (turn && turn !== currentDir) {
      me.turn(turn);
      return;
    }
    return;
  }
  if (shouldQueueBulletEscape(from, dir, map, enemyTank, enemyBullet, enemy)) {
    me.turn(dir);
    me.go();
    return;
  }
  if (shouldQueueAimedGunEscape(from, dir, map, enemyTank, enemyBullet, enemy)) {
    me.turn(dir);
    me.go();
    return;
  }
  if (shouldQueueCloseTurnShotEscape(from, dir, map, enemyTank, enemyBullet, enemy)) {
    me.turn(dir);
    me.go();
    return;
  }
  moveToward(me, currentDir, from, to);
}

function shouldQueueAimedGunEscape(from, dir, map, enemyTank, enemyBullet, enemy) {
  if (!enemyTank || !enemyAimsAt(enemyTank, from, map)) return false;
  var distance = manhattan(from, enemyTank.position);
  if (distance < 2 || distance > 4) return false;
  var landing = moveLanding(from, dir, map, enemyTank, false);
  if (samePos(landing, from)) return false;
  if (canShoot(enemyTank.position, landing, map)) return false;
  if (bulletThreatLevel(landing, enemyBullet, map) > 0) return false;
  var landingLevel = threatLevel(landing, enemyTank, enemyBullet, map, enemy);
  if (landingLevel === 0) return true;
  return threatLevel(from, enemyTank, enemyBullet, map, enemy) >= 4 && landingLevel < 4;
}

function shouldQueueCloseTurnShotEscape(from, dir, map, enemyTank, enemyBullet, enemy) {
  if (!enemyTank || !enemyCanTurnFireSoon(from, enemyTank, map)) return false;
  var distance = manhattan(from, enemyTank.position);
  if (distance < 1 || distance > 2) return false;
  var landing = moveLanding(from, dir, map, enemyTank, false);
  if (samePos(landing, from)) return false;
  if (canShoot(enemyTank.position, landing, map)) return false;
  if (bulletThreatLevel(landing, enemyBullet, map) > 0) return false;
  return threatLevel(landing, enemyTank, enemyBullet, map, enemy) === 0;
}

function shouldQueueBulletEscape(from, dir, map, enemyTank, enemyBullet, enemy) {
  if (bulletThreatLevel(from, enemyBullet, map) < 4) return false;
  if (enemyStatusFlag(enemy, "stunned") || enemyStatusFlag(enemy, "frozen") || enemyStatusFlag(enemy, "poisoned")) return false;
  var landing = moveLanding(from, dir, map, enemyTank, false);
  if (samePos(landing, from)) return false;
  if (bulletThreatLevel(landing, enemyBullet, map) > 0) return false;
  return tankThreatLevel(landing, enemyTank, map, enemy) === 0;
}

function shouldTakeSoftEscape(from, landing, map, currentLevel, landingLevel, enemyBullet) {
  if (samePos(landing, from)) return false;
  if (currentLevel < 4 || landingLevel >= currentLevel) return false;
  if (bulletThreatLevel(landing, enemyBullet, map) > 0) return false;
  if (isOuterEdge(from, map)) return true;
  var center = centerPoint(map);
  return manhattan(landing, center) <= manhattan(from, center);
}

function shouldTakeSoftStarStep(from, landing, goal, map, currentLevel, landingLevel, enemyBullet, enemy) {
  if (!enemySkillReady(enemy, "teleport")) return false;
  if (!goal || samePos(goal, centerPoint(map)) || samePos(landing, from)) return false;
  if (currentLevel <= 0 || currentLevel >= 4 || landingLevel <= 0 || landingLevel >= 4) return false;
  if (landingLevel > currentLevel) return false;
  if (bulletThreatLevel(landing, enemyBullet, map) > 0) return false;
  var currentDistance = pathDistance(from, goal, map, null);
  var landingDistance = pathDistance(landing, goal, map, null);
  return currentDistance !== null && landingDistance !== null && landingDistance < currentDistance;
}

function shouldAdvanceSoftStarNow(me, myPos, myDir, map, enemyTank, enemyBullet, enemy, star, frame) {
  if (!star) return false;
  var target = chooseTarget(myPos, enemyTank, star, map, frame);
  if (!target || samePos(target, centerPoint(map))) return false;
  var next = nextVetoedStep(myPos, target, map, enemyTank, enemyBullet, myDir, enemy, me.status && me.status.boosted);
  if (!next || directionTo(myPos, next) !== myDir) return false;
  var landing = moveLanding(myPos, myDir, map, enemyTank, me.status && me.status.boosted);
  return shouldTakeSoftStarStep(
    myPos,
    landing,
    target,
    map,
    threatLevel(myPos, enemyTank, enemyBullet, map, enemy),
    threatLevel(landing, enemyTank, enemyBullet, map, enemy),
    enemyBullet,
    enemy
  );
}

function patrol(me, currentDir, position, map, enemyTank, enemyBullet, enemy) {
  var forward = add(position, delta(currentDir));
  var landing = moveLanding(position, currentDir, map, enemyTank, me.status && me.status.boosted);
  if (isPassable(forward, map, enemyTank) && !samePos(landing, position) && !isThreatened(landing, enemyTank, enemyBullet, map, enemy)) {
    me.go();
  } else {
    var step = bestEscapeStep(position, currentDir, map, enemyTank, enemyBullet, enemy, null);
    if (step) moveToward(me, currentDir, position, step);
    else me.turn(rotateRight(currentDir));
  }
}

function nextVetoedStep(start, goal, map, enemyTank, enemyBullet, currentDir, enemy, boosted) {
  var dirs = ["up", "right", "down", "left"];
  var best = null;
  var bestDistance = 9999;
  for (var i = 0; i < dirs.length; i++) {
    var candidate = add(start, delta(dirs[i]));
    if (!isPassable(candidate, map, enemyTank)) continue;
    var landing = moveLanding(start, dirs[i], map, enemyTank, boosted && dirs[i] === currentDir);
    if (samePos(landing, start)) continue;
    if (isThreatened(landing, enemyTank, enemyBullet, map, enemy) &&
        !isSoftStarProgress(start, landing, goal, map, enemyTank, enemyBullet, enemy)) continue;
    if (!samePos(candidate, landing) &&
        isThreatened(candidate, enemyTank, enemyBullet, map, enemy) &&
        !isSoftStarProgress(start, candidate, goal, map, enemyTank, enemyBullet, enemy)) continue;
    var path = pathDistance(landing, goal, map, enemyTank);
    if (path === null) continue;
    var score = path * 10 + edgePenalty(landing, map);
    if (currentDir && dirs[i] !== currentDir) score += 1;
    if (score < bestDistance) {
      best = candidate;
      bestDistance = score;
    }
  }
  return best;
}

function isSoftStarProgress(start, landing, goal, map, enemyTank, enemyBullet, enemy) {
  if (!goal || samePos(goal, centerPoint(map))) return false;
  var currentLevel = threatLevel(start, enemyTank, enemyBullet, map, enemy);
  var landingLevel = threatLevel(landing, enemyTank, enemyBullet, map, enemy);
  return shouldTakeSoftStarStep(start, landing, goal, map, currentLevel, landingLevel, enemyBullet, enemy);
}

function bestEscapeStep(start, currentDir, map, enemyTank, enemyBullet, enemy, goal) {
  var dirs = ["up", "right", "down", "left"];
  var best = null;
  var bestScore = 9999;
  var startThreatened = isThreatened(start, enemyTank, enemyBullet, map, enemy);
  for (var i = 0; i < dirs.length; i++) {
    var dir = dirs[i];
    var candidate = add(start, delta(dir));
    if (!isPassable(candidate, map, enemyTank)) continue;

    var boosted = false;
    var landing = moveLanding(start, dir, map, enemyTank, boosted);
    var level = threatLevel(landing, enemyTank, enemyBullet, map, enemy);
    var score = level * 100;
    if (startThreatened && enemyCanTurnFireSoon(landing, enemyTank, map)) score += 180;
    if (dir !== currentDir) score += startThreatened ? 125 : 3;
    if (enemyTank) score -= Math.min(10, manhattan(landing, enemyTank.position));
    if (goal) score += manhattan(landing, goal);

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function enemyCanTurnFireSoon(position, enemyTank, map) {
  if (!enemyTank) return false;
  if (!canShoot(enemyTank.position, position, map)) return false;
  if (enemyAimsAt(enemyTank, position, map)) return true;
  return manhattan(enemyTank.position, position) <= 5;
}

function nextStep(start, goal, map, enemyTank) {
  var queue = [{ pos: start, first: null }];
  var seen = {};
  seen[key(start)] = true;

  for (var head = 0; head < queue.length; head++) {
    var item = queue[head];
    if (samePos(item.pos, goal)) return item.first;

    var dirs = ["up", "right", "down", "left"];
    for (var i = 0; i < dirs.length; i++) {
      var next = add(item.pos, delta(dirs[i]));
      var k = key(next);
      if (seen[k] || !isPathTile(next, goal, map, enemyTank)) continue;
      seen[k] = true;
      queue.push({ pos: next, first: item.first || next });
    }
  }
  return null;
}

function pathDistance(start, goal, map, enemyTank) {
  if (enemyTank && samePos(start, enemyTank.position) && !samePos(start, goal)) {
    return pathDistanceUncached(start, goal, map, enemyTank);
  }
  var enemyKey = enemyTank ? key(enemyTank.position) : "none";
  var cacheKey = key(goal) + "|" + enemyKey;
  if (!antMemory.pathDistanceCache ||
      antMemory.pathDistanceCache.map !== map ||
      antMemory.pathDistanceCache.key !== cacheKey) {
    antMemory.pathDistanceCache = {
      map: map,
      key: cacheKey,
      distances: buildDistanceField(goal, map, enemyTank)
    };
  }
  var distance = antMemory.pathDistanceCache.distances[key(start)];
  return distance === undefined ? null : distance;
}

function pathDistanceUncached(start, goal, map, enemyTank) {
  var queue = [{ pos: start, distance: 0 }];
  var seen = {};
  seen[key(start)] = true;
  for (var head = 0; head < queue.length; head++) {
    var item = queue[head];
    if (samePos(item.pos, goal)) return item.distance;

    var dirs = ["up", "right", "down", "left"];
    for (var i = 0; i < dirs.length; i++) {
      var next = add(item.pos, delta(dirs[i]));
      var k = key(next);
      if (seen[k] || !isPathTile(next, goal, map, enemyTank)) continue;
      seen[k] = true;
      queue.push({ pos: next, distance: item.distance + 1 });
    }
  }
  return null;
}

function buildDistanceField(goal, map, enemyTank) {
  var queue = [{ pos: goal, distance: 0 }];
  var distances = {};
  distances[key(goal)] = 0;

  for (var head = 0; head < queue.length; head++) {
    var item = queue[head];
    var dirs = ["up", "right", "down", "left"];
    for (var i = 0; i < dirs.length; i++) {
      var next = add(item.pos, delta(dirs[i]));
      var k = key(next);
      if (distances[k] !== undefined || !isPathTile(next, goal, map, enemyTank)) continue;
      distances[k] = item.distance + 1;
      queue.push({ pos: next, distance: item.distance + 1 });
    }
  }
  return distances;
}

function chooseTarget(myPos, enemyTank, star, map, frame) {
  if (!star) {
    antMemory.starKey = null;
    antMemory.starBestDistance = null;
    antMemory.starLastImprovedFrame = frame || 0;
    return centerPoint(map);
  }

  var currentFrame = frame || 0;
  var starKey = key(star);
  var myQuickDistance = manhattan(myPos, star);

  if (antMemory.starKey !== starKey) {
    antMemory.starKey = starKey;
    antMemory.starBestDistance = myQuickDistance;
    antMemory.starLastImprovedFrame = currentFrame;
  } else if (myQuickDistance < antMemory.starBestDistance ||
      antMemory.starBestDistance === null || antMemory.starBestDistance === undefined) {
    antMemory.starBestDistance = myQuickDistance;
    antMemory.starLastImprovedFrame = currentFrame;
  }

  if (shouldSkipClearlyLostInteriorStar(myPos, enemyTank, star, map)) {
    return centerPoint(map);
  }

  if (isOuterEdge(star, map) && enemyTank) {
    var myDistance = pathDistance(myPos, star, map, enemyTank);
    var enemyDistance = pathDistance(enemyTank.position, star, map, null);
    if (myDistance !== null && enemyDistance !== null &&
        myDistance - enemyDistance > -3 &&
        !shouldCommitNearOuterStar(myDistance, enemyDistance) &&
        !shouldRaceDistantOuterStar(star, map, myDistance, enemyDistance)) {
      return centerPoint(map);
    }
  }
  return star;
}

function shouldCommitNearOuterStar(myDistance, enemyDistance) {
  return myDistance <= 4 && enemyDistance <= 4;
}

function shouldRaceDistantOuterStar(star, map, myDistance, enemyDistance) {
  var maxX = map.length - 2;
  var maxY = map[0].length - 2;
  if (star[1] === 1 || star[1] === maxY) {
    return enemyDistance >= 12 && myDistance <= enemyDistance;
  }
  if (star[0] === 1 || star[0] === maxX) {
    return enemyDistance >= 11 && myDistance <= 11 && myDistance <= enemyDistance;
  }
  return false;
}

function shouldSkipClearlyLostInteriorStar(myPos, enemyTank, star, map) {
  if (!enemyTank || isOuterEdge(star, map) || edgePenalty(star, map) > 0) return false;
  if (manhattan(myPos, star) < 7) return false;
  var myDistance = pathDistance(myPos, star, map, enemyTank);
  var enemyDistance = pathDistance(enemyTank.position, star, map, null);
  if (myDistance === null || enemyDistance === null) return false;
  if (enemyDistance <= 4 && myDistance >= 8 && myDistance - enemyDistance >= 5) return true;
  return enemyDistance <= 8 && myDistance >= 16 && myDistance - enemyDistance >= 8;
}

function centerPoint(map) {
  return [Math.floor(map.length / 2), Math.floor(map[0].length / 2)];
}

function isOuterEdge(pos, map) {
  var maxX = map.length - 2;
  var maxY = map[0].length - 2;
  return pos[0] === 1 || pos[0] === maxX || pos[1] === 1 || pos[1] === maxY;
}

function edgePenalty(pos, map) {
  var maxX = map.length - 2;
  var maxY = map[0].length - 2;
  if (pos[0] === 1 || pos[0] === maxX || pos[1] === 1 || pos[1] === maxY) return 3;
  if (pos[0] === 2 || pos[0] === maxX - 1 || pos[1] === 2 || pos[1] === maxY - 1) return 2;
  return 0;
}

function edgeRetreatStep(position, target, map, enemyTank, enemyBullet, enemy) {
  var maxX = map.length - 2;
  var maxY = map[0].length - 2;
  var dirs = [];
  if (position[1] === 1) dirs.push("down");
  if (position[1] === maxY) dirs.push("up");
  if (position[0] === 1) dirs.push("right");
  if (position[0] === maxX) dirs.push("left");

  for (var i = 0; i < dirs.length; i++) {
    var candidate = add(position, delta(dirs[i]));
    if (isGoodEdgeRetreat(position, candidate, target, map, enemyTank, enemyBullet, enemy)) {
      return candidate;
    }
  }
  return null;
}

function isGoodEdgeRetreat(position, candidate, target, map, enemyTank, enemyBullet, enemy) {
  if (!isPassable(candidate, map, enemyTank) || isThreatened(candidate, enemyTank, enemyBullet, map, enemy)) return false;
  if (!target) return true;
  var currentDistance = pathDistance(position, target, map, enemyTank);
  var retreatDistance = pathDistance(candidate, target, map, enemyTank);
  if (currentDistance === null || retreatDistance === null) return true;
  return retreatDistance <= currentDistance || hasInteriorExit(candidate, position, map, enemyTank, enemyBullet, enemy);
}

function hasInteriorExit(position, back, map, enemyTank, enemyBullet, enemy) {
  var dirs = ["up", "right", "down", "left"];
  for (var i = 0; i < dirs.length; i++) {
    var next = add(position, delta(dirs[i]));
    if (samePos(next, back)) continue;
    if (!isPassable(next, map, enemyTank) || isThreatened(next, enemyTank, enemyBullet, map, enemy)) continue;
    if (edgePenalty(next, map) <= edgePenalty(position, map)) return true;
  }
  return false;
}

function safestTurn(position, currentDir, map, enemyTank, enemyBullet, enemy) {
  var dirs = ["up", "right", "down", "left"];
  var best = null;
  var bestScore = 9999;
  for (var i = 0; i < dirs.length; i++) {
    if (dirs[i] === currentDir) continue;
    var candidate = add(position, delta(dirs[i]));
    if (!isPassable(candidate, map, enemyTank)) continue;
    var score = threatLevel(candidate, enemyTank, enemyBullet, map, enemy) * 100 + edgePenalty(candidate, map);
    if (score < bestScore) {
      best = dirs[i];
      bestScore = score;
    }
  }
  return best;
}

function shouldBoost(me, currentDir, start, next, target, map, enemyTank, enemyBullet, enemy, frame) {
  if (!me.skill || me.skill.type !== "boost" || me.skill.remainingCooldownFrames !== 0) return false;
  if (typeof me.boost !== "function" || (me.status && me.status.boosted)) return false;
  if (antMemory.lastBoostFrame !== undefined && (frame || 0) - antMemory.lastBoostFrame < 31) return false;
  if (isThreatened(start, enemyTank, enemyBullet, map, enemy)) return false;
  if (enemyTank && manhattan(start, enemyTank.position) <= 6) return false;
  if (isOuterEdge(start, map)) return false;

  var dir = directionTo(start, next);
  if (dir !== currentDir) return false;

  var first = add(start, delta(dir));
  var second = add(first, delta(dir));
  if (!isPassable(first, map, enemyTank) || !isPassable(second, map, enemyTank)) return false;
  if (hiddenGrassBoostThreat(first, second, map, enemy, frame)) return false;
  if (isThreatened(first, enemyTank, enemyBullet, map, enemy) || isThreatened(second, enemyTank, enemyBullet, map, enemy)) return false;
  if (target && !samePos(target, centerPoint(map))) {
    if (manhattan(start, target) < 4 && !samePos(second, target)) return false;
  }
  return true;
}

function shouldPreBoost(me, start, next, target, map, enemyTank, enemyBullet, enemy, frame) {
  if (!target || samePos(target, centerPoint(map))) return false;
  if (!me.skill || me.skill.type !== "boost" || me.skill.remainingCooldownFrames !== 0) return false;
  if (typeof me.boost !== "function" || (me.status && me.status.boosted)) return false;
  if (antMemory.lastBoostFrame !== undefined && (frame || 0) - antMemory.lastBoostFrame < 31) return false;
  if (isOuterEdge(start, map) || isThreatened(start, enemyTank, enemyBullet, map, enemy)) return false;
  if (enemyTank && manhattan(start, enemyTank.position) <= 8) return false;
  if (manhattan(start, target) < 5) return false;

  var dir = directionTo(start, next);
  var first = add(start, delta(dir));
  var second = add(first, delta(dir));
  if (!isPassable(first, map, enemyTank) || !isPassable(second, map, enemyTank)) return false;
  if (hiddenGrassBoostThreat(first, second, map, enemy, frame)) return false;
  if (isThreatened(first, enemyTank, enemyBullet, map, enemy) || isThreatened(second, enemyTank, enemyBullet, map, enemy)) return false;
  return true;
}

function hiddenGrassBoostThreat(first, second, map, enemy, frame) {
  if (!enemy || enemy.tank || !antMemory.enemyTank) return false;
  var memory = antMemory.enemyTank;
  var age = (frame || 0) - (memory.frame || 0);
  if (age < 0 || age > 18) return false;
  if (!memory.position || map[memory.position[0]][memory.position[1]] !== "o") return false;
  return hiddenGrassBoostLaneThreat(first, memory.position, map) ||
    hiddenGrassBoostLaneThreat(second, memory.position, map);
}

function hiddenGrassBoostLaneThreat(position, origin, map) {
  if (manhattan(origin, position) > 8) return false;
  return canShoot(origin, position, map);
}

function isThreatened(position, enemyTank, enemyBullet, map, enemy) {
  return threatLevel(position, enemyTank, enemyBullet, map, enemy) > 0;
}

function threatLevel(position, enemyTank, enemyBullet, map, enemy) {
  var cacheKey = threatCacheKey(position, enemyTank, enemyBullet, enemy);
  if (antMemory.threatCache && antMemory.threatCache[cacheKey] !== undefined) {
    return antMemory.threatCache[cacheKey];
  }
  var bulletLevel = bulletThreatLevel(position, enemyBullet, map);
  var tankLevel = tankThreatLevel(position, enemyTank, map, enemy);
  var level = bulletLevel > tankLevel ? bulletLevel : tankLevel;
  if (!antMemory.threatCache) antMemory.threatCache = {};
  antMemory.threatCache[cacheKey] = level;
  return level;
}

function threatCacheKey(position, enemyTank, enemyBullet, enemy) {
  return key(position) + "|" +
    (enemyTank ? key(enemyTank.position) + "," + enemyTank.direction : "noTank") + "|" +
    (enemyBullet && enemyBullet.position ? key(enemyBullet.position) + "," + enemyBullet.direction : "noBullet") + "|" +
    enemyStateKey(enemy);
}

function enemyStateKey(enemy) {
  if (!enemy) return "noEnemy";
  var skill = enemy.skill ? enemy.skill.type + "," + enemy.skill.remainingCooldownFrames : "noSkill";
  var status = enemy.status || {};
  return skill + "," +
    !!status.boosted + "," +
    !!status.overloaded + "," +
    !!status.cloaked + "," +
    !!status.shielded + "," +
    !!status.frozen + "," +
    !!status.stunned + "," +
    !!status.poisoned;
}

function bulletThreatLevel(position, bullet, map) {
  if (!bullet || !bullet.position || !bullet.direction) return 0;
  var bulletPos = bullet.position;
  if (samePos(position, bulletPos)) return 4;
  if (!isInDirection(bulletPos, position, bullet.direction)) return 0;
  if (!clearLine(bulletPos, position, map)) return 0;
  return manhattan(bulletPos, position) <= 8 ? 4 : 2;
}

function tankThreatLevel(position, enemyTank, map, enemy) {
  if (!enemyTank) return 0;
  var enemyPos = enemyTank.position;
  if (samePos(position, enemyPos)) return 5;
  var positions = enemyMovePositions(enemyTank, map, enemy);
  var current = 0;
  for (var i = 0; i < positions.length; i++) {
    var origin = positions[i];
    var level = tankPositionThreat(position, enemyTank, origin, map, i === 0);
    if (i > 0 && manhattan(origin, position) <= 1) level = Math.max(level, 3);
    if (level > current) current = level;
  }
  current = Math.max(current, overloadThreatLevel(position, enemyTank, map, enemy));
  current = Math.max(current, hiddenOverloadThreatLevel(position, enemyTank, map, enemy));
  current = Math.max(current, teleportThreatLevel(position, enemyTank, map, enemy));
  current = Math.max(current, controlThreatLevel(position, enemyTank, map, enemy));
  current = Math.max(current, cloakThreatLevel(position, enemyTank, map, enemy));
  current = Math.max(current, unknownMobilityThreatLevel(position, enemyTank, map, enemy));
  if (current > 0) return current;
  if (manhattan(enemyPos, position) <= 1) return 1;
  return 0;
}

function tankPositionThreat(position, enemyTank, enemyPos, map, useDirection) {
  if (samePos(enemyPos, position)) return 5;
  if (canShoot(enemyPos, position, map)) {
    if (useDirection && enemyAimsAt(enemyTank, position, map)) return 4;
    if (manhattan(enemyPos, position) <= 2) return 3;
  }
  return 0;
}

function enemyMovePositions(enemyTank, map, enemy) {
  var positions = [enemyTank.position];
  var steps = enemyMayBoost(enemy) ? 2 : 1;
  var current = enemyTank.position;
  for (var i = 0; i < steps; i++) {
    var next = add(current, delta(enemyTank.direction));
    if (!isOpen(next, map)) break;
    positions.push(next);
    current = next;
  }
  return positions;
}

function overloadThreatLevel(position, enemyTank, map, enemy) {
  if (!enemyMayOverload(enemy)) return 0;
  var best = 0;
  var dirs = enemyOverloadActive(enemy) ? ["up", "right", "down", "left"] : [enemyTank.direction];
  for (var d = 0; d < dirs.length; d++) {
    best = Math.max(best, overloadDirectionThreatLevel(position, enemyTank.position, dirs[d], map, enemy));
  }
  return best;
}

function overloadDirectionThreatLevel(position, enemyPos, dir, map, enemy) {
  var side = perpendicularDeltas(dir);
  var best = 0;
  for (var i = 0; i < side.length; i++) {
    var origin = add(enemyPos, side[i]);
    if (!isOpen(origin, map)) continue;
    if (samePos(origin, position)) best = Math.max(best, 4);
    if (isInDirection(origin, position, dir) && clearLine(origin, position, map)) {
      best = Math.max(best, enemyOverloadActive(enemy) ? 4 : 2);
    }
  }
  return best;
}

function hiddenOverloadThreatLevel(position, enemyTank, map, enemy) {
  if (!enemy || enemy.tank || !enemyMayOverload(enemy)) return 0;
  if (!isOpen(position, map)) return 0;
  var origins = nearbyReachableOrigins(enemyTank.position, map, 3);
  var dirs = ["up", "right", "down", "left"];
  for (var i = 0; i < origins.length; i++) {
    if (!canHideAt(origins[i], map, enemy)) continue;
    if (manhattan(origins[i], position) > 6) continue;
    for (var d = 0; d < dirs.length; d++) {
      if (hiddenOverloadLaneThreat(position, origins[i], dirs[d], map)) {
        return enemyOverloadActive(enemy) ? 4 : 2;
      }
    }
  }
  return 0;
}

function hiddenOverloadLaneThreat(position, origin, dir, map) {
  if (isInDirection(origin, position, dir) && clearLine(origin, position, map)) return true;
  var side = perpendicularDeltas(dir);
  for (var i = 0; i < side.length; i++) {
    var shotOrigin = add(origin, side[i]);
    if (!isOpen(shotOrigin, map)) continue;
    if (isInDirection(shotOrigin, position, dir) && clearLine(shotOrigin, position, map)) return true;
  }
  return false;
}

function canHideAt(position, map, enemy) {
  return enemyStatusFlag(enemy, "cloaked") || map[position[0]][position[1]] === "o";
}

function teleportThreatLevel(position, enemyTank, map, enemy) {
  if (!enemySkillReady(enemy, "teleport")) return 0;
  if (!isOpen(position, map)) return 0;
  if (manhattan(position, enemyTank.position) <= 6) return 2;
  return 0;
}

function controlThreatLevel(position, enemyTank, map, enemy) {
  if (!enemyControlReady(enemy, enemyTank)) return 0;
  if (!isOpen(position, map)) return 0;
  if (manhattan(position, enemyTank.position) <= 4) return 2;
  return 0;
}

function cloakThreatLevel(position, enemyTank, map, enemy) {
  if (!enemyStatusFlag(enemy, "cloaked") && !enemySkillReady(enemy, "cloak")) return 0;
  if (!isOpen(position, map)) return 0;
  var origins = nearbyReachableOrigins(enemyTank.position, map, 2);
  for (var i = 0; i < origins.length; i++) {
    if (manhattan(origins[i], position) <= 4 && canShoot(origins[i], position, map)) return 3;
  }
  return 0;
}

function nearbyReachableOrigins(start, map, maxSteps) {
  var cacheKey = key(start) + "|" + maxSteps;
  if (!antMemory.originCache || antMemory.originCache.map !== map) {
    antMemory.originCache = { map: map, values: {} };
  }
  if (antMemory.originCache.values[cacheKey]) {
    return clonePositions(antMemory.originCache.values[cacheKey]);
  }
  var queue = [{ pos: start, distance: 0 }];
  var seen = {};
  var origins = [];
  seen[key(start)] = true;

  for (var head = 0; head < queue.length; head++) {
    var item = queue[head];
    origins.push(item.pos);
    if (item.distance >= maxSteps) continue;
    var dirs = ["up", "right", "down", "left"];
    for (var i = 0; i < dirs.length; i++) {
      var next = add(item.pos, delta(dirs[i]));
      var k = key(next);
      if (seen[k] || !isOpen(next, map)) continue;
      seen[k] = true;
      queue.push({ pos: next, distance: item.distance + 1 });
    }
  }
  antMemory.originCache.values[cacheKey] = origins;
  return clonePositions(origins);
}

function clonePositions(positions) {
  var cloned = [];
  for (var i = 0; i < positions.length; i++) {
    cloned.push([positions[i][0], positions[i][1]]);
  }
  return cloned;
}

function unknownMobilityThreatLevel(position, enemyTank, map, enemy) {
  if (!enemy || !enemy.skill || enemy.skill.remainingCooldownFrames !== 0) return 0;
  if (isKnownSkill(enemy.skill.type)) return 0;
  if (!isOpen(position, map)) return 0;
  if (manhattan(position, enemyTank.position) <= 4) return 2;
  return 0;
}

function enemyMayBoost(enemy) {
  return enemyStatusFlag(enemy, "boosted") || enemySkillReady(enemy, "boost");
}

function enemyMayOverload(enemy) {
  return enemyOverloadActive(enemy) || enemySkillReady(enemy, "overload");
}

function enemyOverloadActive(enemy) {
  return enemyStatusFlag(enemy, "overloaded");
}

function enemyStatusFlag(enemy, flag) {
  return !!(enemy && enemy.status && enemy.status[flag]);
}

function enemySkillReady(enemy, type) {
  return !!(enemy && enemy.skill && enemy.skill.type === type && enemy.skill.remainingCooldownFrames === 0);
}

function enemyControlReady(enemy, enemyTank) {
  return enemySkillReady(enemy, "freeze") ||
    enemySkillReady(enemy, "stun") ||
    enemySkillReady(enemy, "poison") ||
    rememberedControlLikelyReady(enemyTank, "freeze") ||
    rememberedControlLikelyReady(enemyTank, "stun") ||
    rememberedControlLikelyReady(enemyTank, "poison");
}

function rememberedControlLikelyReady(enemyTank, type) {
  if (!enemyTank || !enemyTank.skill || enemyTank.skill.type !== type) return false;
  var cooldown = enemyTank.skill.remainingCooldownFrames;
  return cooldown === 0 || cooldown === undefined || cooldown <= 8;
}

function isKnownSkill(type) {
  return type === "shield" || type === "freeze" || type === "stun" || type === "overload" || type === "cloak" || type === "poison" || type === "teleport" || type === "boost";
}

function perpendicularDeltas(dir) {
  if (dir === "up" || dir === "down") return [[1, 0], [-1, 0]];
  return [[0, 1], [0, -1]];
}

function isInDirection(from, to, dir) {
  if (dir === "left") return from[1] === to[1] && to[0] < from[0];
  if (dir === "right") return from[1] === to[1] && to[0] > from[0];
  if (dir === "up") return from[0] === to[0] && to[1] < from[1];
  if (dir === "down") return from[0] === to[0] && to[1] > from[1];
  return false;
}

function enemyShielded(enemy) {
  return enemy && enemy.status && enemy.status.shielded;
}

function moveLanding(start, dir, map, enemyTank, boosted) {
  var first = add(start, delta(dir));
  if (!isPassable(first, map, enemyTank)) return start;
  if (!boosted) return first;
  var second = add(first, delta(dir));
  if (!isPassable(second, map, enemyTank)) return first;
  return second;
}

function canShoot(a, b, map) {
  if (a[0] !== b[0] && a[1] !== b[1]) return false;
  return clearLine(a, b, map);
}

function enemyAimsAt(enemyTank, position, map) {
  if (!enemyTank) return false;
  var enemyPos = enemyTank.position;
  var dir = enemyTank.direction;
  if (dir === "left" && enemyPos[1] === position[1] && position[0] < enemyPos[0]) return clearLine(enemyPos, position, map);
  if (dir === "right" && enemyPos[1] === position[1] && position[0] > enemyPos[0]) return clearLine(enemyPos, position, map);
  if (dir === "up" && enemyPos[0] === position[0] && position[1] < enemyPos[1]) return clearLine(enemyPos, position, map);
  if (dir === "down" && enemyPos[0] === position[0] && position[1] > enemyPos[1]) return clearLine(enemyPos, position, map);
  return false;
}

function clearLine(a, b, map) {
  var step = delta(directionTo(a, b));
  var pos = add(a, step);
  while (!samePos(pos, b)) {
    if (!isOpen(pos, map)) return false;
    pos = add(pos, step);
  }
  return true;
}

function directionTo(a, b) {
  if (b[0] > a[0]) return "right";
  if (b[0] < a[0]) return "left";
  if (b[1] > a[1]) return "down";
  return "up";
}

function delta(dir) {
  if (dir === "up") return [0, -1];
  if (dir === "right") return [1, 0];
  if (dir === "down") return [0, 1];
  return [-1, 0];
}

function add(pos, d) {
  return [pos[0] + d[0], pos[1] + d[1]];
}

function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function isOpen(pos, map) {
  return map[pos[0]] && map[pos[0]][pos[1]] && map[pos[0]][pos[1]] !== "x";
}

function isPassable(pos, map, enemyTank) {
  return isOpen(pos, map) && !(enemyTank && samePos(pos, enemyTank.position));
}

function isPathTile(pos, goal, map, enemyTank) {
  if (!isOpen(pos, map)) return false;
  if (enemyTank && samePos(pos, enemyTank.position) && !samePos(pos, goal)) return false;
  return true;
}

function samePos(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function key(pos) {
  return pos[0] + "," + pos[1];
}

function rotateRight(dir) {
  if (dir === "up") return "right";
  if (dir === "right") return "down";
  if (dir === "down") return "left";
  return "up";
}
