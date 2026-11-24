const { session } = require("./cloud-session.cjs");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const decode = (v) =>
  v.stringValue ??
  (v.integerValue !== undefined
    ? Number(v.integerValue)
    : (v.doubleValue ??
      v.booleanValue ??
      (v.mapValue
        ? Object.fromEntries(
            Object.entries(v.mapValue.fields || {}).map(([k, v]) => [
              k,
              decode(v),
            ]),
          )
        : null)));
exports.report = (rows) => {
  const visits = new Map(),
    players = new Map(),
    shares = new Map(),
    joins = new Map(),
    drop = [0, 0, 0, 0, 0];
  let starts = 0,
    completions = 0;
  for (const r of rows) {
    const uid = r.playerId,
      day = new Date(r.createdAt).toISOString().slice(0, 10);
    if (!uid) continue;
    if (r.event === "visit") {
      if (!visits.has(uid)) visits.set(uid, new Set());
      visits.get(uid).add(day);
    }
    if (r.event === "attempt_started") {
      starts++;
      if (!players.has(uid))
        players.set(uid, { first: day, completed: new Set() });
      if (r.properties?.inviter) {
        if (!joins.has(r.properties.inviter))
          joins.set(r.properties.inviter, new Set());
        joins.get(r.properties.inviter).add(uid);
      }
    }
    if (r.event === "attempt_completed") {
      completions++;
      if (players.has(uid)) players.get(uid).completed.add(day);
    }
    if (
      r.event === "word_submitted" &&
      r.properties?.position >= 1 &&
      r.properties.position <= 5
    )
      drop[r.properties.position - 1]++;
    if (["share_initiated", "link_copied"].includes(r.event))
      shares.set(uid, (shares.get(uid) || 0) + 1);
  }
  const now = new Date().toISOString().slice(0, 10),
    retention = {};
  for (const offset of [1, 7]) {
    let eligible = 0,
      returned = 0;
    for (const p of players.values()) {
      const target = new Date(
        Date.parse(p.first + "T00:00:00Z") + offset * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      if (target < now) {
        eligible++;
        if (p.completed.has(target)) returned++;
      }
    }
    retention["D" + offset] = {
      eligible,
      returned,
      rate: eligible ? returned / eligible : null,
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    coverage:
      "Consenting identities only; 60-day raw event window. Share actions are intent, not delivered invitations. Devices/cookies can split visitors. UTC reporting; matured D1/D7 first-play cohorts.",
    visitors: visits.size,
    repeatVisitors: [...visits.values()].filter((v) => v.size > 1).length,
    visitEvents: rows.filter((r) => r.event === "visit").length,
    starts,
    completions,
    completionRate: starts ? completions / starts : null,
    wordSubmissionsByPosition: drop,
    retention,
    invitationActivity: [
      ...new Set([...shares.keys()].map(hash).concat([...joins.keys()])),
    ].map((id) => ({
      playerPseudonym: id,
      shareActions: [...shares.entries()]
        .filter(([uid]) => hash(uid) === id)
        .reduce((n, [_, v]) => n + v, 0),
      attributedFriendStarts: joins.get(id)?.size || 0,
    })),
    averageShareActionsPerSharingPlayer: shares.size
      ? [...shares.values()].reduce((n, v) => n + v, 0) / shares.size
      : 0,
  };
};
if (require.main === module)
  (async () => {
    const { project, request } = await session();
    let page = "",
      rows = [];
    do {
      const r = await request(
        `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/events?pageSize=300${page ? "&pageToken=" + encodeURIComponent(page) : ""}`,
      );
      rows.push(
        ...(r.documents || []).map((d) =>
          Object.fromEntries(
            Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)]),
          ),
        ),
      );
      page = r.nextPageToken || "";
    } while (page);
    // Reports must not emit facts for identities that have withdrawn consent or are deleting.
    const allowed = new Set();
    for (const uid of new Set(rows.map((r) => r.playerId))) {
      if (typeof uid !== "string" || uid.includes("/")) continue;
      try {
        const player = await request(
          `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/players/${encodeURIComponent(uid)}`,
        );
        if (
          player.fields?.analyticsConsent?.booleanValue === true &&
          player.fields?.deleting?.booleanValue !== true
        )
          allowed.add(uid);
      } catch (e) {
        if (!e.message.includes("404")) throw e;
      }
    }
    const inviterIds = new Set([...allowed].map(hash));
    rows = rows
      .filter((r) => allowed.has(r.playerId) && r.expiresAt > Date.now())
      .map((r) => ({
        ...r,
        properties: {
          ...r.properties,
          inviter: inviterIds.has(r.properties?.inviter)
            ? r.properties.inviter
            : null,
        },
      }));
    rows.sort((a, b) => a.createdAt - b.createdAt);
    await fs.writeFile(
      "artifacts/production-review/analytics-report.json",
      JSON.stringify(exports.report(rows), null, 2),
    );
    console.log(
      "Saved consented analytics report; no names/emails/answer text exported.",
    );
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
