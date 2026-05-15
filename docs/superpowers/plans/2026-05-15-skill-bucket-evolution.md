# Skill Bucket Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-off random-loss patching with a skill-bucket experiment loop that can find weak opponent classes, run targeted battles, and keep only changes that improve a bucket without hurting random progression.

**Architecture:** Keep tank behavior changes in `new_tank.js`, but move experiment discipline into small Node scripts. `battle_tools.js` owns report parsing and challenge body construction; challenge runners call it instead of duplicating API payloads.

**Tech Stack:** Node.js, built-in `node:test`, AgenTank challenge API, JSON battle reports.

---

### Task 1: Shared Battle Tools

**Files:**
- Create: `battle_tools.js`
- Test: `battle_tools.test.js`

- [x] **Step 1: Write failing tests**

Cover random challenge body, targeted challenge body, direct defender skill metadata, replay skill inference from `by === 1`, and skill-bucket summaries.

- [x] **Step 2: Run red test**

Run: `node --test battle_tools.test.js`

Expected: FAIL before `battle_tools.js` exists.

- [x] **Step 3: Implement minimal shared helpers**

Implement `buildChallengeBody`, `inferOpponentSkill`, and `summarizeBySkill`.

- [x] **Step 4: Verify green**

Run: `node --test battle_tools.test.js`

Expected: PASS.

### Task 2: Targeted Challenge Runner

**Files:**
- Modify: `batch_battle.js`
- Create: `review_challenge.js`

- [x] **Step 1: Reuse challenge body helper**

Allow `challenge(index, options)` and `runBatch(count, outputFile, options)` to accept `{ opponentTankId }`.

- [x] **Step 2: Add CLI wrapper**

Create `review_challenge.js` so `node review_challenge.js <TankID> [count] [outputFile]` writes `review_report.json`.

- [ ] **Step 3: Run one small targeted challenge when a target ID is selected**

Use this only after selecting a skill bucket opponent from `skill_report.json` or leaderboard search.

### Task 3: Skill Summary Report

**Files:**
- Create: `skill_report.js`
- Modify: `.gitignore`

- [x] **Step 1: Generate bucket report from existing battle report**

Run: `node skill_report.js battle_report.json skill_report.json`

Expected: prints grouped win/loss stats by inferred enemy skill.

- [x] **Step 2: Ignore generated reports**

Add `skill_report.json` and `review_report.json` to `.gitignore`.

### Task 4: Strategy Documentation

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/superpowers/plans/2026-05-15-skill-bucket-evolution.md`

- [x] **Step 1: Document the new evolution strategy**

Add skill-bucket evolution rules: choose one skill bucket, reach 80%+ there, then run random progressive validation before moving to another bucket.

- [x] **Step 2: Document rollback/keep criteria**

Keep a candidate only when the target bucket improves and random 3->5->8->10 does not regress.

### Task 5: Verification

**Files:**
- All changed source and docs.

- [x] **Step 1: Run unit tests**

Run: `node --test battle_tools.test.js new_tank.test.js progressive_battle.test.js`

- [x] **Step 2: Run syntax checks**

Run: `node --check battle_tools.js; node --check skill_report.js; node --check review_challenge.js; node --check batch_battle.js; node --check progressive_battle.js; node --check publish.js; node --check analyze_losses.js; node --check new_tank.js`

- [x] **Step 3: Run coordinate guard scan**

Run the existing `{x, y}` / forbidden-pattern scan before publishing any future tank behavior changes.
