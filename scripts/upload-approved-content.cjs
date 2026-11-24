const { session } = require("./cloud-session.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const digest = (b) => createHash("sha256").update(b).digest("hex");
const val = (x) =>
  typeof x === "string"
    ? { stringValue: x }
    : typeof x === "number"
      ? { integerValue: String(x) }
      : Array.isArray(x)
        ? { arrayValue: { values: x.map(val) } }
        : { mapValue: { fields: fields(x) } };
const fields = (x) =>
  Object.fromEntries(Object.entries(x).map(([k, v]) => [k, val(v)]));
(async () => {
  if (process.argv[2] !== "--approved-production-upload")
    throw Error("Explicit production upload flag required");
  if (
    Object.keys(process.env).some(
      (k) => k.endsWith("EMULATOR_HOST") && process.env[k],
    )
  )
    throw Error("Remove emulator environment variables from release upload");
  const words = JSON.parse(
    await fs.readFile("functions/assets/words.json", "utf8"),
  );
  if (words.length !== 100 || new Set(words.map((w) => w.id)).size !== 100)
    throw Error("Expected approved 100-word bank");
  const manifest = [];
  for (const w of words) {
    if (
      !/^word-\d{3}$/.test(w.id) ||
      w.audio !== `audio/${w.id}.mp3` ||
      !w.definition ||
      !w.note ||
      !w.accepted.includes(w.word)
    )
      throw Error("Invalid reviewed content: " + w.id);
    const bytes = await fs.readFile(path.join("functions/assets", w.audio));
    if (bytes.length < 100) throw Error("Empty audio");
    manifest.push({
      id: w.id,
      audio: w.audio,
      sha256: digest(bytes),
      wordSha256: digest(JSON.stringify(w)),
      bytes: bytes.length,
    });
  }
  // Validate every local asset before any network writes.
  const { project, request, download } = await session();
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  for (let i = 0; i < words.length; i++) {
    const w = words[i],
      m = manifest[i];
    const name = `projects/${project}/databases/(default)/documents/words/${w.id}`;
    let wordExists = false;
    try {
      const existing = await request(base + "/words/" + w.id);
      wordExists = true;
      if (existing.fields?.releaseSha256?.stringValue !== m.wordSha256)
        throw Error(
          "Existing content differs; explicit version migration required",
        );
    } catch (e) {
      if (!e.message.includes("404")) throw e;
    }
    const audioUrl =
      "https://storage.googleapis.com/storage/v1/b/spell-bee-c218a.firebasestorage.app/o/" +
      encodeURIComponent(w.audio);
    let audioExists = false;
    try {
      const meta = await request(audioUrl);
      audioExists = true;
      if (meta.metadata?.sha256 && meta.metadata.sha256 !== m.sha256)
        throw Error("Existing audio differs; explicit migration required");
    } catch (e) {
      if (!e.message.includes("404")) throw e;
    }
    if (!audioExists) {
      const bytes = await fs.readFile(path.join("functions/assets", w.audio));
      const boundary = "spellbee-" + m.sha256;
      const metadata = {
        name: w.audio,
        contentType: "audio/mpeg",
        cacheControl: "private, no-store",
        metadata: { sha256: m.sha256 },
      };
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: audio/mpeg\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      await request(
        `https://storage.googleapis.com/upload/storage/v1/b/spell-bee-c218a.firebasestorage.app/o?uploadType=multipart&ifGenerationMatch=0`,
        "POST",
        body,
        { "Content-Type": "multipart/related; boundary=" + boundary },
      );
    }
    const verified = await request(audioUrl);
    if (Number(verified.size) !== m.bytes) throw Error("Audio size mismatch");
    const remoteBytes = await download(audioUrl + "?alt=media");
    if (digest(remoteBytes) !== m.sha256)
      throw Error("Audio checksum mismatch");
    if (!wordExists)
      await request(base + ":commit", "POST", {
        writes: [
          {
            update: {
              name,
              fields: fields({ ...w, releaseSha256: m.wordSha256 }),
            },
            currentDocument: { exists: false },
          },
        ],
      });
    if ((i + 1) % 20 === 0)
      console.log(`Verified ${i + 1}/100 approved content entries`);
  }
  await fs.writeFile(
    "artifacts/production-review/content-manifest.json",
    JSON.stringify({ project, count: manifest.length, manifest }, null, 2),
  );
  console.log(
    "Verified approved production content: 100 words and recordings; no gameplay data imported.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
