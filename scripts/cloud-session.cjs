const { createRequire } = require("node:module");
const cli = createRequire(
  "/opt/homebrew/lib/node_modules/firebase-tools/package.json",
);
exports.session = async () => {
  const auth = cli("./lib/auth");
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw Error("Firebase CLI sign-in required");
  const token = await auth.getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ]);
  const project = "spell-bee-c218a";
  return {
    project,
    download: async (url) => {
      const r = await fetch(url, {
        headers: { Authorization: "Bearer " + token.access_token },
      });
      if (!r.ok) throw Error("Private asset download: HTTP " + r.status);
      return Buffer.from(await r.arrayBuffer());
    },
    request: async (url, method = "GET", body, extraHeaders = {}) => {
      const r = await fetch(url, {
        method,
        headers: {
          Authorization: "Bearer " + token.access_token,
          "Content-Type": "application/json",
          "x-goog-user-project": project,
          ...extraHeaders,
        },
        ...(body !== undefined
          ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }
          : {}),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw Error(
          `${method} ${new URL(url).pathname}: ${r.status} ${data.error?.message || ""}`,
        );
      return data;
    },
  };
};
