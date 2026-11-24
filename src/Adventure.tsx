import FourStarCelebration from "./FourStarCelebration";
import FiveStarCelebration from "./FiveStarCelebration";
import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
  newAdventure,
  restoreAdventure,
  claimAdventureChest,
  chooseChestPrize,
  spendBooster,
  completeAdventure,
  levelUnlocked,
  starsFor,
  type AdventureLevel,
  type AdventureProgress,
} from "./adventureProgress";
import {
  prepareConfirmationSound,
  playConfirmationSound,
  playIncorrectSound,
  playRewardSound,
  playPerfectSound,
  playFourStarSound,
} from "./confirmationSound";
import "./adventure.css";
type Team = {
  code: string;
  name: string;
  week: string;
  total: number;
  goal: number;
  resetsAt: number;
};
type Catalog = {
  worlds: { name: string; icon: string; color: string; description: string }[];
  levels: AdventureLevel[];
};
const accessories = [
  { icon: "🌼", name: "Daisy crown" },
  { icon: "🎀", name: "Honey bow" },
  { icon: "✨", name: "Sparkle wings" },
  { icon: "👑", name: "Garden crown" },
];
export default function Adventure({ playerId }: { playerId: string }) {
  const key = "spellbee-adventure-" + playerId;
  const [progress, setProgress] = useState<AdventureProgress>(() => {
    try {
      return restoreAdventure(
        JSON.parse(localStorage.getItem(key) || "null") || newAdventure(),
      );
    } catch {
      return newAdventure();
    }
  });
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [team, setTeam] = useState<Team | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(false);
  const [teamName, setTeamName] = useState(""),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("team") || "",
    );
  const [feedback, setFeedback] = useState<boolean | null>(
      progress.active?.feedback ?? null,
    ),
    [result, setResult] = useState<{
      score: number;
      earned: number;
      level: number;
    } | null>(null),
    [reward, setReward] = useState("");
  const [syncVersion, setSyncVersion] = useState(0);
  const submitLock = useRef(false),
    inputRef = useRef<HTMLInputElement>(null),
    syncing = useRef(false);
  const active = progress.active,
    level = catalog?.levels.find((l) => l.id === active?.level),
    position = active?.answers.length || 0,
    word = level?.words[position];
  async function load() {
    setError("");
    try {
      const [c, t] = await Promise.all([
        api<Catalog>("getAdventureCatalog"),
        api<{ team: Team | null }>("adventureTeam"),
      ]);
      setCatalog(c);
      setTeam(t.team);
    } catch (e: any) {
      setError(e.message || "Could not load your adventure.");
    }
  }
  useEffect(() => {
    void load();
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(progress));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [key, progress]);
  async function syncTeam() {
    if (syncing.current) return;
    syncing.current = true;
    let succeeded = false;
    setError("");
    try {
      for (const contribution of progress.pending) {
        const response = await api<{ team: Team | null }>(
          "contributeAdventure",
          contribution,
        );
        setTeam(response.team);
        setProgress((p) => ({
          ...p,
          pending: p.pending.filter((c) => c !== contribution),
        }));
      }
      const response = await api<{ team: Team | null }>("adventureTeam");
      setTeam(response.team);
      succeeded = true;
    } catch (e: any) {
      setError("Team progress is waiting to sync. " + e.message);
    } finally {
      syncing.current = false;
      if (succeeded) setSyncVersion((v) => v + 1);
    }
  }
  useEffect(() => {
    if (team && progress.pending.length) void syncTeam();
  }, [progress.pending, team?.code, syncVersion]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        void api<{ team: Team | null }>("adventureTeam")
          .then((r) => setTeam(r.team))
          .catch(() => {});
    };
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    inputRef.current?.focus();
  }, [active?.level, position]);
  function start(id: number) {
    if (!catalog || !levelUnlocked(progress, id)) return;
    window.speechSynthesis?.cancel();
    setResult(null);
    setFeedback(null);
    setNotice("");
    setProgress((p) => ({
      ...p,
      active: { level: id, answers: [], boosts: [], draft: "" },
    }));
  }
  function speak(slow = false, useReward = false) {
    if (!word) return;
    if (!("speechSynthesis" in window)) {
      setNotice(
        "Speech is unavailable on this device. Use the definition, letter reveal, and hint to play.",
      );
      return;
    }
    const kind = "slow";
    const charge = useReward && slow;
    if (charge && progress.boosters[kind] <= 0) return;
    if (charge) setProgress((p) => spendBooster(p, kind));
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = "en-US";
    utterance.rate = slow ? 0.65 : 0.9;
    let started = false;
    utterance.onstart = () => {
      started = true;
    };
    utterance.onerror = (event) => {
      if (charge && !started)
        setProgress((p) => ({
          ...p,
          boosters: { ...p.boosters, [kind]: p.boosters[kind] + 1 },
        }));
      if (event.error !== "canceled" && event.error !== "interrupted")
        setNotice(
          "Tap Listen to hear the word. If speech is unavailable, you can still use the definition and hints.",
        );
    };
    window.speechSynthesis.speak(utterance);
  }
  useEffect(() => {
    if (!word || feedback !== null) return;
    speak();
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, [active?.level, position, word?.word]);
  function boost(kind: "slow" | "letter" | "hint") {
    if (
      !active ||
      feedback !== null ||
      progress.boosters[kind] <= 0 ||
      (kind !== "slow" && active.boosts.includes(kind + ":" + position))
    )
      return;
    if (kind === "slow") {
      speak(true, true);
      return;
    }
    setProgress((p) => {
      if (
        !p.active ||
        p.boosters[kind] <= 0 ||
        p.active.boosts.includes(kind + ":" + position)
      )
        return p;
      const next = spendBooster(p, kind);
      return {
        ...next,
        active: {
          ...p.active,
          boosts: [...p.active.boosts, kind + ":" + position],
        },
      };
    });
  }
  function lock(e: React.FormEvent) {
    e.preventDefault();
    if (
      !active ||
      !word ||
      !level ||
      !active.draft.trim() ||
      submitLock.current ||
      feedback !== null
    )
      return;
    submitLock.current = true;
    prepareConfirmationSound();
    window.speechSynthesis?.cancel();
    const correct = active.draft.trim().toLowerCase() === word.word;
    if (correct) playConfirmationSound();
    else playIncorrectSound();
    setFeedback(correct);
    setProgress((p) => ({
      ...p,
      active: {
        ...active,
        draft: active.draft,
        answers: active.answers,
        feedback: correct,
      },
    }));
    submitLock.current = false;
  }
  function next() {
    if (!active || !level || feedback === null) return;
    const answers = [...active.answers, active.draft.trim()];
    if (answers.length === 5) {
      const completed = completeAdventure(
        progress,
        level.id,
        answers,
        level.words,
      );
      setProgress(completed.progress);
      setResult({
        score: completed.score,
        earned: completed.earned,
        level: level.id,
      });
      prepareConfirmationSound();
      if (completed.score === 5) playPerfectSound();
      else if (completed.score === 4) playFourStarSound();
      else playRewardSound();
    } else
      setProgress((p) => ({
        ...p,
        active: { ...active, answers, draft: "", feedback: null },
      }));
    setFeedback(null);
  }
  async function teamAction(action: string) {
    setBusy(true);
    setError("");
    try {
      const response = await api<{ team: Team | null }>("adventureTeam", {
        action,
        name: teamName,
        code: code
          .trim()
          .replace(/^.*[?&]team=/, "")
          .split("&")[0],
      });
      setTeam(response.team);
      setNotice(
        action === "leave"
          ? "You left the team."
          : "Your hive is ready. Every mastered word helps!",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function openChest() {
    if (
      progress.honey < (progress.opened + 1) * 100 ||
      progress.opened >= accessories.length
    )
      return;
    prepareConfirmationSound();
    playRewardSound();
    const prize = chooseChestPrize(progress);
    setReward(prize.label);
    setProgress((p) => claimAdventureChest(p, prize));
  }
  const stars = Object.values(progress.best).reduce(
      (sum, score) => sum + starsFor(score),
      0,
    ),
    nextChest = Math.min(
      100,
      Math.max(0, progress.honey - progress.opened * 100),
    );
  return (
    <section className="adventure" aria-label="Bee adventure">
      <div className="adventure-hero">
        <div>
          <h1>
            Your next
            <br />
            <em>big adventure.</em>
          </h1>
          <p>Five words. Five stars. A whole garden to discover.</p>
          <div className="adventure-pills">
            <span>⭐ {stars}/60 stars</span>
            <span>🍯 {progress.honey} honey</span>
          </div>
        </div>
        <div
          className="adventure-bee"
          aria-label={
            progress.accessory
              ? accessories[progress.accessory - 1].name + " bee"
              : "Happy bee"
          }
        >
          <span>
            {progress.accessory
              ? accessories[progress.accessory - 1].icon
              : "🌼"}
          </span>
          🐝<small>Let’s grow!</small>
        </div>
      </div>
      <p className="fine">
        Adventure progress and cosmetics stay on this browser for this player.
        Team goals are shared online. Adventure hints never affect daily or
        friend scores.
      </p>
      {storageError && (
        <p className="notice" role="status">
          Browser storage is unavailable. Keep this page open to retain your
          adventure.
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => (catalog ? void syncTeam() : void load())}
          >
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!catalog && !error && <p role="status">Planting your adventure…</p>}
      <div className="adventure-grid">
        <div>
          {level && active && word && (
            <section
              className="adventure-play card"
              aria-label="Adventure level"
            >
              <div className="level-label">
                <span className="eyebrow">
                  {level.world} · LEVEL {level.id}
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    window.speechSynthesis?.cancel();
                    setFeedback(null);
                    setProgress((p) => ({ ...p, active: null }));
                  }}
                >
                  Back to map
                </button>
              </div>
              <h2>Word {position + 1} of 5</h2>
              <div
                className="adventure-dots"
                aria-label={`${position} words completed`}
              >
                {level.words.map((_, i) => (
                  <span
                    key={i}
                    className={
                      i < position ? "done" : i === position ? "current" : ""
                    }
                  >
                    {i < position ? "✓" : "✿"}
                  </span>
                ))}
              </div>
              <button
                className="primary adventure-listen"
                onClick={() => speak(false, true)}
              >
                ♫ Listen to the word
              </button>
              <p className="fine">
                Listen again as often as you like. Regular replays are
                unlimited.
              </p>
              <p className="adventure-definition">{word.definition}</p>
              <div className="boosters" aria-label="Adventure boosters">
                <button
                  className="secondary"
                  disabled={feedback !== null || progress.boosters.slow === 0}
                  onClick={() => boost("slow")}
                >
                  🐢 Slow replay · {progress.boosters.slow}
                </button>
                <button
                  className="secondary"
                  disabled={
                    feedback !== null ||
                    progress.boosters.letter === 0 ||
                    active.boosts.includes("letter:" + position)
                  }
                  onClick={() => boost("letter")}
                >
                  🔤 Reveal a letter · {progress.boosters.letter}
                </button>
                <button
                  className="secondary"
                  disabled={
                    feedback !== null ||
                    progress.boosters.hint === 0 ||
                    active.boosts.includes("hint:" + position)
                  }
                  onClick={() => boost("hint")}
                >
                  💡 Spelling hint · {progress.boosters.hint}
                </button>
              </div>
              <p className="fine">
                Open honey chests to earn slow replays, letter reveals, and
                spelling hints. Letter reveals and hints stay visible for the
                current word.
              </p>
              {active.boosts.includes("letter:" + position) && (
                <p className="booster-note">
                  First letter: <strong>{word.word[0].toUpperCase()}</strong> ·{" "}
                  {word.word.length} letters
                </p>
              )}
              {active.boosts.includes("hint:" + position) && (
                <p className="booster-note">{word.hint}</p>
              )}
              <form onSubmit={lock}>
                <label className="field-label" htmlFor="adventure-answer">
                  Your adventure spelling
                </label>
                <input
                  ref={inputRef}
                  id="adventure-answer"
                  maxLength={100}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={feedback !== null}
                  value={active.draft}
                  onChange={(e) => {
                    const draft = e.target.value;
                    setProgress((p) => ({
                      ...p,
                      active: p.active ? { ...p.active, draft } : null,
                    }));
                  }}
                />
                {feedback === null && (
                  <button className="primary" disabled={!active.draft.trim()}>
                    Lock in adventure word
                  </button>
                )}
              </form>
              {feedback !== null && (
                <div className="adventure-feedback" role="status">
                  <h3>
                    {feedback
                      ? "Beautifully spelled! 🌟"
                      : "A new word for your garden. 🌱"}
                  </h3>
                  <p>
                    The spelling is <strong>{word.word}</strong>.
                  </p>
                  <button className="primary" onClick={next}>
                    {position === 4 ? "Collect my stars" : "Next word"}
                  </button>
                </div>
              )}
            </section>
          )}
          {result && (
            <section
              className="adventure-result card"
              aria-label="Adventure results"
            >
              {result.score === 5 && <FiveStarCelebration />}
              {result.score === 4 && <FourStarCelebration />}
              <div
                className="flying-stars"
                aria-label={`${starsFor(result.score)} stars`}
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={i <= starsFor(result.score) ? "won" : ""}
                    style={{ animationDelay: `${i * 0.12}s` }}
                  >
                    ★
                  </span>
                ))}
              </div>
              <h2>
                {
                  [
                    "Let’s give those words another try.",
                    "One word down. Keep practicing!",
                    "Two words right. Keep practicing!",
                    "Three words right. Nice work!",
                    "Four stars. So close to a perfect five!",
                    "A royal five!",
                  ][result.score]
                }
              </h2>
              <p>
                {result.score}/5 correct ·{" "}
                <strong>+{result.earned} honey 🍯</strong>
              </p>
              <p>
                {result.earned
                  ? "Your honey jar is filling up!"
                  : "Your best reward is already saved. Keep practicing for more stars."}
              </p>
              <p className="fine">
                One star per correct word · 0 correct = 0 stars · A perfect five
                = 5 stars
              </p>
              <div className="outfit-options">
                <button
                  className="secondary"
                  onClick={() => start(result.level)}
                >
                  Retry for free
                </button>
                {result.level < 12 && (
                  <button
                    className="primary"
                    onClick={() => start(result.level + 1)}
                  >
                    Explore next level
                  </button>
                )}
                <button className="text-button" onClick={() => setResult(null)}>
                  See my map
                </button>
              </div>
            </section>
          )}
          {catalog && !active && !result && (
            <div className="world-map" aria-label="Adventure level map">
              {catalog.worlds.map((world, wi) => (
                <section
                  key={world.name}
                  className={"adventure-world " + world.color}
                >
                  <div className="world-heading">
                    <span aria-hidden="true">{world.icon}</span>
                    <div>
                      <h2>{world.name}</h2>
                      <p>{world.description}</p>
                    </div>
                  </div>
                  <div className="level-trail">
                    {catalog.levels
                      .filter((l) => l.world === world.name)
                      .map((l, i) => {
                        const best = progress.best[l.id],
                          unlocked = levelUnlocked(progress, l.id);
                        return (
                          <div className={"level-stop stop-" + i} key={l.id}>
                            <button
                              className={
                                "level-node " +
                                (best !== undefined ? "completed" : "")
                              }
                              disabled={!unlocked}
                              aria-label={`Level ${l.id}, ${unlocked ? (best !== undefined ? `${starsFor(best)} stars, replay` : "ready to play") : "locked"}`}
                              onClick={() => start(l.id)}
                            >
                              {unlocked ? l.id : "🔒"}
                            </button>
                            <span
                              className="map-stars"
                              aria-label={
                                best === undefined
                                  ? "No stars yet"
                                  : `${starsFor(best)} stars`
                              }
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <span
                                  key={n}
                                  className={
                                    best !== undefined && n <= starsFor(best)
                                      ? "won"
                                      : ""
                                  }
                                >
                                  ★
                                </span>
                              ))}
                            </span>
                            {l.id === 1 && best === undefined && (
                              <small>Start here!</small>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  <p className="fine">
                    {wi === 0
                      ? "Familiar words · 3–6 letters"
                      : wi === 1
                        ? "Growing confidence · 6–10 letters"
                        : "Royal challenge · longer, trickier words"}
                  </p>
                </section>
              ))}
            </div>
          )}
        </div>
        <aside className="adventure-sidebar">
          <section className="honey-card card">
            <span className="eyebrow">SWEET LITTLE REWARDS</span>
            <h2>Your honey jar</h2>
            <div
              className="booster-inventory"
              aria-label="Your booster rewards"
            >
              <strong>Your booster collection</strong>
              <p>♫ Replays: Unlimited</p>
              <p>🐢 Slow replays: {progress.boosters.slow}</p>
              <p>🔤 Letter reveals: {progress.boosters.letter}</p>
              <p>💡 Spelling hints: {progress.boosters.hint}</p>
            </div>
            <div
              className="honey-jar"
              role="img"
              aria-label={`${nextChest} of 100 honey toward your next chest`}
            >
              <div style={{ height: `${nextChest}%` }} />
              <span>🍯</span>
            </div>
            <p>
              <strong>
                {progress.opened >= 4
                  ? "All four chests opened!"
                  : `${nextChest}/100 to your next chest`}
              </strong>
            </p>
            <p className="fine">
              10 honey for a first finish, plus 5 per correct word. Better
              scores earn the difference.
            </p>
            <button
              className="primary"
              disabled={progress.opened >= 4 || nextChest < 100}
              onClick={openChest}
            >
              🎁 Open reward chest
            </button>
            {reward && (
              <p className="chest-reveal" role="status">
                ✨ You unlocked {reward}!
              </p>
            )}
            <div className="adventure-closet" aria-label="Adventure cosmetics">
              <button
                className="secondary"
                aria-pressed={progress.accessory === 0}
                onClick={() => setProgress((p) => ({ ...p, accessory: 0 }))}
              >
                🐝 Classic
              </button>
              {accessories.map((a, i) => (
                <button
                  key={a.name}
                  className="secondary"
                  disabled={!progress.ownedAccessories?.includes(i + 1)}
                  aria-pressed={progress.accessory === i + 1}
                  onClick={() =>
                    setProgress((p) => ({ ...p, accessory: i + 1 }))
                  }
                >
                  {a.icon} {a.name}
                  {!progress.ownedAccessories?.includes(i + 1) && " · Locked"}
                </button>
              ))}
            </div>
          </section>
          <section className="team-card card">
            <span className="eyebrow">BETTER TOGETHER</span>
            <h2>Your weekly hive</h2>
            {team ? (
              <>
                <h3>{team.name}</h3>
                <p>
                  Master <strong>100 words together</strong> this week.
                </p>
                <progress
                  value={Math.min(team.total, team.goal)}
                  max={team.goal}
                  aria-label="Weekly team word goal"
                />
                <p
                  role="status"
                  className={team.total >= team.goal ? "hive-celebration" : ""}
                >
                  <strong>
                    {team.total}/{team.goal} words
                  </strong>
                  {team.total >= team.goal
                    ? " · Hive goal complete! 🏆"
                    : " · Every word helps."}
                </p>
                <p className="fine">
                  Resets{" "}
                  {new Date(team.resetsAt).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}{" "}
                  at 00:00 UTC. Each correct word counts once per level, per
                  player, per week. Boosters welcome.
                </p>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        location.origin + "/?team=" + team.code,
                      );
                      setNotice(
                        "Team invite link copied. Share it with your friends.",
                      );
                    } catch {
                      setNotice("Invite code: " + team.code);
                    }
                  }}
                >
                  Copy team invite
                </button>
                <p className="fine">
                  Invite code: <strong>{team.code}</strong>. Anyone with this
                  code can join. Team progress refreshes every 30 seconds.
                </p>
                <div className="outfit-options">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void syncTeam()}
                  >
                    Refresh / sync progress
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void teamAction("leave")}
                  >
                    Leave team
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Build a hive with friends and work toward 100 correctly
                  spelled words each week.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void teamAction("create");
                  }}
                >
                  <label className="field-label" htmlFor="team-name">
                    New team name
                  </label>
                  <input
                    id="team-name"
                    maxLength={30}
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busy || !catalog || !teamName.trim()}
                  >
                    Create a team
                  </button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void teamAction("join");
                  }}
                >
                  <label className="field-label" htmlFor="team-code">
                    Team invite code or link
                  </label>
                  <input
                    id="team-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button
                    className="secondary"
                    disabled={busy || !catalog || !code.trim()}
                  >
                    Join friends
                  </button>
                </form>
              </>
            )}
            <p className="fine">
              Replays are unlimited. Team goals award a shared celebration, with
              no penalties or purchases.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
