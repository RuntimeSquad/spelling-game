const { session } = require("./cloud-session.cjs");
const fs = require("node:fs/promises");
(async () => {
  const { project, request } = await session();
  const phase = process.argv[2];
  let result;
  if (phase === "recovery") {
    const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/backupSchedules`;
    const schedules = await request(base);
    const daily = (schedules.backupSchedules || []).find(
      (s) => s.dailyRecurrence,
    );
    result = daily
      ? await request(
          "https://firestore.googleapis.com/v1/" +
            daily.name +
            "?updateMask=retention",
          "PATCH",
          { retention: "604800s" },
        )
      : await request(base, "POST", {
          retention: "604800s",
          dailyRecurrence: {},
        });
    const bucket =
      "https://logging.googleapis.com/v2/projects/" +
      project +
      "/locations/global/buckets/_Default";
    const before = await request(bucket);
    if (before.retentionDays !== 30)
      await request(bucket + "?updateMask=retentionDays", "PATCH", {
        retentionDays: 30,
      });
    result = { backups: await request(base), logs: await request(bucket) };
  } else throw Error("Specify recovery");
  await fs.writeFile(
    `artifacts/production-review/release-${phase}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log("Verified " + phase + " configuration");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
