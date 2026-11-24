import {
  adventureWorlds,
  adventureLevels,
  weekStart,
  correctAdventurePositions,
} from "./adventure";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, DocumentReference } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import {
  onCall,
  onRequest,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  DAY,
  CHALLENGE_LIFETIME,
  normalizeAnswer,
  scoreAnswers,
  dailyWindow,
  rankScores,
  addMonths,
} from "./domain";

import {
  isEmulator,
  projectId,
  storageBucket,
  appOrigin,
  requirePreview,
} from "./runtime";
initializeApp({ projectId, storageBucket });
const db = getFirestore();
const options = {
  region: "us-central1",
  serviceAccount: isEmulator
    ? undefined
    : "spellbee-runtime@spell-bee-c218a.iam.gserviceaccount.com",
  maxInstances: 2,
  concurrency: 20,
  enforceAppCheck: !isEmulator,
  minInstances: 0,
  memory: "256MiB" as const,
  timeoutSeconds: 30,
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(24).toString("hex");
const fail = (
  code: ConstructorParameters<typeof HttpsError>[0],
  message: string,
): never => {
  throw new HttpsError(code, message);
};
const text = (v: unknown, name: string, max = 100) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(
      "invalid-argument",
      `${name} is required (maximum ${max} characters).`,
    );
  return (v as string).trim();
};
const id = (v: unknown) => {
  const s = text(v, "Challenge", 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(s))
    fail("invalid-argument", "Invalid challenge link.");
  return s;
};
type Data = Record<string, any>;
async function caller(req: CallableRequest) {
  if (!req.auth)
    fail("unauthenticated", "Please reconnect to your game session.");
  const uid = req.auth!.uid;
  const snap = await db.doc(`players/${uid}`).get();
  if (snap.get("deleting"))
    fail("permission-denied", "This identity is being deleted.");
  const alias = await db.doc(`aliases/${uid}`).get();
  if (alias.exists)
    fail(
      "permission-denied",
      "This guest history is saved to an account. Please sign in to that account.",
    );
  return {
    uid,
    playerId: alias.get("playerId") || uid,
    anonymous: req.auth!.token.firebase?.sign_in_provider === "anonymous",
  };
}
async function limit(uid: string, op: string, max: number) {
  const ref = db.doc(
    `limits/${hash(uid + op + Math.floor(Date.now() / 3_600_000))}`,
  );
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if ((s.get("count") || 0) >= max)
      fail("resource-exhausted", "Please take a break and try again later.");
    tx.set(ref, {
      count: (s.get("count") || 0) + 1,
      expiresAt: Date.now() + 2 * DAY,
    });
  });
}
async function challenge(challengeId: string): Promise<Data> {
  const s = await db.doc(`challenges/${id(challengeId)}`).get();
  if (!s.exists) fail("not-found", "We couldn’t find that challenge.");
  const c = s.data()!;
  if (Date.now() >= c.closesAt + CHALLENGE_LIFETIME)
    fail(
      "not-found",
      "This challenge has expired. Challenge links last 90 days after closure.",
    );
  return { ...c, id: s.id };
}
const attemptRef = (challengeId: string, playerId: string) =>
  db.doc(`attempts/${hash(challengeId + ":" + playerId)}`);
