import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(
    new URL("artifacts/voice-review/bank-audio-manifest.json", root),
    "utf8",
  ),
);
if (
  manifest.words.length !== 100 ||
  new Set(manifest.words.map((w) => w.word)).size !== 100
)
  throw Error("Expected 100 unique reviewed words");
await mkdir(new URL("functions/assets/audio/", root), { recursive: true });
await writeFile(
  new URL("functions/assets/words.json", root),
  JSON.stringify(
    manifest.words.map((w) => ({
      id: w.id,
      word: w.word,
      definition: w.definition,
      accepted: [w.acceptedSpelling],
      note: w.note,
      audio: `audio/${w.id}.mp3`,
      version: 1,
    })),
  ),
);
for (const w of manifest.words)
  await copyFile(
    new URL(`artifacts/voice-review/${w.audio}`, root),
    new URL(`functions/assets/audio/${w.id}.mp3`, root),
  );
console.log("Prepared 100 words/audio assets privately for emulator seeding.");
