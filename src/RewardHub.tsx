import React, { useEffect, useState } from "react";
import type { GameState } from "./api";
import {
  emptyRewards,
  recordRound,
  rewardStats,
  type Rewards,
  type Word,
} from "./rewards";
import "./rewards.css";
const today = () => new Date().toISOString().slice(0, 10);
export default function RewardHub({
  game,
  standings,
  playerId,
}: {
  game: GameState | null;
  standings: any;
  playerId: string;
}) {
  const key = "spellbee-rewards-" + playerId;
  const [data, setData] = useState<Rewards>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || emptyRewards();
    } catch {
      return emptyRewards();
    }
  });
  const [queue, setQueue] = useState<Word[]>([]),
    [position, setPosition] = useState(0),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState<boolean | null>(null),
    [finished, setFinished] = useState(false);
  const [mode, setMode] = useState("Practice"),
    [practiceScore, setPracticeScore] = useState(0);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [data, key]);
  useEffect(() => {
    if (!game?.results || !game.attempt || data.rounds[game.attempt.id]) return;
    setData((d) =>
      recordRound(
        d,
        game,
        game.challenge.kind === "daily"
          ? game.challenge.id.replace(/^daily[-_]/, "").slice(0, 10)
          : today(),
      ),
    );
  }, [game]);
  useEffect(() => {
    if (
      !game?.results ||
      game.challenge.kind !== "private" ||
      !standings?.closed ||
      data.matches.includes(game.challenge.id)
    )
      return;
    const self = standings.rows.find((r: any) => r.isYou);
    if (!self) return;
    setData((d) => {
      if (d.matches.includes(game.challenge.id)) return d;
      const next = structuredClone(d);
      next.matches.push(game.challenge.id);
      for (const row of standings.rows.filter(
        (r: any) => !r.isYou && r.rivalId,
      )) {
        const record = (next.rivals[row.rivalId] ||= {
          name: row.displayName,
          wins: 0,
          draws: 0,
          losses: 0,
        });
        record.name = row.displayName;
        record[
          self.score > row.score
            ? "wins"
            : self.score < row.score
              ? "losses"
              : "draws"
        ]++;
      }
      return next;
    });
  }, [standings, game]);
  const stats = rewardStats(data, today());
  const badges = [
    { name: "First flight", earned: stats.rounds > 0, goal: "Finish a round" },
    { name: "Perfect pollinator", earned: stats.perfect, goal: "Score 5/5" },
    {
      name: "Weekly wings",
      earned: stats.streak >= 7,
      goal: "7 daily games in a row",
    },
    {
      name: "Social bee",
      earned: stats.challenges >= 10,
      goal: "Finish 10 friend challenges",
    },
  ];
  const outfits = [
    { id: "classic", icon: "🐝", name: "Classic", unlocked: true },
    {
      id: "flower",
      icon: "🌸",
      name: "Flower crown",
      unlocked: stats.rounds >= 1,
    },
    { id: "star", icon: "⭐", name: "Star wings", unlocked: stats.perfect },
    { id: "royal", icon: "👑", name: "Royal bee", unlocked: stats.streak >= 7 },
  ];
  function begin(label: string, words: Word[]) {
    setMode(label);
    setQueue([...words].sort(() => Math.random() - 0.5).slice(0, 5));
    setPosition(0);
    setAnswer("");
    setFeedback(null);
    setFinished(false);
    setPracticeScore(0);
  }
  const words = Object.values(data.words),
    misses = words.filter((w) => !data.mastered.includes(w.word));
  const current = queue[position];
  return (
    <section className="reward-hub card" aria-label="Your bee club">
      <div className="club-heading">
        <div>
          <span className="eyebrow">YOUR BEE CLUB</span>
          <h2>A little better, every day.</h2>
        </div>
        <div
          className={"collectible bee-" + data.outfit}
          aria-label={"Bee wearing " + data.outfit}
        >
          <span>{outfits.find((o) => o.id === data.outfit)?.icon}</span>🐝
        </div>
      </div>
      <p className="fine">
        Rewards and practice are saved on this browser for this player. Daily
        streaks follow UTC days.
      </p>
      {storageError && (
        <p role="status">
          Browser storage is unavailable. Rewards will last for this visit only.
        </p>
      )}
      <div className="club-stats">
        <div>
          <b>{stats.streak} 🔥</b>
          <span>Daily streak</span>
        </div>
        <div>
          <b>{stats.accuracy}%</b>
          <span>Round accuracy</span>
        </div>
        <div>
          <b>{data.mastered.length}</b>
          <span>Words mastered</span>
        </div>
        <div>
          <b>{stats.best}/5</b>
          <span>Personal best</span>
        </div>
      </div>
      <div className="level-label">
        <strong>
          Level {1 + Math.floor(stats.xp / 100)} · {stats.xp} nectar
        </strong>
        <span>{100 - (stats.xp % 100)} to next level</span>
      </div>
      <progress
        value={stats.xp % 100}
        max="100"
        aria-label="Progress to next level"
      />
      <p className="fine">
        Earn 10 nectar per round and 5 per correct answer. Practice builds
        mastery without affecting ranked scores.
      </p>
      <div className="badge-grid">
        {badges.map((b) => (
          <div
            key={b.name}
            className={"club-badge " + (b.earned ? "earned" : "")}
          >
            <span aria-hidden="true">{b.earned ? "🏅" : "◇"}</span>
            <strong>{b.name}</strong>
            <small>{b.earned ? "Unlocked" : b.goal}</small>
          </div>
        ))}
      </div>
      <h3>Dress your bee</h3>
      <div className="outfit-options">
        {outfits.map((o) => (
          <button
            key={o.id}
            className="secondary"
            disabled={!o.unlocked}
            aria-pressed={data.outfit === o.id}
            onClick={() => setData((d) => ({ ...d, outfit: o.id }))}
          >
            {o.icon} {o.name}
            {!o.unlocked && (
              <small>
                {o.id === "flower"
                  ? "Finish a round"
                  : o.id === "star"
                    ? "Get a perfect score"
                    : "Reach a 7-day streak"}
              </small>
            )}
          </button>
        ))}
      </div>
      <h3>Your next little adventure</h3>
      <div className="outfit-options">
        <button
          className="secondary"
          disabled={!misses.length}
          onClick={() => begin("Practice your misses", misses)}
        >
          Practice your misses ({misses.length})
        </button>
        <button
          className="secondary"
          disabled={!words.length}
          onClick={() => begin("Garden of words", words)}
        >
          Garden of words
        </button>
        <button
          className="secondary"
          disabled={!words.some((w) => w.word.length >= 8)}
          onClick={() =>
            begin(
              "Long-word safari",
              words.filter((w) => w.word.length >= 8),
            )
          }
        >
          Long-word safari
        </button>
      </div>
      <p className="fine">
        Unranked definition rounds from words you’ve already revealed. Finish a
        round to grow your collection.
      </p>
      {current && (
        <section className="practice-box" aria-label="Practice round">
          <div className="level-label">
            <h3>{mode}</h3>
            <button className="text-button" onClick={() => setQueue([])}>
              Close practice
            </button>
          </div>
          {finished ? (
            <p role="status">
              {practiceScore}/{queue.length} correct. Your bee is growing! Try
              another adventure whenever you like.
            </p>
          ) : (
            <>
              <p>
                Word {position + 1} of {queue.length} · {current.word.length}{" "}
                letters
              </p>
              <p>{current.definition}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (feedback !== null) return;
                  const correct =
                    answer.trim().toLowerCase() === current.word.toLowerCase();
                  setFeedback(correct);
                  if (correct) {
                    setPracticeScore((s) => s + 1);
                    setData((d) => ({
                      ...d,
                      mastered: [...new Set([...d.mastered, current.word])],
                    }));
                  }
                }}
              >
                <label className="field-label" htmlFor="practice-answer">
                  Spell the word from its definition
                </label>
                <input
                  id="practice-answer"
                  value={answer}
                  disabled={feedback !== null}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
                {feedback === null && (
                  <button className="primary" disabled={!answer.trim()}>
                    Check spelling
                  </button>
                )}
              </form>
              {feedback !== null && (
                <>
                  <p role="status">
                    {feedback ? "You’ve got it!" : "Keep growing."} The spelling
                    is <strong>{current.word}</strong>.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      if (position + 1 === queue.length) setFinished(true);
                      else {
                        setPosition((p) => p + 1);
                        setAnswer("");
                        setFeedback(null);
                      }
                    }}
                  >
                    {position + 1 === queue.length
                      ? "Finish practice"
                      : "Next word"}
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}
      <h3>Friendly rivalries</h3>
      {Object.keys(data.rivals).length ? (
        <ul className="rival-list">
          {Object.entries(data.rivals).map(([id, r]) => (
            <li key={id}>
              <strong>{r.name}</strong>
              <span>
                {r.wins} wins · {r.draws} draws · {r.losses} losses
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Finish a friend challenge and return after it closes to start your
          head-to-head record.
        </p>
      )}
    </section>
  );
}