async function wordsFor(c: Data) {
  const s = await db.doc(`challengeSecrets/${c.id}`).get();
  if (!s.exists) fail("unavailable", "This challenge is not ready yet.");
  const ids = s.get("wordIds") as string[];
  const snaps = await db.getAll(...ids.map((id) => db.doc(`words/${id}`)));
  if (snaps.some((s) => !s.exists))
    fail("unavailable", "A word is temporarily unavailable.");
  return snaps.map((s) => s.data()!);
}
async function finalizeExpired(ref: DocumentReference, c: Data) {
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.exists && s.get("status") === "active" && Date.now() >= c.closesAt)
      tx.update(ref, {
        status: "expired",
        score: scoreAnswers(s.get("answers") || []),
        updatedAt: Date.now(),
      });
  });
}
function safeChallenge(c: Data) {
  return {
    id: c.id,
    kind: c.kind,
    closesAt: c.closesAt,
    opensAt: c.opensAt,
    expiresAt: c.closesAt + CHALLENGE_LIFETIME,
    wordCount: 5,
    date: c.date || null,
  };
}
async function state(c: Data, playerId: string) {
  const ref = attemptRef(c.id, playerId);
  await finalizeExpired(ref, c);
  const s = await ref.get();
  if (!s.exists) return { challenge: safeChallenge(c), attempt: null };
  const a = s.data()!;
  const result: Data = {
    challenge: safeChallenge(c),
    attempt: {
      id: s.id,
      status: a.status,
      position: a.answers.length,
      displayName: a.displayName,
      completedAt: a.completedAt || null,
    },
  };
  if (
    a.status !== "active" &&
    (c.kind !== "private" || Date.now() >= c.closesAt)
  ) {
    const words = await wordsFor(c);
    result.results = {
      score: a.score,
      total: 5,
      partial: a.status === "expired",
      items: words.map((w, i) => ({
        word: w.word,
        definition: w.definition,
        note: w.note,
        submitted: a.answers[i]?.text ?? null,
        correct: a.answers[i]?.correct ?? false,
      })),
    };
  }
  return result;
}
async function saveEvent(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  eventId: string,
  event: string,
  properties: Data = {},
) {
  const p = await tx.get(db.doc(`players/${uid}`));
  if (p.get("analyticsConsent") === true) {
    const safe = { ...properties };
    if (safe.inviter) {
      const inviter = await tx.get(db.doc(`players/${safe.inviter}`));
      safe.inviter =
        inviter.get("analyticsConsent") === true ? hash(safe.inviter) : null;
    }
    const payload = {
      playerId: uid,
      event,
      properties: safe,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * DAY,
    };
    tx.set(db.doc(`events/${hash(eventId)}`), payload);
    if (event === "word_submitted" && properties.completed)
      tx.set(db.doc(`events/${hash(eventId + ":complete")}`), {
        ...payload,
        event: "attempt_completed",
      });
  }
}
async function createChallenge(
  kind: "daily" | "private",
  owner: string,
  requestId: string,
  exclude: string[] = [],
) {
  const now = Date.now(),
    day = dailyWindow(now);
  const challengeId =
    kind === "daily"
      ? `daily-${day.date}`
      : hash(owner + ":" + requestId).slice(0, 40);
  const ref = db.doc(`challenges/${challengeId}`);
  const all = (await db.collection("words").get()).docs.map((d) => d.id);
  const pool = all.filter((w) => !exclude.includes(w));
  const candidates = pool.length >= 5 ? pool : all;
  if (candidates.length < 5)
    fail("unavailable", "The word bank is temporarily unavailable.");
  const selected: string[] = [];
  while (selected.length < 5)
    selected.push(candidates.splice(randomInt(candidates.length), 1)[0]);
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists) return;
    await saveEvent(tx, owner, "create:" + challengeId, "challenge_created", {
      kind,
    });
    tx.create(ref, {
      kind,
      creatorId: owner,
      opensAt: kind === "daily" ? day.opensAt : now,
      closesAt: kind === "daily" ? day.closesAt : now + DAY,
      date: kind === "daily" ? day.date : null,
      createdAt: now,
    });
    tx.create(db.doc(`challengeSecrets/${challengeId}`), {
      wordIds: selected,
      version: 1,
    });
  });
  return challenge(challengeId);
}

