import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
import adventure from "../functions/lib/adventure.js";
const source = ts.transpileModule(
  readFileSync(new URL("../src/adventureProgress.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const {
  newAdventure,
  completeAdventure,
  levelUnlocked,
  starsFor,
  claimAdventureChest,
  chooseChestPrize,
  restoreAdventure,
  spendBooster,
} = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const { adventureLevels, correctAdventurePositions, weekStart } = adventure;
const words = adventureLevels[0].words,
  all = words.map((w) => w.word);
test("adventure awards one star per correct word, including zero for zero correct", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(starsFor), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map(adventure.adventureStars),
    [0, 1, 2, 3, 4, 5],
  );
});
test("first completion unlocks next level and replays cannot farm honey", () => {
  const initial = newAdventure();
  assert.equal(levelUnlocked(initial, 2), false);
  const first = completeAdventure(initial, 1, all, words);
  assert.equal(first.earned, 35);
  assert.equal(levelUnlocked(first.progress, 2), true);
  assert.equal(levelUnlocked(first.progress, 3), false);
  const repeat = completeAdventure(first.progress, 1, all, words);
  assert.equal(repeat.earned, 0);
  assert.equal(repeat.progress.honey, 35);
});
test("improving a score earns only the difference; worse retries preserve stars", () => {
  const first = completeAdventure(
    newAdventure(),
    1,
    ["wrong", ...all.slice(1)],
    words,
  );
  const better = completeAdventure(first.progress, 1, all, words);
  assert.equal(better.earned, 5);
  assert.equal(better.progress.honey, 35);
  const worse = completeAdventure(
    better.progress,
    1,
    all.map(() => "wrong"),
    words,
  );
  assert.equal(worse.progress.best[1], 5);
  assert.equal(worse.earned, 0);
});
test("catalog has twelve five-word levels with unique accessible definitions", () => {
  assert.equal(adventureLevels.length, 12);
  const seen = new Set();
  for (const l of adventureLevels) {
    assert.equal(l.words.length, 5);
    for (const w of l.words) {
      assert.ok(w.definition && w.hint);
      assert.ok(!seen.has(w.word));
      seen.add(w.word);
    }
  }
  assert.equal(seen.size, 60);
  assert.ok(
    adventureLevels[11].words.reduce((n, w) => n + w.word.length, 0) >
      adventureLevels[0].words.reduce((n, w) => n + w.word.length, 0),
  );
});
test("team contributions validate word positions and malformed submissions", () => {
  assert.deepEqual(
    correctAdventurePositions(1, [" SUN ", "wrong", ...all.slice(2)]),
    [0, 2, 3, 4],
  );
  for (const [level, answers] of [
    [0, all],
    [1, []],
    [1, [1, 2, 3, 4, 5]],
    [1, all.map(() => "a".repeat(101))],
  ])
    assert.throws(() => correctAdventurePositions(level, answers));
});
test("weekly goals use Monday UTC across week and year boundaries", () => {
  assert.equal(weekStart(Date.parse("2026-11-22T23:59:59Z")), "2026-11-16");
  assert.equal(weekStart(Date.parse("2026-11-23T00:00:00Z")), "2026-11-23");
  assert.equal(weekStart(Date.parse("2027-01-01T00:00:00Z")), "2026-12-28");
});

test("chests award earned boosters once per honey milestone", () => {
  const initial = { ...newAdventure(), honey: 100 };
  const awarded = claimAdventureChest(
    initial,
    chooseChestPrize(initial, () => 0),
  );
  assert.deepEqual(awarded.boosters, {
    slow: 2,
    letter: 0,
    hint: 0,
  });
  assert.equal(awarded.opened, 1);
  assert.equal(awarded.accessory, 0);
  assert.equal(awarded.lastChestPrize.label, "2 slow replays");
  assert.deepEqual(claimAdventureChest(awarded), awarded);
  assert.deepEqual(claimAdventureChest(newAdventure()), newAdventure());
});
test("legacy saves receive previously earned chest boosters once", () => {
  const legacy = { ...newAdventure(), opened: 2 };
  delete legacy.boosters;
  const migrated = restoreAdventure(legacy);
  assert.deepEqual(migrated.boosters, {
    slow: 4,
    letter: 4,
    hint: 4,
  });
  assert.deepEqual(restoreAdventure(migrated), migrated);
});
test("booster use spends one charge without negative counts or changing stars", () => {
  const initial = newAdventure();
  initial.boosters.hint = 1;
  const spent = spendBooster(initial, "hint");
  assert.equal(spent.boosters.hint, 0);
  assert.deepEqual(spendBooster(spent, "hint"), spent);
  assert.deepEqual(initial.boosters.hint, 1);
  assert.deepEqual(spent.best, initial.best);
});

test("new players start with zero consumable boosters", () => {
  assert.deepEqual(newAdventure().boosters, { slow: 0, letter: 0, hint: 0 });
});
test("migration removes old starter balances while retaining unspent chest rewards", () => {
  const old = {
    ...newAdventure(),
    boosterVersion: undefined,
    opened: 1,
    boosters: { replay: 13, slow: 5, letter: 1, hint: 3 },
  };
  const migrated = restoreAdventure(old);
  assert.deepEqual(migrated.boosters, { slow: 2, letter: 1, hint: 2 });
  assert.deepEqual(restoreAdventure(migrated), migrated);
  const unused = { ...old, opened: 0 };
  assert.deepEqual(restoreAdventure(unused).boosters, {
    slow: 0,
    letter: 0,
    hint: 0,
  });
});

test("mystery chests reveal exactly the chosen prize and avoid owned cosmetics", () => {
  const initial = { ...newAdventure(), honey: 100 };
  const prize = chooseChestPrize(initial, () => 0.999);
  assert.equal(prize.kind, "accessory");
  const awarded = claimAdventureChest(initial, prize);
  assert.deepEqual(awarded.boosters, initial.boosters);
  assert.deepEqual(awarded.ownedAccessories, [4]);
  assert.equal(awarded.accessory, 4);
  const next = chooseChestPrize(awarded, () => 0.999);
  assert.equal(next.accessory, 3);
});
test("mystery chest can award each booster type without granting the other prizes", () => {
  const initial = {
    ...newAdventure(),
    honey: 100,
    ownedAccessories: [1, 2, 3, 4],
  };
  for (const [index, kind] of ["slow", "letter", "hint"].entries()) {
    const prize = chooseChestPrize(initial, () => (index + 0.1) / 3);
    const result = claimAdventureChest(initial, prize);
    assert.equal(result.boosters[kind], 2);
    assert.equal(
      Object.values(result.boosters).reduce((a, b) => a + b, 0),
      2,
    );
  }
});
