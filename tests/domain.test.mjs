import { test } from "node:test";
import assert from "node:assert/strict";
import domain from "../functions/lib/domain.js";
const {
  normalizeAnswer,
  scoreAnswers,
  dailyWindow,
  rankScores,
  addMonths,
  assertLocalEnvironment,
} = domain;
test("scoring is 0–5; wrong and missing answers earn zero", () => {
  assert.equal(scoreAnswers([]), 0);
  assert.equal(scoreAnswers([{ correct: true }, { correct: false }]), 1);
  assert.equal(
    scoreAnswers(Array.from({ length: 5 }, () => ({ correct: true }))),
    5,
  );
});
test("normalization ignores case/outer space, never punctuation or inner space", () => {
  assert.equal(normalizeAnswer(" NeCeSsArY "), "necessary");
  assert.notEqual(normalizeAnswer("necessary!"), "necessary");
  assert.notEqual(normalizeAnswer("ne cessary"), "necessary");
});
test("UTC daily window is shared across local time zones and daylight saving", () => {
  for (const time of ["2026-03-08T09:59:59Z", "2026-11-01T09:00:00Z"]) {
    const w = dailyWindow(Date.parse(time));
    assert.equal(w.closesAt - w.opensAt, 86400000);
    assert.equal(new Date(w.closesAt).getUTCHours(), 0);
  }
  const w = dailyWindow(Date.parse("2026-10-29T23:59:59Z"));
  assert.equal(w.date, "2026-10-29");
  assert.equal(w.closesAt, Date.parse("2026-10-30T00:00:00Z"));
});
test("competition ties skip ranks without speed advantage", () => {
  assert.deepEqual(
    rankScores([{ score: 4 }, { score: 5 }, { score: 5 }, { score: 0 }]).map(
      (r) => r.rank,
    ),
    [1, 1, 3, 4],
  );
});
test("calendar retention clamps month ends", () => {
  assert.equal(
    new Date(addMonths(Date.parse("2024-02-29T12:00:00Z"), 24)).toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
});
test("production and missing emulator hosts fail closed", () => {
  assert.throws(() =>
    assertLocalEnvironment({ GCLOUD_PROJECT: "spell-bee-c218a" }),
  );
  assert.throws(() =>
    assertLocalEnvironment({
      FUNCTIONS_EMULATOR: "true",
      GCLOUD_PROJECT: "demo-spell-bee",
      FIRESTORE_EMULATOR_HOST: "production.example:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    }),
  );
  assert.doesNotThrow(() =>
    assertLocalEnvironment({
      FUNCTIONS_EMULATOR: "true",
      GCLOUD_PROJECT: "demo-spell-bee",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    }),
  );
});

test("production runtime only accepts explicit reviewed project and bucket", async () => {
  const { spawnSync } = await import("node:child_process");
  const check = (extra) =>
    spawnSync(
      process.execPath,
      ["-e", "require('./functions/lib/runtime.js')"],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, ...extra },
        encoding: "utf8",
      },
    );
  assert.notEqual(check({ GCLOUD_PROJECT: "spell-bee-c218a" }).status, 0);
  assert.notEqual(
    check({
      GCLOUD_PROJECT: "wrong",
      SPELLBEE_RELEASE: "production",
      SPELLBEE_STORAGE_BUCKET: "test",
    }).status,
    0,
  );
  assert.notEqual(
    check({ GCLOUD_PROJECT: "spell-bee-c218a", SPELLBEE_RELEASE: "production" })
      .status,
    0,
  );
  assert.equal(
    check({
      GCLOUD_PROJECT: "spell-bee-c218a",
      SPELLBEE_RELEASE: "production",
      SPELLBEE_STORAGE_BUCKET: "verified-test-bucket",
    }).status,
    0,
  );
});

test("consented reports distinguish sharing intent from attributed starts and expose no raw IDs", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { report } = require("../scripts/analytics-report.cjs");
  const { createHash } = await import("node:crypto");
  const inviter = createHash("sha256").update("owner-raw-uid").digest("hex");
  const t = Date.now() - 10 * 86400000;
  const rows = [
    { playerId: "owner-raw-uid", event: "visit", createdAt: t },
    { playerId: "owner-raw-uid", event: "visit", createdAt: t + 86400000 },
    { playerId: "owner-raw-uid", event: "link_copied", createdAt: t },
    {
      playerId: "friend-raw-uid",
      event: "attempt_started",
      createdAt: t,
      properties: { inviter },
    },
    {
      playerId: "friend-raw-uid",
      event: "attempt_completed",
      createdAt: t + 86400000,
    },
    {
      playerId: "friend-raw-uid",
      event: "word_submitted",
      createdAt: t,
      properties: { position: 1 },
    },
  ];
  const r = report(rows);
  assert.equal(r.visitors, 1);
  assert.equal(r.repeatVisitors, 1);
  assert.equal(r.starts, 1);
  assert.equal(r.completions, 1);
  assert.equal(r.wordSubmissionsByPosition[0], 1);
  assert.equal(r.retention.D1.returned, 1);
  assert.equal(r.invitationActivity[0].attributedFriendStarts, 1);
  assert(!JSON.stringify(r).includes("raw-uid"));
});