export const getDailyChallenge = onCall(options, async (req) => {
  const p = await caller(req);
  const c = await createChallenge("daily", p.playerId, "daily");
  return state(c, p.playerId);
});
export const createPrivateChallenge = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "create", 20);
  const key = text(req.data?.requestId, "Request ID", 80);
  const c = await createChallenge("private", p.playerId, key);
  return state(c, p.playerId);
});
export const createRematch = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "create", 20);
  const previous = await challenge(req.data?.challengeId);
  const secret = await db.doc(`challengeSecrets/${previous.id}`).get();
  const c = await createChallenge(
    "private",
    p.playerId,
    text(req.data?.requestId, "Request ID", 80),
    secret.get("wordIds"),
  );
  return state(c, p.playerId);
});
export const getChallenge = onCall(options, async (req) => {
  const p = await caller(req);
  return state(await challenge(req.data?.challengeId), p.playerId);
});
export const startAttempt = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "start", 60);
  const c = await challenge(req.data?.challengeId);
  const name =
    req.data?.displayName == null || req.data.displayName === ""
      ? "Guest"
      : text(req.data.displayName, "Display name", 30);
  const ref = attemptRef(c.id, p.playerId);
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists) return;
    const profile = await tx.get(db.doc(`players/${p.playerId}`));
    if (profile.get("deleting"))
      fail("permission-denied", "This identity is being deleted.");
    if (Date.now() >= c.closesAt)
      fail("failed-precondition", "This challenge has closed.");
    await saveEvent(tx, p.playerId, "start:" + ref.id, "attempt_started", {
      kind: c.kind,
      inviter:
        c.kind === "private" && c.creatorId !== p.playerId ? c.creatorId : null,
    });
    tx.set(
      db.doc(`players/${p.playerId}`),
      {
        displayName: name,
        anonymous: p.anonymous,
        lastActiveAt: Date.now(),
        createdAt: profile.get("createdAt") || Date.now(),
        firstPlayedAt: profile.get("firstPlayedAt") || Date.now(),
      },
      { merge: true },
    );
    tx.create(ref, {
      playerId: p.playerId,
      challengeId: c.id,
      displayName: name,
      status: "active",
      answers: [],
      score: 0,
      ranked: true,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      scoreVersion: 1,
    });
  });
  return state(c, p.playerId);
});
export const setAttemptName = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "name", 30);
  const c = await challenge(req.data?.challengeId);
  const name = text(req.data?.displayName, "Display name", 30);
  const ref = attemptRef(c.id, p.playerId);
  await db.runTransaction(async (tx) => {
    const attempt = await tx.get(ref);
    const profile = await tx.get(db.doc(`players/${p.playerId}`));
    if (profile.get("deleting"))
      fail("permission-denied", "This identity is being deleted.");
    if (!attempt.exists || attempt.get("status") === "active")
      fail(
        "failed-precondition",
        "Finish your challenge before saving your name.",
      );
    tx.update(ref, { displayName: name });
    tx.set(
      db.doc(`players/${p.playerId}`),
      { displayName: name },
      { merge: true },
    );
  });
  return state(c, p.playerId);
});
export const getPrompt = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "audio", 300);
  const c = await challenge(req.data?.challengeId);
  const a = await attemptRef(c.id, p.playerId).get();
  if (!a.exists || a.get("status") !== "active" || Date.now() >= c.closesAt)
    fail("failed-precondition", "This attempt is not active.");
  const words = await wordsFor(c);
  const position = a.get("answers").length;
  const grant = token();
  await db.doc(`audioGrants/${hash(grant)}`).set({
    path: words[position].audio,
    expiresAt: Math.min(c.closesAt, Date.now() + 5 * 60_000),
  });
  return {
    position,
    definition: words[position].definition,
    audioUrl: isEmulator
      ? `http://127.0.0.1:5001/demo-spell-bee/us-central1/audio?grant=${grant}`
      : `${appOrigin}/api/audio?grant=${grant}`,
  };
});
export const audio = onRequest(
  {
    region: "us-central1",
    maxInstances: 2,
    serviceAccount: isEmulator
      ? undefined
      : "spellbee-runtime@spell-bee-c218a.iam.gserviceaccount.com",
  },
  async (req, res) => {
    const grant = typeof req.query.grant === "string" ? req.query.grant : "";
    if (!/^[a-f0-9]{48}$/.test(grant)) {
      res.status(403).end();
      return;
    }
    const g = await db.doc(`audioGrants/${hash(grant)}`).get();
    if (!g.exists || g.get("expiresAt") <= Date.now()) {
      res.status(403).end();
      return;
    }
    try {
      const [bytes] = await getStorage()
        .bucket()
        .file(g.get("path"))
        .download();
      res
        .set({
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, no-store",
          "Access-Control-Allow-Origin": appOrigin,
        })
        .send(bytes);
    } catch {
      res.status(503).send("Audio temporarily unavailable.");
    }
  },
);
export const submitAnswer = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "answer", 300);
  const c = await challenge(req.data?.challengeId),
    words = await wordsFor(c);
  const position = req.data?.position;
  if (!Number.isInteger(position) || position < 0 || position > 4)
    fail("invalid-argument", "Invalid word position.");
  const value = text(req.data?.answer, "Answer", 100);
  const ref = attemptRef(c.id, p.playerId);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) fail("failed-precondition", "Start the challenge first.");
    const deletion = await tx.get(db.doc(`players/${p.playerId}`));
    if (deletion.get("deleting"))
      fail("permission-denied", "This identity is being deleted.");
    const a = s.data()!,
      answers = a.answers as Data[];
    if (answers[position]) {
      if (normalizeAnswer(answers[position].text) !== normalizeAnswer(value))
        fail("already-exists", "This answer is already locked.");
      return;
    }
    if (a.status !== "active" || Date.now() >= c.closesAt)
      fail("failed-precondition", "This challenge has closed.");
    if (position !== answers.length)
      fail("failed-precondition", "Please answer the current word.");
    const correct = words[position].accepted.some(
      (v: string) => normalizeAnswer(v) === normalizeAnswer(value),
    );
    const next = [...answers, { text: value, correct, receivedAt: Date.now() }];
    const complete = next.length === 5;
    await saveEvent(
      tx,
      p.playerId,
      `answer:${ref.id}:${position}`,
      "word_submitted",
      {
        kind: c.kind,
        position: position + 1,
        completed: complete,
      },
    );
    tx.update(ref, {
      answers: next,
      score: scoreAnswers(next as { correct: boolean }[]),
      status: complete ? "completed" : "active",
      ...(complete ? { completedAt: Date.now() } : {}),
      updatedAt: Date.now(),
    });
    tx.set(
      db.doc(`players/${p.playerId}`),
      { lastActiveAt: Date.now() },
      { merge: true },
    );
  });
  return state(c, p.playerId);
});
export const getStandings = onCall(options, async (req) => {
  const p = await caller(req);
  const c = await challenge(req.data?.challengeId);
  if (Date.now() < c.closesAt) return { closed: false, rows: [] };
  const snaps = await db
    .collection("attempts")
    .where("challengeId", "==", c.id)
    .where("ranked", "==", true)
    .orderBy("score", "desc")
    .limit(100)
    .get();
  const rows = snaps.docs.map((s) => ({
    displayName: s.get("displayName"),
    isYou: s.get("playerId") === p.playerId,
    rivalId: hash("rival:" + p.playerId + ":" + s.get("playerId")),
    score: s.get("score"),
    partial: s.get("status") !== "completed",
  }));
  return { closed: true, rows: rankScores(rows), limit: 100 };
});

