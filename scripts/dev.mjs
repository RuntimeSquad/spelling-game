import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const localNode = resolve(".local/toolchains/node-v22.23.4-darwin-arm64/bin");
const env = {
  ...process.env,
  PATH: (existsSync(localNode) ? localNode + ":" : "") + process.env.PATH,
  GCLOUD_PROJECT: "demo-spell-bee",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
};
const children = [];
const run = (cmd, args) => {
  const p = spawn(cmd, args, { stdio: "inherit", env });
  children.push(p);
  return p;
};
const once = (p) =>
  new Promise((resolve, reject) => {
    p.on("error", reject);
    p.on("exit", (c) =>
      c === 0 ? resolve() : reject(Error("Command exited " + c)),
    );
  });
const stop = () => {
  for (const p of children) if (p.exitCode === null) p.kill("SIGINT");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  await once(run("npm", ["run", "prepare:assets"]));
  await once(run("npm", ["run", "build", "--workspace", "functions"]));
  await mkdir(".local", { recursive: true });
  const emulators = run("firebase", [
    "emulators:start",
    "--project",
    "demo-spell-bee",
    "--only",
    "auth,firestore,functions,storage",
    "--import",
    ".local/emulators",
    "--export-on-exit",
    ".local/emulators",
  ]);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (emulators.exitCode !== null) throw Error("Emulators exited");
    try {
      const r = await fetch("http://127.0.0.1:4400/emulators");
      const info = await r.json();
      if (info.firestore && info.auth && info.functions && info.storage) {
        const storage = await fetch("http://127.0.0.1:9199/");
        const fn = await fetch(
          "http://127.0.0.1:5001/demo-spell-bee/us-central1/getDailyChallenge",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: {} }),
          },
        );
        if (storage.status && fn.status === 401) {
          ready = true;
          break;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw Error("Emulators did not become ready");
  await once(run("node", ["scripts/seed.mjs"]));
  run("npm", ["run", "dev:client"]);
  console.log(
    "\nLocal review: http://127.0.0.1:5173 · Emulator UI: http://127.0.0.1:4000\n",
  );
} catch (e) {
  console.error(e);
  stop();
  process.exitCode = 1;
}
