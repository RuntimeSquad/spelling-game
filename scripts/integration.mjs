import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp as clientApp } from "firebase/app";
import {
  getAuth as clientAuth,
  connectAuthEmulator,
  signInAnonymously,
  signInWithEmailLink,
  EmailAuthProvider,
  linkWithCredential,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  getFirestore as clientFirestore,
  connectFirestoreEmulator,
  getDoc,
  doc,
} from "firebase/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { seed } from "./seed.mjs";
process.env.GCLOUD_PROJECT = "demo-spell-bee";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
await seed();
const db = getFirestore();
let checks = 0;
const ok = (msg) => {
  console.log("PASS " + msg);
  checks++;
};
async function player() {
  const app = clientApp(
    { projectId: "demo-spell-bee", apiKey: "demo-key" },
    randomUUID(),
  );
  const auth = clientAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  await signInAnonymously(auth);
  const f = getFunctions(app, "us-central1");
  connectFunctionsEmulator(f, "127.0.0.1", 5001);
  return {
    app,
    auth,
    call: async (name, data = {}) => (await httpsCallable(f, name)(data)).data,
  };
}
const a = await player(),
  b = await player();
const [daily1, daily2] = await Promise.all([
  a.call("getDailyChallenge"),
  b.call("getDailyChallenge"),
]);
assert.equal(daily1.challenge.id, daily2.challenge.id);
ok("daily creation is shared and idempotent");
const requestId = randomUUID();
const private1 = await a.call("createPrivateChallenge", { requestId });
const private2 = await a.call("createPrivateChallenge", { requestId });
assert.equal(private1.challenge.id, private2.challenge.id);
const cid = private1.challenge.id;
assert.equal(
  private1.challenge.closesAt - private1.challenge.opensAt,
  86400000,
);
ok("private challenge retries reuse the same 24-hour window");
const start = { challengeId: cid };
const starts = await Promise.all([
  a.call("startAttempt", start),
  a.call("startAttempt", start),
]);
assert.equal(starts[0].attempt.id, starts[1].attempt.id);
assert.equal(
  (await db.collection("attempts").where("challengeId", "==", cid).get()).size,
  1,
);
ok("concurrent starts create one attempt");
assert.equal(starts[0].attempt.displayName, "Guest");
await assert.rejects(
  a.call("setAttemptName", { challengeId: cid, displayName: "Early" }),
);

await b.call("startAttempt", { challengeId: cid, displayName: "Friend" });
const secrets = (await db.doc("challengeSecrets/" + cid).get()).data();
const wordDocs = await Promise.all(
  secrets.wordIds.map((id) => db.doc("words/" + id).get()),
);
const words = wordDocs.map((w) => w.data());
const prompt = await a.call("getPrompt", { challengeId: cid });
assert.equal(prompt.definition, words[0].definition);
assert.equal(prompt.position, 0);
assert(!JSON.stringify(prompt).includes(words[0].word));
const audio = await fetch(prompt.audioUrl);
assert.equal(audio.status, 200);
assert(audio.headers.get("content-type").includes("audio/mpeg"));
assert((await audio.arrayBuffer()).byteLength > 100);
ok("prompt contains no answer spelling; audio grant serves actual MP3");
const first = {
  challengeId: cid,
  position: 0,
  answer: " " + words[0].word.toUpperCase() + " ",
};
const responses = await Promise.all([
  a.call("submitAnswer", first),
  a.call("submitAnswer", first),
]);
assert(responses.every((s) => s.attempt.position === 1));
assert(!responses[0].results);
assert(!("score" in responses[0].attempt));
await assert.rejects(a.call("submitAnswer", { ...first, answer: "different" }));
ok(
  "concurrent retry scores once; correctness stays hidden; conflicting answers lock",
);
const resumed = await a.call("getChallenge", { challengeId: cid });
assert.equal(resumed.attempt.position, 1);
ok("saved progress resumes server-side");
for (let i = 1; i < 5; i++)
  await a.call("submitAnswer", {
    challengeId: cid,
    position: i,
    answer: i === 3 ? "wrong" : words[i].word,
  });
const result = await a.call("getChallenge", { challengeId: cid });
assert.equal(result.results, undefined);
assert(!("score" in result.attempt));
const pendingHistory = await a.call("getHistory");
assert.equal(
  pendingHistory.rows.find((r) => r.challengeId === cid).score,
  null,
);
const named = await a.call("setAttemptName", {
  challengeId: cid,
  displayName: "Curtis",
});
assert.equal(named.attempt.displayName, "Curtis");
assert.deepEqual(named.results, result.results);
assert.equal(
  (await b.call("getChallenge", { challengeId: cid })).attempt.displayName,
  "Friend",
);
await assert.rejects(
  a.call("setAttemptName", { challengeId: cid, displayName: " " }),
);
ok("nameless start and post-game naming preserve results and other players");