// Adventure words and hints are intentionally public and separate from ranked play.
export const getAdventureCatalog = onCall(options, async (req) => {
  await caller(req);
  return {
    worlds: adventureWorlds.map(({ levels: _levels, ...world }) => world),
    levels: adventureLevels,
  };
});
const teamMemberRef = (playerId: string) =>
  db.doc(`adventureMembers/${hash(playerId)}`);
async function readTeam(playerId: string) {
  const membership = await teamMemberRef(playerId).get();
  if (!membership.exists) return null;
  const team = await db.doc(`adventureTeams/${membership.get("teamId")}`).get();
  if (!team.exists || team.get("expiresAt") <= Date.now()) return null;
  const week = weekStart();
  return {
    code: team.id,
    name: team.get("name"),
    week,
    total: team.get("week") === week ? team.get("total") : 0,
    goal: 100,
    resetsAt: Date.parse(week + "T00:00:00Z") + 7 * DAY,
  };
}
export const adventureTeam = onCall(options, async (req) => {
  const p = await caller(req);
  const action = req.data?.action || "get";
  if (action === "create") {
    await limit(p.playerId, "team-create", 10);
    const name = text(req.data?.name, "Team name", 30);
    const ref = db.collection("adventureTeams").doc(token().slice(0, 12));
    const batch = db.batch();
    batch.set(ref, {
      name,
      week: weekStart(),
      total: 0,
      expiresAt: Date.now() + 90 * DAY,
    });
    batch.set(teamMemberRef(p.playerId), {
      playerId: p.playerId,
      teamId: ref.id,
      expiresAt: Date.now() + 90 * DAY,
    });
    await batch.commit();
  } else if (action === "join") {
    await limit(p.playerId, "team-join", 30);
    const code = id(req.data?.code);
    const team = await db.doc(`adventureTeams/${code}`).get();
    if (!team.exists || team.get("expiresAt") <= Date.now())
      fail("not-found", "That team link has expired or does not exist.");
    await teamMemberRef(p.playerId).set({
      playerId: p.playerId,
      teamId: code,
      expiresAt: team.get("expiresAt"),
    });
  } else if (action === "leave") {
    await teamMemberRef(p.playerId).delete();
  } else if (action !== "get")
    fail("invalid-argument", "Choose a team action.");
  return { team: await readTeam(p.playerId) };
});
export const contributeAdventure = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "adventure-contribution", 240);
  let positions: number[];
  try {
    positions = correctAdventurePositions(req.data?.level, req.data?.answers);
  } catch {
    return fail(
      "invalid-argument",
      "Finish a valid five-word adventure level first.",
    );
  }
  const week = weekStart();
  await db.runTransaction(async (tx) => {
    const member = await tx.get(teamMemberRef(p.playerId));
    if (!member.exists) return;
    const teamRef = db.doc(`adventureTeams/${member.get("teamId")}`);
    const team = await tx.get(teamRef);
    if (!team.exists || team.get("expiresAt") <= Date.now()) return;
    const contributionRef = db.doc(
      `adventureContributions/${hash(team.id + ":" + week + ":" + p.playerId + ":" + req.data.level)}`,
    );
    const previous = await tx.get(contributionRef);
    const old: number[] = previous.get("positions") || [];
    const merged = [...new Set([...old, ...positions])];
    tx.set(contributionRef, {
      playerId: p.playerId,
      positions: merged,
      expiresAt: Date.parse(week + "T00:00:00Z") + 14 * DAY,
    });
    tx.update(teamRef, {
      week,
      total:
        (team.get("week") === week ? team.get("total") : 0) +
        merged.length -
        old.length,
    });
  });
  return { team: await readTeam(p.playerId) };
});

