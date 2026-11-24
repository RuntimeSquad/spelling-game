import { readFile } from "node:fs/promises";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
export async function seed() {
  if (
    process.env.GCLOUD_PROJECT !== "demo-spell-bee" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
    process.env.FIREBASE_STORAGE_EMULATOR_HOST !== "127.0.0.1:9199"
  )
    throw Error(
      "Seed refused: explicit local demo project and emulator hosts required.",
    );
  if (!getApps().length)
    initializeApp({
      projectId: "demo-spell-bee",
      storageBucket: "demo-spell-bee.appspot.com",
    });
  const words = JSON.parse(
    await readFile(
      new URL("../functions/assets/words.json", import.meta.url),
      "utf8",
    ),
  );
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const batch = db.batch();
  for (const w of words) batch.set(db.collection("words").doc(w.id), w);
  await batch.commit();
  for (let i = 0; i < words.length; i += 10)
    await Promise.all(
      words
        .slice(i, i + 10)
        .map((w) =>
          bucket.upload(
            new URL(`../functions/assets/${w.audio}`, import.meta.url).pathname,
            { destination: w.audio, metadata: { contentType: "audio/mpeg" } },
          ),
        ),
    );
  console.log("Seeded local demo: 100 words and recordings.");
}
if (process.argv[1] === new URL(import.meta.url).pathname) await seed();
