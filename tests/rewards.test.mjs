import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
const source = ts.transpileModule(
  readFileSync(new URL("../src/rewards.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { emptyRewards, recordRound, rewardStats } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const game = (id, score = 3) => ({
  challenge: { kind: "daily" },
  attempt: { id },
  results: {
    score,
    items: [
      { word: "garden", correct: true },
      { word: "flower", correct: false },
    ],
  },
});
test("revisiting results never duplicates rewards or mastery", () => {
  let data = recordRound(emptyRewards(), game("one"), "2026-11-20");
  data = recordRound(data, game("one"), "2026-11-20");
  assert.equal(rewardStats(data, "2026-11-20").xp, 25);
  assert.deepEqual(data.mastered, ["garden"]);
});
test("streak survives until next daily deadline, then resets", () => {
  let data = recordRound(emptyRewards(), game("one"), "2026-11-19");
  data = recordRound(data, game("two", 5), "2026-11-20");
  assert.equal(rewardStats(data, "2026-11-20").streak, 2);
  assert.equal(rewardStats(data, "2026-11-21").streak, 2);
  assert.equal(rewardStats(data, "2026-11-22").streak, 0);
  assert.equal(rewardStats(data, "2026-11-20").accuracy, 80);
});
test("private games and unrevealed answers cannot advance daily streak", () => {
  const privateGame = game("private");
  privateGame.challenge.kind = "private";
  const data = recordRound(emptyRewards(), privateGame, "2026-11-20");
  assert.equal(rewardStats(data, "2026-11-20").streak, 0);
  assert.equal(rewardStats(data, "2026-11-20").challenges, 1);
  assert.deepEqual(
    recordRound(emptyRewards(), { attempt: { id: "hidden" } }, "2026-11-20"),
    emptyRewards(),
  );
});
