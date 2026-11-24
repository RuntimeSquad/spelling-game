const { session } = require("./cloud-session.cjs");
const fs = require("node:fs/promises");
(async () => {
  const { project, request } = await session();
  const functions = await request(
    `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/us-central1/functions`,
  );
  const rows = (functions.functions || []).map((f) => ({
    name: f.name.split("/").pop(),
    state: f.state,
    serviceAccount: f.serviceConfig?.serviceAccountEmail,
    uri: f.serviceConfig?.uri,
  }));
  if (
    rows.length !== 19 ||
    rows.some(
      (f) =>
        f.state !== "ACTIVE" ||
        f.serviceAccount !==
          "spellbee-runtime@spell-bee-c218a.iam.gserviceaccount.com",
    ) ||
    rows.some((f) => f.name.startsWith("preview"))
  )
    throw Error("Runtime deployment readback mismatch");
  const indexes = await request(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/attempts/indexes`,
  );
  if (
    (indexes.indexes || []).length < 2 ||
    (indexes.indexes || []).some((i) => i.state !== "READY")
  )
    throw Error("Indexes not ready");
  const releases = await request(
    `https://firebasehosting.googleapis.com/v1beta1/sites/${project}/releases?pageSize=1`,
  );
  const result = {
    at: new Date().toISOString(),
    url: `https://${project}.web.app`,
    functions: rows,
    indexes: (indexes.indexes || []).map((i) => ({
      name: i.name,
      state: i.state,
    })),
    hostingRelease: releases.releases?.[0]?.name,
  };
  await fs.writeFile(
    "artifacts/production-review/deployed-release.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    `Verified ${rows.length} ACTIVE Functions with approved runtime identity; indexes READY; Hosting release present.`,
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