export const getHistory = onCall(options, async (req) => {
  const p = await caller(req);
  const snaps = await db
    .collection("attempts")
    .where("playerId", "==", p.playerId)
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  const rows = [];
  for (const s of snaps.docs) {
    const a = s.data();
    const c = await db.doc(`challenges/${a.challengeId}`).get();
    if (!c.exists) continue;
    await finalizeExpired(s.ref, { ...c.data(), id: c.id });
    const fresh = (await s.ref.get()).data()!;
    rows.push({
      challengeId: a.challengeId,
      kind: c.get("kind"),
      score:
        fresh.status === "active" ||
        (c.get("kind") === "private" && Date.now() < c.get("closesAt"))
          ? null
          : fresh.score,
      status: fresh.status,
      startedAt: a.startedAt,
      expiredLink: Date.now() >= c.get("closesAt") + CHALLENGE_LIFETIME,
      ranked: a.ranked,
    });
  }
  const archived = await db
    .collection("history")
    .where("playerId", "==", p.playerId)
    .limit(50)
    .get();
  for (const h of archived.docs)
    rows.push({
      challengeId: null,
      kind: h.get("kind"),
      score: h.get("score"),
      status: h.get("partial") ? "expired" : "completed",
      startedAt: h.get("startedAt"),
      expiredLink: true,
      ranked: false,
    });
  return { rows: rows.sort((a, b) => b.startedAt - a.startedAt).slice(0, 50) };
});
export const setAnalyticsConsent = onCall(options, async (req) => {
  const p = await caller(req);
  if (typeof req.data?.allowed !== "boolean")
    fail("invalid-argument", "Choose allow or decline.");
  await db.doc(`players/${p.playerId}`).set(
    {
      analyticsConsent: req.data.allowed,
      consentAt: Date.now(),
      consentVersion: 1,
    },
    { merge: true },
  );
  return { allowed: req.data.allowed };
});
export const recordEvent = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "events", 120);
  const allowed = [
    "visit",
    "challenge_viewed",
    "share_initiated",
    "link_copied",
    "mobile_interest_clicked",
  ];
  if (!allowed.includes(req.data?.event))
    fail("invalid-argument", "Invalid event.");
  const eventId = text(req.data?.eventId, "Event ID", 80);
  await db.runTransaction((tx) =>
    saveEvent(tx, p.playerId, p.playerId + ":" + eventId, req.data.event, {
      platform: ["ios", "android"].includes(req.data?.platform)
        ? req.data.platform
        : null,
    }),
  );
  return { ok: true };
});
export const launchSignup = onCall(options, async (req) => {
  const p = await caller(req);
  await limit(p.playerId, "signup", 10);
  const email = text(req.data?.email, "Email", 254).toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["ios", "android"].includes(req.data?.platform) ||
    req.data?.consent !== true
  )
    fail(
      "invalid-argument",
      "Enter a valid email and explicitly request a launch notification.",
    );
  const platform = req.data.platform;
  const ref = db.doc(`launchInterest/${hash(email + ":" + platform)}`);
  const withdrawalToken = token();
  const withdrawalRef = db.doc(`withdrawalTokens/${hash(withdrawalToken)}`);
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (!old.exists)
      tx.create(ref, {
        email,
        platform,
        consentAt: Date.now(),
        noticeVersion: 1,
        expiresAt: addMonths(Date.now(), 12),
        status: "subscribed",
      });
    tx.create(withdrawalRef, {
      signupId: ref.id,
      playerId: p.playerId,
      createdAt: Date.now(),
      expiresAt: old.exists ? old.get("expiresAt") : addMonths(Date.now(), 12),
    });
  });
  return { ok: true, withdrawalToken };
});
export const withdrawSignup = onCall(options, async (req) => {
  await caller(req);
  const value = text(req.data?.token, "Withdrawal token", 100);
  const ref = db.doc(`withdrawalTokens/${hash(value)}`);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return;
    const tokens = await tx.get(
      db
        .collection("withdrawalTokens")
        .where("signupId", "==", s.get("signupId")),
    );
    tx.delete(db.doc(`launchInterest/${s.get("signupId")}`));
    for (const t of tokens.docs) tx.delete(t.ref);
  });
  return { ok: true };
});
export const prepareAccountClaim = onCall(options, async (req) => {
  const p = await caller(req);
  const value = token();
  await db
    .doc(`claims/${hash(value)}`)
    .set({ guestUid: p.playerId, expiresAt: Date.now() + 10 * 60_000 });
  return { claim: value };
});
export const claimGuestHistory = onCall(options, async (req) => {
  const p = await caller(req);
  if (p.anonymous || !req.auth?.token.email_verified)
    fail("permission-denied", "Complete verified email sign-in first.");
  const claimRef = db.doc(
    `claims/${hash(text(req.data?.claim, "Account claim", 100))}`,
  );
  await db.runTransaction(async (tx) => {
    const claim = await tx.get(claimRef);
    if (!claim.exists) fail("not-found", "This claim is unavailable.");
    if (claim.get("usedBy") === p.uid) return;
    if (claim.get("usedBy") || claim.get("expiresAt") < Date.now())
      fail("permission-denied", "This claim has expired.");
    const guest = claim.get("guestUid");
    if (guest === p.uid) {
      tx.set(
        db.doc(`players/${p.uid}`),
        { anonymous: false, lastActiveAt: Date.now() },
        { merge: true },
      );
      tx.update(claimRef, { usedBy: p.uid });
      return;
    }
    const aliasRef = db.doc(`aliases/${guest}`);
    const alias = await tx.get(aliasRef);
    const guestProfile = await tx.get(db.doc(`players/${guest}`));
    if (guestProfile.get("deleting"))
      fail("permission-denied", "This guest identity is being deleted.");
    if (alias.exists && alias.get("playerId") !== p.uid)
      fail("permission-denied", "Guest history has already been claimed.");
    const snaps = await tx.get(
      db.collection("attempts").where("playerId", "==", guest).limit(101),
    );
    if (snaps.size > 100)
      fail(
        "resource-exhausted",
        "Contact support to link this much guest history.",
      );
    const targets = snaps.docs.map((s) =>
      attemptRef(s.get("challengeId"), p.uid),
    );
    const destinations = targets.length ? await tx.getAll(...targets) : [];
    for (let i = 0; i < snaps.size; i++) {
      const source = snaps.docs[i];
      if (destinations[i].exists) {
        tx.update(source.ref, {
          playerId: p.uid,
          ranked: false,
          claimedAt: Date.now(),
        });
      } else {
        tx.set(targets[i], {
          ...source.data(),
          playerId: p.uid,
          claimedAt: Date.now(),
        });
        tx.delete(source.ref);
      }
    }
    tx.set(aliasRef, { playerId: p.uid });
    tx.set(
      db.doc(`players/${p.uid}`),
      { anonymous: false, lastActiveAt: Date.now() },
      { merge: true },
    );
    tx.update(claimRef, { usedBy: p.uid });
  });
  return { ok: true };
});
export const requestDeletion = onCall(options, async (req) => {
  const p = await caller(req);
  if (
    !p.anonymous &&
    Date.now() / 1000 - (req.auth?.token.auth_time || 0) > 300
  )
    fail(
      "failed-precondition",
      "Please sign in again before deleting your account.",
    );
  await db
    .doc(`players/${p.playerId}`)
    .set({ deleting: true, displayName: "Deleted player" }, { merge: true });
  const attempts = await db
    .collection("attempts")
    .where("playerId", "==", p.playerId)
    .get();
  const batch = db.batch();
  attempts.docs.forEach((a) =>
    batch.update(a.ref, { displayName: "Deleted player" }),
  );
  batch.set(db.doc(`deletionJobs/${p.playerId}`), {
    playerId: p.playerId,
    requestedAt: Date.now(),
    deadline: Date.now() + 7 * DAY,
    status: "pending",
  });
  await batch.commit();
  await getAuth().updateUser(p.uid, { disabled: true });
  await getAuth().revokeRefreshTokens(p.uid);
  return { ok: true };
});
// Emulator-only preview control makes closed standings reviewable without waiting 24 hours.
export const previewClose = isEmulator
  ? onCall(options, async (req) => {
      requirePreview();
      await caller(req);
      const c = await challenge(req.data?.challengeId);
      await db.doc(`challenges/${c.id}`).update({ closesAt: Date.now() - 1 });
      return { ok: true };
    })
  : undefined;

