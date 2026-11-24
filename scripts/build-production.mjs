import { loadEnv, build } from "vite";
const env = loadEnv("production-release", process.cwd(), "VITE_");
const config = JSON.parse(env.VITE_FIREBASE_CONFIG || "{}");
if (
  config.projectId !== "spell-bee-c218a" ||
  !config.apiKey ||
  !config.appId ||
  !config.authDomain ||
  !config.storageBucket ||
  !env.VITE_APPCHECK_SITE_KEY
)
  throw Error(
    "Release build refused: verified Firebase web config and App Check site key required in .env.production-release.local. See docs/PRODUCTION_REVIEW.md.",
  );
await build({
  mode: "production-release",
  build: { outDir: "dist-production" },
});