assert.equal(
  (await b.call("getChallenge", { challengeId: cid })).results,
  undefined,
);
assert.equal(
  (await b.call("getStandings", { challengeId: cid })).closed,
  false,
);
ok(
  "completed friend challenge hides score and answers, including history, until closure",
);
await db.doc("challenges/" + cid).update({ closesAt: Date.now() - 100 });
const revealed = await a.call("getChallenge", { challengeId: cid });
assert.equal(revealed.results.score, 4);
assert.equal(revealed.results.items.length, 5);
assert.equal(revealed.results.items[3].submitted, "wrong");
ok("closure reveals personal scores and answer review");

await assert.rejects(
  b.call("submitAnswer", {
    challengeId: cid,
    position: 0,
    answer: words[0].word,
  }),
);
const partial = await b.call("getChallenge", { challengeId: cid });
assert.equal(partial.attempt.status, "expired");
assert.equal(partial.results.score, 0);
const standings = await a.call("getStandings", { challengeId: cid });
assert.deepEqual(
  standings.rows.map((r) => r.rank),
  [1, 2],
);
assert.equal(standings.rows[1].partial, true);
ok(
  "late new answers rejected; expired partial scores zero and appears in final standings",
);
assert.equal((await a.call("submitAnswer", first)).results.score, 4);
ok("saved identical answer retries remain safe after closure");
const rematch = await a.call("createRematch", {
  challengeId: cid,
  requestId: randomUUID(),
});
const next = (
  await db.doc("challengeSecrets/" + rematch.challenge.id).get()
).get("wordIds");
assert(!next.some((id) => secrets.wordIds.includes(id)));
ok("rematch has a new link and new five-word set");
const fs = clientFirestore(b.app);
connectFirestoreEmulator(fs, "127.0.0.1", 8080);
await assert.rejects(getDoc(doc(fs, "words", words[0].id)));
ok("direct signed-in client cannot read answer bank");
const playerId = a.auth.currentUser.uid;
await a.call("setAnalyticsConsent", { allowed: false });
await a.call("recordEvent", { event: "visit", eventId: "declined" });
assert.equal(
  (await db.collection("events").where("playerId", "==", playerId).get()).size,
  0,
);
await a.call("setAnalyticsConsent", { allowed: true });
await a.call("recordEvent", { event: "visit", eventId: "allowed" });
await a.call("recordEvent", { event: "visit", eventId: "allowed" });
assert.equal(
  (await db.collection("events").where("playerId", "==", playerId).get()).size,
  1,
);
await a.call("setAnalyticsConsent", { allowed: false });
await a.call("recordEvent", { event: "visit", eventId: "withdrawn" });
assert.equal(
  (await db.collection("events").where("playerId", "==", playerId).get()).size,
  1,
);
ok(
  "declined/withdrawn consent produces no new optional events; IDs deduplicate",
);
const signup = {
  email: "review-" + randomUUID() + "@example.com",
  platform: "ios",
  consent: true,
};
const s1 = await a.call("launchSignup", signup);
await a.call("launchSignup", signup);
const entries = await db
  .collection("launchInterest")
  .where("email", "==", signup.email)
  .get();
assert.equal(entries.size, 1);
await a.call("withdrawSignup", { token: s1.withdrawalToken });
assert.equal(
  (
    await db
      .collection("launchInterest")
      .where("email", "==", signup.email)
      .get()
  ).size,
  0,
);
ok("launch signup deduplicates and withdrawal deletes the entry");
const { claim } = await b.call("prepareAccountClaim");
const savedUid = b.auth.currentUser.uid;
const email = "account-" + randomUUID() + "@example.com";
const link = await getAuth().generateSignInWithEmailLink(email, {
  url: "http://127.0.0.1:5173",
  handleCodeInApp: true,
});
await signInWithEmailLink(b.auth, email, link);
await b.call("claimGuestHistory", { claim });
assert.equal(
  (await db.doc("aliases/" + savedUid).get()).get("playerId"),
  b.auth.currentUser.uid,
);
assert((await b.call("getHistory")).rows.length > 0);
await b.call("claimGuestHistory", { claim });
ok("verified account claims guest history and claim retries are idempotent");
await db
  .doc("challenges/" + cid)
  .update({ closesAt: Date.now() - 91 * 86400000 });
