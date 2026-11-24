const fs = require("node:fs/promises");
(async () => {
  const origin = "https://spell-bee-c218a.web.app";
  const cases = [
    ["home", origin, 200],
    ["deepLink", origin + "/c/release-routing-check", 200],
    [
      "answerBankDenied",
      "https://firestore.googleapis.com/v1/projects/spell-bee-c218a/databases/(default)/documents/words/word-001",
      403,
    ],
    [
      "directAudioDenied",
      "https://firebasestorage.googleapis.com/v0/b/spell-bee-c218a.firebasestorage.app/o/audio%2Fword-001.mp3?alt=media",
      403,
    ],
    [
      "missingAuthAndAppCheck",
      "https://us-central1-spell-bee-c218a.cloudfunctions.net/getDailyChallenge",
      401,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      },
    ],
  ];
  const results = await Promise.all(
    cases.map(async ([name, url, expected, options]) => {
      const r = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(45000),
      });
      const text = await r.text();
      if (r.status !== expected)
        throw Error(`${name}: expected ${expected}, received ${r.status}`);
      if (["home", "deepLink"].includes(name) && !text.includes("Spell-Bee"))
        throw Error(name + ": missing app shell");
      return { name, status: r.status, passed: true };
    }),
  );
  await fs.writeFile(
    "artifacts/production-review/live-check.json",
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  results.forEach((r) => console.log("PASS " + r.name + ": " + r.status));
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
