// Read-only inspection. Reuses the Firebase CLI sign-in without printing credentials.
const { createRequire } = require("node:module");
const cli = createRequire(
  "/opt/homebrew/lib/node_modules/firebase-tools/package.json",
);
const auth = cli("./lib/auth");
const fs = require("node:fs/promises");
(async () => {
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw Error("Firebase CLI sign-in required");
  const token = await auth.getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ]);
  const headers = { Authorization: "Bearer " + token.access_token };
  const p = "spell-bee-c218a";
  const targets = {
    project: `https://firebase.googleapis.com/v1beta1/projects/${p}`,
    database: `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)`,
    auth: `https://identitytoolkit.googleapis.com/admin/v2/projects/${p}/config`,
    sites: `https://firebasehosting.googleapis.com/v1beta1/projects/${p}/sites`,
    buckets: `https://storage.googleapis.com/storage/v1/b?project=${p}`,
    billing: `https://cloudbilling.googleapis.com/v1/projects/${p}/billingInfo`,
    services: `https://serviceusage.googleapis.com/v1/projects/${p}/services?filter=state:ENABLED&pageSize=200`,
    releases: `https://firebaserules.googleapis.com/v1/projects/${p}/releases`,
    backups: `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/backupSchedules`,
    functions: `https://cloudfunctions.googleapis.com/v2/projects/${p}/locations/us-central1/functions`,
  };
  const result = { inspectedAt: new Date().toISOString(), project: p };
  await Promise.all(
    Object.entries(targets).map(async ([key, url]) => {
      const r = await fetch(url, { headers });
      const data = await r.json();
      result[key] = { status: r.status, data };
    }),
  );
  if (result.auth?.data?.signIn) delete result.auth.data.signIn.hashConfig;
  if (result.auth?.data?.notification?.sendEmail?.smtp)
    delete result.auth.data.notification.sendEmail.smtp;
  if (result.billing.data.billingAccountName) {
    const r = await fetch(
      "https://billingbudgets.googleapis.com/v1/" +
        result.billing.data.billingAccountName +
        "/budgets",
      { headers },
    );
    result.budgets = { status: r.status, data: await r.json() };
  }
  for (const release of result.releases.data.releases || []) {
    if (!release.rulesetName) continue;
    const r = await fetch(
      "https://firebaserules.googleapis.com/v1/" + release.rulesetName,
      { headers },
    );
    (result.rulesets ??= []).push({ status: r.status, data: await r.json() });
  }
  await fs.writeFile(
    "artifacts/production-review/inspection.json",
    JSON.stringify(result, null, 2),
  );
  for (const [key, v] of Object.entries(result))
    if (v?.status) console.log(key + ": HTTP " + v.status);
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
