import { assertLocalEnvironment } from "./domain";
export const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
export const projectId =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (isEmulator) assertLocalEnvironment(process.env);
else if (
  projectId !== "spell-bee-c218a" ||
  process.env.SPELLBEE_RELEASE !== "production"
)
  throw Error(
    "Production requires the reviewed spell-bee-c218a release configuration.",
  );
export const storageBucket = isEmulator
  ? "demo-spell-bee.appspot.com"
  : process.env.SPELLBEE_STORAGE_BUCKET;
if (!storageBucket)
  throw Error("A verified production audio bucket is required.");
export const appOrigin = isEmulator
  ? "http://127.0.0.1:5173"
  : "https://spell-bee-c218a.web.app";
export function requirePreview() {
  if (!isEmulator) throw Error("Preview controls are disabled in production.");
}
