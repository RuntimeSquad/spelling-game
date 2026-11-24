// Explicitly authorized resource setup only. Never deploys code or creates gameplay data.
const { createRequire } = require("node:module");
const cli = createRequire(
  "/opt/homebrew/lib/node_modules/firebase-tools/package.json",
);
const auth = cli("./lib/auth");
const fs = require("node:fs/promises");
const project = "spell-bee-c218a";
(async () => {
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw Error("Existing Firebase CLI sign-in required");
  const token = await auth.getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ]);
  async function request(url, method = "GET", body) {
    const r = await fetch(url, {
      method,
      headers: {
        Authorization: "Bearer " + token.access_token,
        "Content-Type": "application/json",
        "x-goog-user-project": project,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok)
      throw Error(
        `${method} ${new URL(url).pathname}: HTTP ${r.status} ${data.error?.message || ""}`,
      );
    return data;
  }
  const phase = process.argv[2];
  let result;
  if (phase === "services") {
    const all = await request(
      `https://serviceusage.googleapis.com/v1/projects/${project}/services?filter=state:ENABLED&pageSize=200`,
    );
    const enabled = new Set((all.services || []).map((s) => s.config.name));
    const required = [
      "cloudfunctions.googleapis.com",
      "run.googleapis.com",
      "cloudbuild.googleapis.com",
      "artifactregistry.googleapis.com",
      "cloudscheduler.googleapis.com",
      "firebaseappcheck.googleapis.com",
      "recaptchaenterprise.googleapis.com",
      "firebasestorage.googleapis.com",
    ];
    const missing = required.filter((s) => !enabled.has(s));
    result = missing.length
      ? await request(
          `https://serviceusage.googleapis.com/v1/projects/${project}/services:batchEnable`,
          "POST",
          { serviceIds: missing },
        )
      : { done: true };
    console.log("Requested required services: " + missing.join(", "));
  } else if (phase === "auth") {
    const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
    let before;
    try {
      before = await request(url);
    } catch (e) {
      if (!e.message.includes("CONFIGURATION_NOT_FOUND")) throw e;
      await request(
        `https://identitytoolkit.googleapis.com/v2/projects/${project}/identityPlatform:initializeAuth`,
        "POST",
        {},
      );
      before = await request(url);
    }
    const safeBefore = structuredClone(before);
    if (safeBefore.signIn) delete safeBefore.signIn.hashConfig;
    if (safeBefore.notification?.sendEmail?.smtp)
      delete safeBefore.notification.sendEmail.smtp;
    await fs.writeFile(
      "artifacts/production-review/auth-before.json",
      JSON.stringify(safeBefore, null, 2),
    );
    const domains = [
      ...new Set([
        ...(before.authorizedDomains || []),
        `${project}.web.app`,
        `${project}.firebaseapp.com`,
      ]),
    ];
    await request(
      url +
        "?updateMask=signIn.anonymous.enabled,signIn.email.enabled,signIn.email.passwordRequired,authorizedDomains",
      "PATCH",
      {
        signIn: {
          anonymous: { enabled: true },
          email: { enabled: true, passwordRequired: false },
        },
        authorizedDomains: domains,
      },
    );
    const after = await request(url);
    result = {
      anonymous: after.signIn?.anonymous,
      email: after.signIn?.email,
      authorizedDomains: after.authorizedDomains,
    };
  } else if (phase === "bucket") {
    const url = `https://firebasestorage.googleapis.com/v1alpha/projects/${project}/defaultBucket`;
    try {
      result = await request(url);
    } catch (e) {
      if (!e.message.includes("HTTP 404")) throw e;
      result = await request(url, "POST", { location: "us-central1" });
    }
    const name = result.bucket?.name?.split("/").pop();
    if (!name) throw Error("Bucket response has no bucket name");
    const bucketUrl =
      "https://storage.googleapis.com/storage/v1/b/" + encodeURIComponent(name);
    const existing = await request(bucketUrl);
    if (existing.location.toLowerCase() !== "us-central1")
      throw Error("Existing bucket is in another location; unchanged");
    await request(bucketUrl, "PATCH", {
      iamConfiguration: {
        uniformBucketLevelAccess: { enabled: true },
        publicAccessPrevention: "enforced",
      },
    });
    result = await request(bucketUrl);
    const iam = await request(bucketUrl + "/iam");
    if (
      iam.bindings?.some((b) =>
        b.members?.some((m) =>
          ["allUsers", "allAuthenticatedUsers"].includes(m),
        ),
      )
    )
      throw Error(
        "Unexpected public IAM; bucket public access prevention is enforced; review required",
      );
    const objects = await request(bucketUrl + "/o?maxResults=1");
    result = {
      name: result.name,
      location: result.location,
      iamConfiguration: result.iamConfiguration,
      empty: !objects.items?.length,
    };
  } else if (phase === "storage-rules") {
    const bucket = JSON.parse(
      await fs.readFile("artifacts/production-review/setup-bucket.json"),
    ).result.name;
    const base = `https://firebaserules.googleapis.com/v1/projects/${project}`;
    const releaseName = `projects/${project}/releases/firebase.storage/${bucket}`;
    const releases = await request(base + "/releases");
    const existing = (releases.releases || []).find(
      (r) => r.name === releaseName,
    );
    if (existing) {
      const current = await request(
        "https://firebaserules.googleapis.com/v1/" + existing.rulesetName,
      );
      if (
        !current.source?.files?.every((f) =>
          /allow read, write: if false/.test(f.content),
        )
      )
        throw Error("Existing Storage rules need review; not overwritten");
      result = { release: existing, source: current.source };
    } else {
      const content = await fs.readFile("storage.rules", "utf8");
      const rules = await request(base + "/rulesets", "POST", {
        source: { files: [{ name: "storage.rules", content }] },
      });
      const release = await request(base + "/releases", "POST", {
        name: releaseName,
        rulesetName: rules.name,
      });
      const verified = await request(
        "https://firebaserules.googleapis.com/v1/" + release.name,
      );
      const source = await request(
        "https://firebaserules.googleapis.com/v1/" + verified.rulesetName,
      );
      result = { release: verified, source: source.source };
    }
  } else if (phase === "appcheck") {
    const keysUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${project}/keys`;
    const keys = await request(keysUrl);
    let key = (keys.keys || []).find(
      (k) => k.displayName === "Spell-Bee production App Check",
    );
    if (!key)
      key = await request(keysUrl, "POST", {
        displayName: "Spell-Bee production App Check",
        webSettings: {
          allowedDomains: [`${project}.web.app`, `${project}.firebaseapp.com`],
          allowAllDomains: false,
          integrationType: "SCORE",
        },
      });
    const siteKey = key.name.split("/").pop();
    const path =
      "projects/704864382098/apps/1:704864382098:web:d941a4b4472edd62978a4b/recaptchaEnterpriseConfig";
    const url = "https://firebaseappcheck.googleapis.com/v1/" + path;
    await request(url + "?updateMask=siteKey,tokenTtl", "PATCH", {
      name: path,
      siteKey,
      tokenTtl: "3600s",
    });
    const config = await request(url);
    result = {
      siteKey,
      allowedDomains: key.webSettings?.allowedDomains,
      config,
    };
  } else if (phase === "verify-services") {
    const r = await request(
      `https://serviceusage.googleapis.com/v1/projects/${project}/services?filter=state:ENABLED&pageSize=200`,
    );
    result = (r.services || []).map((s) => s.config.name);
  } else throw Error("Specify services, auth, bucket, or verify-services");
  await fs.writeFile(
    `artifacts/production-review/setup-${phase}.json`,
    JSON.stringify({ at: new Date().toISOString(), result }, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