async function deleteIdentity(playerId: string) {
  const aliases = await db
    .collection("aliases")
    .where("playerId", "==", playerId)
    .get();
  const identities = [playerId, ...aliases.docs.map((a) => a.id)];
  for (const uid of identities) {
    const profile = await db.doc(`players/${uid}`).get();
    if (profile.get("analyticsConsent") === true || profile.get("consentAt"))
      await db.doc(`analyticsDeletionJobs/${hash(uid)}`).set(
        {
          analyticsUserId: hash(uid),
          requestedAt: Date.now(),
          status: "pending-provider",
          provider: "GA4",
        },
        { merge: true },
      );
    for (const collection of [
      "attempts",
      "history",
      "events",
      "notificationOutbox",
      "adventureMembers",
      "adventureContributions",
    ]) {
      const rows = await db
        .collection(collection)
        .where("playerId", "==", uid)
        .get();
      for (const row of rows.docs) await db.recursiveDelete(row.ref);
    }
    const claims = await db
      .collection("claims")
      .where("guestUid", "==", uid)
      .get();
    for (const c of claims.docs) await c.ref.delete();
    await db.doc(`players/${uid}`).delete();
    await db.doc(`aliases/${uid}`).delete();
    await getAuth()
      .deleteUser(uid)
      .catch((e) => {
        if (e.code !== "auth/user-not-found") throw e;
      });
  }
}
export async function maintenance(now = Date.now()) {
  const jobs = await db
    .collection("deletionJobs")
    .where("status", "==", "pending")
    .limit(50)
    .get();
  for (const job of jobs.docs) {
    await deleteIdentity(job.get("playerId"));
    await job.ref.update({
      status: "complete",
      completedAt: now,
      expiresAt: now + 7 * DAY,
    });
  }
  const players = await db.collection("players").get();
  for (const p of players.docs) {
    const data = p.data();
    if (!data.lastActiveAt || data.deleting) continue;
    const expiry = data.anonymous
      ? data.lastActiveAt + 90 * DAY
      : addMonths(data.lastActiveAt, 24);
    const warnedForThisActivity =
      data.warningForLastActiveAt === data.lastActiveAt &&
      typeof data.inactivityWarningSentAt === "number";
    const canDelete = data.anonymous
      ? expiry <= now
      : warnedForThisActivity &&
        Math.max(expiry, data.inactivityWarningSentAt + 30 * DAY) <= now;
    if (canDelete) {
      await db.doc(`deletionJobs/${p.id}`).set({
        playerId: p.id,
        status: "pending",
        requestedAt: now,
        deadline: now + 7 * DAY,
      });
      await p.ref.set({ deleting: true }, { merge: true });
    } else if (
      !data.anonymous &&
      expiry - 30 * DAY <= now &&
      !warnedForThisActivity
    ) {
      const outbox = db.doc(
        `notificationOutbox/${hash("inactive:" + p.id + ":" + data.lastActiveAt)}`,
      );
      if (!(await outbox.get()).exists)
        await outbox.set({
          playerId: p.id,
          type: "inactivity_warning",
          forLastActiveAt: data.lastActiveAt,
          status: "pending-provider",
          createdAt: now,
        });
    }
  }
  for (const col of [
    "events",
    "limits",
    "audioGrants",
    "claims",
    "launchInterest",
    "withdrawalTokens",
    "deletionJobs",
    "adventureTeams",
    "adventureMembers",
    "adventureContributions",
  ]) {
    const old = await db
      .collection(col)
      .where("expiresAt", "<=", now)
      .limit(200)
      .get();
    for (const x of old.docs) await db.recursiveDelete(x.ref);
  }
  const oldChallenges = await db
    .collection("challenges")
    .where("closesAt", "<=", now - CHALLENGE_LIFETIME)
    .limit(100)
    .get();
  for (const c of oldChallenges.docs) {
    const a = await db
      .collection("attempts")
      .where("challengeId", "==", c.id)
      .get();
    for (const row of a.docs) {
      const player = await db.doc(`players/${row.get("playerId")}`).get();
      if (player.exists && !player.get("anonymous")) {
        await db.doc(`history/${row.id}`).set({
          playerId: row.get("playerId"),
          score: row.get("score"),
          partial: row.get("status") !== "completed",
          startedAt: row.get("startedAt"),
          kind: c.get("kind"),
          answers: row.get("answers"),
          retainedAt: now,
        });
      }
      await row.ref.delete();
    }
    await db.doc(`challengeSecrets/${c.id}`).delete();
    await c.ref.delete();
  }
  return { processed: jobs.size };
}
export const previewMaintenance = isEmulator
  ? onCall(options, async (req) => {
      requirePreview();
      await caller(req);
      const now = typeof req.data?.now === "number" ? req.data.now : Date.now();
      return maintenance(now);
    })
  : undefined;
export const dailyMaintenance = onSchedule(
  {
    schedule: "every day 03:00",
    serviceAccount: isEmulator
      ? undefined
      : "spellbee-runtime@spell-bee-c218a.iam.gserviceaccount.com",
    timeZone: "UTC",
    region: "us-central1",
    maxInstances: 1,
  },
  () => maintenance().then(() => {}),
);