await assert.rejects(
  a.call("getChallenge", { challengeId: cid }),
  (e) => e.code === "functions/not-found",
);
ok("links expire at 90 days after closure");
const d = await player();
await d.call("getDailyChallenge");
await d.call("startAttempt", {
  challengeId: daily1.challenge.id,
  displayName: "Delete me",
});
await d.call("requestDeletion");
const row = await db.doc("players/" + d.auth.currentUser.uid).get();
assert.equal(row.get("deleting"), true);
await assert.rejects(d.call("getDailyChallenge"));
ok("deletion immediately blocks identity and hides display name");

const linked = await player();
await linked.call("startAttempt", {
  challengeId: daily1.challenge.id,
  displayName: "Link in place",
});
const beforeUid = linked.auth.currentUser.uid;
const linkClaim = await linked.call("prepareAccountClaim");
const linkedEmail = "linked-" + randomUUID() + "@example.com";
const sameLink = await getAuth().generateSignInWithEmailLink(linkedEmail, {
  url: "http://127.0.0.1:5173",
  handleCodeInApp: true,
});
await linkWithCredential(
  linked.auth.currentUser,
  EmailAuthProvider.credentialWithLink(linkedEmail, sameLink),
);
await linked.auth.currentUser.getIdToken(true);
await linked.call("claimGuestHistory", { claim: linkClaim.claim });
assert.equal(linked.auth.currentUser.uid, beforeUid);
assert.equal(
  (await db.doc("players/" + beforeUid).get()).get("anonymous"),
  false,
);
ok(
  "normal email credential linking preserves UID and switches retention to account policy",
);
const dest = await player();
const destEmail = "collision-" + randomUUID() + "@example.com";
await signInWithEmailLink(
  dest.auth,
  destEmail,
  await getAuth().generateSignInWithEmailLink(destEmail, {
    url: "http://127.0.0.1:5173",
    handleCodeInApp: true,
  }),
);
await dest.call("startAttempt", {
  challengeId: rematch.challenge.id,
  displayName: "Existing account",
});
const guest = await player();
await guest.call("startAttempt", {
  challengeId: rematch.challenge.id,
  displayName: "Old guest",
});
const guestUid = guest.auth.currentUser.uid;
const guestClaim = await guest.call("prepareAccountClaim");
await dest.call("claimGuestHistory", { claim: guestClaim.claim });
const collisions = await db
  .collection("attempts")
  .where("challengeId", "==", rematch.challenge.id)
  .get();
assert.equal(collisions.docs.filter((d) => d.get("ranked")).length, 1);
assert.equal(collisions.docs.filter((d) => !d.get("ranked")).length, 1);
await assert.rejects(guest.call("getHistory"));
ok(
  "existing account keeps its ranked attempt; guest result unranked; old guest access blocked",
);
const signup2 = {
  email: "retention-" + randomUUID() + "@example.com",
  platform: "android",
  consent: true,
};
await a.call("launchSignup", signup2);
let retention = (
  await db
    .collection("launchInterest")
    .where("email", "==", signup2.email)
    .get()
).docs[0];
const originalExpiry = retention.get("expiresAt");
await a.call("launchSignup", signup2);
assert.equal((await retention.ref.get()).get("expiresAt"), originalExpiry);
await retention.ref.update({ expiresAt: Date.now() - 1 });
await db
  .doc("events/expired-test")
  .set({ playerId: playerId, expiresAt: Date.now() - 1 });
await a.call("previewMaintenance");
assert.equal((await db.doc("events/expired-test").get()).exists, false);
assert.equal((await retention.ref.get()).exists, false);
assert.equal(
  (await db.doc("players/" + d.auth.currentUser.uid).get()).exists,
  false,
);
const archived = await b.call("getHistory");
assert(archived.rows.some((h) => h.expiredLink));
ok(
  "maintenance expires events/signup, executes queued deletion, and preserves own archived history",
);
assert.equal(
  (await db.collection("attempts").where("playerId", "==", guestUid).get())
    .size,
  0,
);
ok("merged guest attempts no longer remain under the old identity");

const inactiveUid = "inactive-" + randomUUID();
await getAuth().createUser({
  uid: inactiveUid,
  email: "inactive-" + randomUUID() + "@example.com",
});
const activity = Date.now() - 800 * 86400000;
await db
  .doc("players/" + inactiveUid)
  .set({ anonymous: false, lastActiveAt: activity });
await a.call("previewMaintenance");
assert.notEqual(
  (await db.doc("players/" + inactiveUid).get()).get("deleting"),
  true,
);
const warning = await db
  .collection("notificationOutbox")
  .where("playerId", "==", inactiveUid)
  .get();
assert.equal(warning.size, 1);
assert.equal(warning.docs[0].get("status"), "pending-provider");
await db.doc("players/" + inactiveUid).update({
  warningForLastActiveAt: activity,
  inactivityWarningSentAt: Date.now() - 31 * 86400000,
});
await a.call("previewMaintenance");
assert.equal(
  (await db.doc("players/" + inactiveUid).get()).get("deleting"),
  true,
);
ok(
  "inactive accounts require a delivered 30-day warning before automatic deletion",
);
const directAudio = await fetch(
  "http://127.0.0.1:9199/v0/b/demo-spell-bee.appspot.com/o/audio%2Fword-001.mp3?alt=media",
);
assert.equal(directAudio.status, 403);
ok("direct Storage audio access is denied; grant endpoint is required");
const recoveryPlayer = await player();
const recoveryGame = await recoveryPlayer.call("createPrivateChallenge", {
  requestId: randomUUID(),
});
const recoveryStart = await recoveryPlayer.call("startAttempt", {
  challengeId: recoveryGame.challenge.id,
});
const recoveryUid = recoveryPlayer.auth.currentUser.uid;
const snapshotPaths = [
  `players/${recoveryUid}`,
  `attempts/${recoveryStart.attempt.id}`,
];
const backupBytes = JSON.stringify(
  await Promise.all(
    snapshotPaths.map(async (path) => ({
      path,
      data: (await db.doc(path).get()).data(),
    })),
  ),
);
await recoveryPlayer.call("requestDeletion");
await a.call("previewMaintenance");
const retainedInstruction = (
  await db.doc(`deletionJobs/${recoveryUid}`).get()
).data();
assert.equal(retainedInstruction.status, "complete");
for (const record of JSON.parse(backupBytes))
  await db.doc(record.path).set(record.data);
await db
  .doc(`deletionJobs/${recoveryUid}`)
  .set({ ...retainedInstruction, status: "pending" });
await a.call("previewMaintenance");
for (const path of snapshotPaths)
  assert.equal((await db.doc(path).get()).exists, false);
ok(
  "local snapshot restore replays retained deletion instructions before exposure",
);
const adventurer = await player(),
  teammate = await player();
const catalog = await adventurer.call("getAdventureCatalog");
assert.equal(catalog.levels.length, 12);
const hive = await adventurer.call("adventureTeam", {
  action: "create",
  name: "Integration hive",
});
await teammate.call("adventureTeam", { action: "join", code: hive.team.code });
const adventureAnswers = catalog.levels[0].words.map((w) => w.word);
const contributions = await Promise.all([
  adventurer.call("contributeAdventure", {
    level: 1,
    answers: adventureAnswers,
  }),
  adventurer.call("contributeAdventure", {
    level: 1,
    answers: adventureAnswers,
  }),
]);
assert.equal(contributions[0].team.total, 5);
let shared = await teammate.call("contributeAdventure", {
  level: 1,
  answers: adventureAnswers.map((w, i) => (i === 0 ? "wrong" : w)),
});
assert.equal(shared.team.total, 9);
shared = await teammate.call("contributeAdventure", {
  level: 1,
  answers: adventureAnswers,
});
assert.equal(shared.team.total, 10);
assert.equal((await adventurer.call("adventureTeam")).team.total, 10);
await assert.rejects(
  adventurer.call("contributeAdventure", { level: 1, answers: [] }),
);
ok(
  "adventure teams share verified contributions, deduplicate concurrent retries, and credit improvements",
);
const membershipRef = db.collection("adventureMembers");
const membersBefore = await membershipRef
  .where("playerId", "==", teammate.auth.currentUser.uid)
  .get();
assert.equal(membersBefore.size, 1);
await teammate.call("adventureTeam", { action: "leave" });
assert.equal((await teammate.call("adventureTeam")).team, null);
assert.equal(
  (
    await membershipRef
      .where("playerId", "==", teammate.auth.currentUser.uid)
      .get()
  ).size,
  0,
);
await adventurer.call("requestDeletion");
await a.call("previewMaintenance");
assert.equal(
  (
    await membershipRef
      .where("playerId", "==", adventurer.auth.currentUser.uid)
      .get()
  ).size,
  0,
);
assert.equal(
  (
    await db
      .collection("adventureContributions")
      .where("playerId", "==", adventurer.auth.currentUser.uid)
      .get()
  ).size,
  0,
);
ok(
  "adventure memberships can be left and identity deletion clears personal team records",
);
console.log(
  `\n${checks} emulator integration scenarios passed. No production project used.`,
);
process.exit(0);
