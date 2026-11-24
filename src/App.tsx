import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Volume2,
  Check,
  Copy,
  Users,
  Clock,
  RotateCcw,
  X,
  Headphones,
  Mail,
  LoaderCircle,
} from "lucide-react";
import {
  api,
  isLocalPreview,
  configureAnalytics,
  analyticsEvent,
  auth,
  initializeSession,
  sendSaveLink,
  pendingEmailLink,
  completeSaveLink,
  resetIdentity,
  GameState,
} from "./api";
import "./style.css";
import {
  prepareConfirmationSound,
  playConfirmationSound,
} from "./confirmationSound";
import RewardHub from "./RewardHub";
import Adventure from "./Adventure";

type Modal =
  "save" | "ios" | "android" | "settings" | "privacy" | "history" | null;
const storage = {
  get: (k: string) => localStorage.getItem("spellbee-" + k),
  set: (k: string, v: string) => localStorage.setItem("spellbee-" + k, v),
};
const localDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function Bee({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width={small ? 30 : 60}
      height={small ? 30 : 60}
      viewBox="0 0 60 60"
    >
      <path d="M12 16 30 6 48 16v26L30 53 12 42Z" fill="#ecb34c" />
      <path
        d="M20 21h20M18 29h24M22 37h16"
        stroke="#233d32"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M20 14 13 6m27 8 7-8"
        stroke="#233d32"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
export default function App() {
  const [gameMode, setGameMode] = useState<"daily" | "adventure">(() => {
    if (new URLSearchParams(location.search).has("team")) return "adventure";
    try {
      return sessionStorage.getItem("spellbee-mode") === "adventure"
        ? "adventure"
        : "daily";
    } catch {
      return "daily";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("spellbee-mode", gameMode);
    } catch {
      /* Navigation still works without storage. */
    }
  }, [gameMode]);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [game, setGame] = useState<GameState | null>(null),
    [view, setView] = useState<"home" | "play" | "results">("home"),
    [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState(storage.get("name") || ""),
    [answer, setAnswer] = useState(""),
    [prompt, setPrompt] = useState<{
      position: number;
      audioUrl: string;
      definition: string;
    } | null>(null);
  const [now, setNow] = useState(Date.now()),
    [standings, setStandings] = useState<any>(null),
    [historyRows, setHistoryRows] = useState<any[]>([]);
  const [email, setEmail] = useState(""),
    [emailLink, setEmailLink] = useState<string | undefined>(),
    [subscribed, setSubscribed] = useState(false),
    [consent, setConsent] = useState(storage.get("analytics"));
  const [withdrawTokens, setWithdrawTokens] = useState<string[]>(
    JSON.parse(storage.get("withdrawals") || "[]"),
  );
  const [audioStatus, setAudioStatus] = useState(""),
    [isPlaying, setIsPlaying] = useState(false);
  const announcedWords = useRef(new Set<string>());
  const modalRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null),
    inputRef = useRef<HTMLInputElement | null>(null),
    newRequest = useRef(crypto.randomUUID());
  const challengeId = location.pathname.startsWith("/c/")
    ? location.pathname.split("/")[2]
    : null;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e: any) {
      setError(
        (e.message || "Something went wrong. Please try again.").replace(
          /^Firebase: /,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function accept(s: GameState, open = false) {
    setGame(s);
    setAnswer(
      s.attempt?.status === "active"
        ? storage.get("draft-" + s.attempt.id + "-" + s.attempt.position) || ""
        : "",
    );
    if (open || s.attempt)
      setView(
        s.results || (s.attempt && s.attempt.status !== "active")
          ? "results"
          : s.attempt
            ? "play"
            : "home",
      );
  }
  useEffect(() => {
    let cancelled = false;
    initializeSession()
      .then(async () => {
        if (cancelled) return;
        if (pendingEmailLink()) {
          setEmail(localStorage.getItem("spellbee-email") || "");
          setModal("save");
          setReady(true);
          return;
        }
        const s = await api<GameState>(
          challengeId ? "getChallenge" : "getDailyChallenge",
          challengeId ? { challengeId } : {},
        );
        if (!cancelled) {
          accept(s);
          setReady(true);
          const pref = storage.get("analytics");
          if (pref) {
            await api("setAnalyticsConsent", { allowed: pref === "allow" });
            await configureAnalytics(pref === "allow");
            if (pref === "allow") {
              analyticsEvent("visit");
              await api("recordEvent", {
                event: "visit",
                eventId: crypto.randomUUID(),
              });
            }
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Could not connect to the game.");
          setReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const preparingChallenge = useRef<string | null>(null);
  useEffect(() => {
    if (
      !ready ||
      gameMode !== "daily" ||
      !game ||
      game.attempt ||
      game.challenge.closesAt <= Date.now() ||
      preparingChallenge.current === game.challenge.id
    )
      return;
    preparingChallenge.current = game.challenge.id;
    start();
  }, [ready, gameMode, game?.challenge.id, game?.attempt?.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      !game ||
      game.attempt?.status !== "active" ||
      view !== "play" ||
      gameMode !== "daily"
    )
      return;
    let current = true;
    setPrompt(null);
    setAudioStatus("");
    api("getPrompt", { challengeId: game.challenge.id })
      .then((p) => {
        if (current) setPrompt(p);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    inputRef.current?.focus();
    return () => {
      current = false;
      audioRef.current?.pause();
    };
  }, [
    game?.attempt?.position,
    game?.challenge.id,
    game?.attempt?.status,
    view,
    gameMode,
  ]);
  useEffect(() => {
    const audio = audioRef.current;
    if (
      !audio ||
      !prompt ||
      prompt.position !== game?.attempt?.position ||
      gameMode !== "daily" ||
      view !== "play" ||
      game?.attempt?.status !== "active"
    )
      return;
    let current = true;
    let starting = false;
    const question = `${game.attempt.id}:${prompt.position}`;
    const announce = () => {
      if (document.visibilityState !== "visible") {
        audio.pause();
        return;
      }
      if (!current || starting || announcedWords.current.has(question)) return;
      try {
        if (sessionStorage.getItem("spellbee-announced-" + question)) return;
      } catch {
        /* Use the in-memory guard when storage is unavailable. */
      }
      starting = true;
      setAudioStatus("");
      audio.currentTime = 0;
      void audio
        .play()
        .then(() => {
          announcedWords.current.add(question);
          try {
            sessionStorage.setItem("spellbee-announced-" + question, "1");
          } catch {
            /* Audio still works without storage. */
          }
        })
        .catch((error: DOMException) => {
          if (current && error.name !== "AbortError")
            setAudioStatus(
              "Tap Listen to hear the word. Your browser needs a tap before playing audio automatically.",
            );
        })
        .finally(() => {
          starting = false;
        });
    };
    announce();
    document.addEventListener("visibilitychange", announce);
    return () => {
      current = false;
      document.removeEventListener("visibilitychange", announce);
      audio.pause();
    };
  }, [
    prompt?.audioUrl,
    gameMode,
    view,
    game?.attempt?.status,
    game?.attempt?.id,
  ]);
  useEffect(() => {
    if (
      !game ||
      game.attempt?.status !== "active" ||
      now < game.challenge.closesAt
    )
      return;
    api<GameState>("getChallenge", { challengeId: game.challenge.id })
      .then((s) => accept(s, true))
      .catch((e) => setError(e.message));
  }, [now >= (game?.challenge.closesAt || Infinity), game?.attempt?.status]);
  useEffect(() => {
    if (view !== "results" || !game) return;
    api("getStandings", { challengeId: game.challenge.id })
      .then(setStandings)
      .catch((e) => setError(e.message));
    if (!game.results && now >= game.challenge.closesAt)
      api<GameState>("getChallenge", { challengeId: game.challenge.id })
        .then(setGame)
        .catch((e) => setError(e.message));
  }, [view, game?.challenge.id, now >= (game?.challenge.closesAt || Infinity)]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = modalRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,[tabindex="0"]',
        ) || [],
      ).filter((e) => e.offsetParent !== null);
    (dialog?.querySelector("input") || focusable()[0])?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        return;
      }
      if (e.key === "Tab") {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (!dialog?.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const onPopState = () => {
      if (!auth.currentUser) return;
      run(async () => {
        const id = location.pathname.startsWith("/c/")
          ? location.pathname.split("/")[2]
          : null;
        const next = await api<GameState>(
          id ? "getChallenge" : "getDailyChallenge",
          id ? { challengeId: id } : {},
        );
        setStandings(null);
        accept(next);
        if (!next.attempt) setView("home");
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  function track(event: string, platform?: string) {
    if (consent === "allow") {
      analyticsEvent(event, platform ? { platform } : {});
      api("recordEvent", {
        event,
        eventId: crypto.randomUUID(),
        platform,
      }).catch(() => {});
    }
  }
  async function chooseConsent(value: "allow" | "decline") {
    await run(async () => {
      if (value === "decline") await configureAnalytics(false);
      await api("setAnalyticsConsent", { allowed: value === "allow" });
      if (value === "allow") {
        await configureAnalytics(true);
        analyticsEvent("visit");
      }
      setConsent(value);
      storage.set("analytics", value);
      if (value === "allow")
        await api("recordEvent", {
          event: "visit",
          eventId: crypto.randomUUID(),
        });
    });
  }
  async function start() {
    if (!game) return;
    await run(async () => {
      storage.set("name", name.trim());
      const s = await api<GameState>("startAttempt", {
        challengeId: game.challenge.id,
        displayName: name,
      });
      if (consent === "allow")
        analyticsEvent("attempt_started", { kind: game.challenge.kind });
      accept(s, true);
    });
  }
  async function createPrivate(rematch = false) {
    await run(async () => {
      const s = await api<GameState>(
        rematch ? "createRematch" : "createPrivateChallenge",
        {
          requestId: newRequest.current,
          ...(rematch ? { challengeId: game?.challenge.id } : {}),
        },
      );
      newRequest.current = crypto.randomUUID();
      history.pushState({}, "", `/c/${s.challenge.id}`);
      setStandings(null);
      setGame(s);
      setView("home");
      setMessage(
        "Your friend challenge is ready. Share the link, then play your five words.",
      );
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !game?.attempt || !answer.trim()) return;
    prepareConfirmationSound();
    await run(async () => {
      const old = game.attempt!;
      const s = await api<GameState>("submitAnswer", {
        challengeId: game.challenge.id,
        position: old.position,
        answer,
      });
      playConfirmationSound();
      if (consent === "allow") {
        analyticsEvent("word_submitted", { position: old.position + 1 });
        if (s.attempt?.status === "completed")
          analyticsEvent("attempt_completed", { kind: game.challenge.kind });
      }
      localStorage.removeItem("spellbee-draft-" + old.id + "-" + old.position);
      accept(s, true);
    });
  }
  async function playAudio() {
    if (!prompt || !game) return;
    setAudioStatus("");
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
        if (game.attempt) {
          const question = `${game.attempt.id}:${prompt.position}`;
          announcedWords.current.add(question);
          try {
            sessionStorage.setItem("spellbee-announced-" + question, "1");
          } catch {
            /* Replays still work without storage. */
          }
        }
      }
    } catch {
      setAudioStatus("Playback did not start. Tap Listen again.");
    }
  }
  async function retryAudio() {
    if (!game) return;
    await run(async () => {
      setPrompt(await api("getPrompt", { challengeId: game.challenge.id }));
      setAudioStatus("Audio refreshed. Tap Listen to play.");
    });
  }
  async function share() {
    if (!game) return;
    await run(async () => {
      const url = location.origin + "/c/" + game.challenge.id;
      const text = game.results
        ? `Spell-Bee · ${game.challenge.kind === "daily" ? game.challenge.date : "Friend challenge"}\n${game.results.items.map((item) => (item.correct ? "🟩" : "⬜")).join("")}\n${game.results.score}/5 · Can you beat me?`
        : "Five words. Your turn. Join my Spell-Bee challenge.";
      if (navigator.share) {
        track("share_initiated");
        try {
          await navigator.share({ title: "Spell-Bee", text, url });
        } catch (e: any) {
          if (e.name !== "AbortError") throw e;
        }
      } else {
        await navigator.clipboard.writeText(text + " " + url);
        track("link_copied");
        setMessage("Challenge link copied.");
      }
    });
  }
  async function home() {
    setGameMode("daily");
    await run(async () => {
      history.pushState({}, "", "/");
      setStandings(null);
      accept(await api("getDailyChallenge"));
      setView("home");
    });
  }
  async function openHistory() {
    await run(async () => {
      const r = await api("getHistory");
      setHistoryRows(r.rows);
      setModal("history");
    });
  }
  const remaining = Math.max(0, (game?.challenge.closesAt || now) - now),
    hours = Math.floor(remaining / 3600000),
    minutes = Math.floor(remaining / 60000) % 60;
  const closed = game ? now >= game.challenge.closesAt : false;
  const modalTitle =
    modal === "save"
      ? "Keep your good work."
      : modal === "settings"
        ? "Your preferences."
        : modal === "privacy"
          ? "Your words. Your privacy."
          : modal === "history"
            ? "Your spelling story."
            : `The ${modal === "ios" ? "iOS" : "Android"} app is coming soon!`;
  const spellingCard = game?.attempt ? (
    <div className="play-card card">
      <div className="progress-label">
        <span>WORD {game!.attempt!.position + 1} OF 5</span>
        <span>{name || game!.attempt!.displayName}</span>
      </div>
      <div className="progress-track">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            className={
              i < game!.attempt!.position
                ? "done"
                : i === game!.attempt!.position
                  ? "current"
                  : ""
            }
            key={i}
          />
        ))}
      </div>
      <div className="listen-zone">
        <button
          className={"listen-button " + (isPlaying ? "playing" : "")}
          disabled={!prompt}
          onClick={playAudio}
          aria-label="Listen to the word"
        >
          {prompt ? (
            <Volume2 size={40} strokeWidth={1.4} />
          ) : (
            <LoaderCircle className="spin" size={30} />
          )}
        </button>
        <h2>{isPlaying ? "Listen closely…" : "Your next word awaits."}</h2>
        <p>The word plays automatically. Tap Listen to hear it again.</p>
      </div>
      {prompt && (
        <section className="word-definition" aria-label="Word definition">
          <span className="eyebrow">DEFINITION</span>
          <p>{prompt.definition}</p>
        </section>
      )}
      <audio
        ref={audioRef}
        src={prompt?.audioUrl}
        onPlay={() => setIsPlaying(true)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onError={() =>
          setAudioStatus(
            "Couldn’t load this recording. Refresh the audio and try again.",
          )
        }
      />
      {audioStatus && (
        <p role="status" className="audio-error">
          {audioStatus}{" "}
          <button className="text-button" onClick={retryAudio}>
            Refresh audio
          </button>
        </p>
      )}
      <form onSubmit={submit}>
        <label className="field-label" htmlFor="spelling">
          Your spelling
        </label>
        <input
          ref={inputRef}
          id="spelling"
          className="spelling-input"
          placeholder="Let your letters do the talking…"
          value={answer}
          maxLength={100}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setAnswer(e.target.value);
            storage.set(
              "draft-" + game!.attempt!.id + "-" + game!.attempt!.position,
              e.target.value,
            );
          }}
          required
        />
        <button
          className="primary"
          disabled={busy || !answer.trim() || !prompt || closed}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <>
              {game!.attempt!.position === 4 ? "See how you did" : "Lock it in"}
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>
      <p className="fine centered">
        Answers lock when submitted. We’ll reveal them after all five.
      </p>
    </div>
  ) : null;
  return (
    <>
      {isLocalPreview && (
        <div className="review-strip">
          <span className="status-dot" /> LOCAL PREVIEW{" "}
          <span className="strip-note">
            A safe place to play. No production data or emails.
          </span>
          <a href="http://127.0.0.1:4000" target="_blank" rel="noreferrer">
            Emulator dashboard <ArrowUpRight size={12} />
          </a>
        </div>
      )}
      <header className="site-header">
        <button className="brand" onClick={home} aria-label="Spell-Bee home">
          <Bee small />
          <span>
            Spell-Bee<span className="brand-dot">.</span>
          </span>
        </button>
        <nav aria-label="Main navigation">
          <button
            aria-pressed={gameMode === "daily"}
            onClick={() => setGameMode("daily")}
          >
            Daily five
          </button>
          <button
            aria-pressed={gameMode === "adventure"}
            onClick={() => setGameMode("adventure")}
          >
            🐝 Adventure
          </button>
          <button onClick={openHistory}>My history</button>
          <button
            className="account-button"
            onClick={() => {
              setEmailLink(undefined);
              setModal("save");
            }}
          >
            <span className="avatar">{(name || "G")[0].toUpperCase()}</span>
            {auth.currentUser && !auth.currentUser.isAnonymous
              ? "My account"
              : "Save my progress"}
            <ArrowUpRight size={14} />
          </button>
        </nav>
      </header>
      <main>
        {!ready ? (
          <section className="loading card">
            <LoaderCircle className="spin" size={30} />
            <h1>Getting your words ready.</h1>
            <p>{error || "Connecting to your game…"}</p>
            <button onClick={() => location.reload()} className="text-button">
              Try again
            </button>
          </section>
        ) : gameMode === "adventure" && auth.currentUser ? (
          <Adventure
            key={auth.currentUser.uid}
            playerId={auth.currentUser.uid}
          />
        ) : (
          <>
            <section className="adventure-invite">
              <span>
                🌼 A whole garden of words awaits. Explore 12 levels, collect
                stars, and grow with friends.
              </span>
              <button
                className="secondary"
                onClick={() => setGameMode("adventure")}
              >
                Play Adventure
              </button>
            </section>
            <div className="page-label">
              {view === "home" ? null : view === "play" ? null : null}
              <span className="issue">
                VOL. 001 /{" "}
                {new Date(now)
                  .toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                  })
                  .toUpperCase()}
              </span>
            </div>
            {error && (
              <div role="alert" className="notice error">
                {error}
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {message && (
              <div role="status" className="notice">
                {message}
                <button
                  aria-label="Dismiss message"
                  onClick={() => setMessage("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {(view === "home" || view === "play") && (
              <>
                <section className="hero-grid">
                  <div className="hero-copy">
                    <h1>
                      A little wordplay.
                      <br />A <em>brighter</em> day.
                    </h1>
                    <div className="hero-facts">
                      <span>
                        <Headphones size={16} /> Listen & spell
                      </span>
                      <span>
                        <Clock size={16} /> A few good minutes
                      </span>
                      <span>
                        <Users size={16} /> Better with friends
                      </span>
                    </div>
                    <div className="bee-trail">
                      <svg aria-hidden="true" viewBox="0 0 200 70">
                        <path
                          d="M0 55c40 0 45-55 85-30s-15 35-10 10 65-40 115-20"
                          fill="none"
                          stroke="#a6a99b"
                          strokeWidth="1.5"
                          strokeDasharray="4 5"
                        />
                      </svg>
                      <Bee />
                    </div>
                  </div>
                  {game?.attempt?.status === "active" ? (
                    spellingCard
                  ) : (
                    <div className="daily-card card">
                      {closed ? (
                        <button
                          className="primary"
                          onClick={() => setView("results")}
                        >
                          See final standings <ArrowRight size={18} />
                        </button>
                      ) : (
                        <p role="status">
                          {error
                            ? "Couldn’t prepare your word."
                            : "Getting your word ready…"}
                          {error && (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={start}
                            >
                              Try again
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </section>
                <section className="below-grid">
                  <div className="friend-card">
                    <div className="friend-icon">
                      <Users size={25} />
                    </div>
                    <div>
                      <button
                        className="secondary friend-create"
                        disabled={busy}
                        onClick={() => createPrivate()}
                      >
                        Invite friend to challenge
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                </section>
                {game?.challenge.kind === "private" && (
                  <section className="share-banner">
                    <div>
                      <strong>Your friend link is ready.</strong>
                      <p>
                        Friends get the same five words. The 24-hour window has
                        started.
                      </p>
                    </div>
                    <button className="secondary" onClick={share}>
                      <Copy size={16} /> Share challenge
                    </button>
                  </section>
                )}
              </>
            )}
            {view === "results" && game && (
              <section className="results-layout">
                <div className="results-heading">
                  <div className="eyebrow">
                    {game.results?.partial
                      ? "TIME’S UP. STILL SOMETHING LEARNED."
                      : "FIVE LITTLE STEPS FOR YOUR MIND."}
                  </div>
                  <h1>{game.results ? "Results" : "Final standings"}</h1>
                </div>
                <div className="results-grid">
                  <div className="answer-card card">
                    {game.attempt && game.attempt.status !== "active" && (
                      <form
                        className="result-name"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(async () => {
                            const updated = await api<GameState>(
                              "setAttemptName",
                              {
                                challengeId: game.challenge.id,
                                displayName: name,
                              },
                            );
                            storage.set("name", name.trim());
                            setGame(updated);
                            setStandings(
                              await api("getStandings", {
                                challengeId: game.challenge.id,
                              }),
                            );
                            setMessage("Your name is saved.");
                          });
                        }}
                      >
                        <label className="field-label" htmlFor="result-name">
                          Your name (optional)
                        </label>
                        <input
                          id="result-name"
                          autoComplete="nickname"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={30}
                          placeholder="Your display name"
                        />
                        <button
                          className="secondary"
                          disabled={busy || !name.trim()}
                        >
                          Save name
                        </button>
                      </form>
                    )}
                    {game.results ? (
                      <>
                        <div className="score-heading">
                          <div>
                            <span className="eyebrow">
                              YOUR {game.results.partial ? "PARTIAL " : ""}
                              RESULT
                            </span>
                            <div className="score">
                              {game.results.score * 20}
                              <span>%</span>
                            </div>
                          </div>
                          <div className="score-flower">
                            {game.results.score === 5 ? "🏆" : "✳"}
                          </div>
                        </div>
                        <p className="round-cheer" role="status">
                          {game.results.score === 5
                            ? "A perfect five. Your bee is buzzing!"
                            : game.results.score >= 3
                              ? "Your spelling wings are getting stronger."
                              : "Every word is a chance to grow. Keep buzzing."}
                        </p>
                        {game.results.score === 5 && (
                          <div className="confetti" aria-hidden="true">
                            {Array.from({ length: 18 }, (_, i) => (
                              <i
                                key={game.attempt?.id + "-" + i}
                                style={{
                                  left: `${i * 5.5}%`,
                                  animationDelay: `${(i % 5) * 0.12}s`,
                                  background: ["#ecb34c", "#43735b", "#d28495"][
                                    i % 3
                                  ],
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <div className="answers animated-answers">
                          {game.results.items.map((item, i) => (
                            <article
                              key={item.word}
                              style={{ animationDelay: `${i * 120}ms` }}
                            >
                              <span
                                className={
                                  "answer-check " +
                                  (item.correct ? "correct" : "incorrect")
                                }
                              >
                                {item.correct ? (
                                  <Check size={17} />
                                ) : (
                                  <X size={16} />
                                )}
                              </span>
                              <div>
                                <div className="answer-word">
                                  {Array.from(item.word).map(
                                    (letter, index) => (
                                      <span
                                        key={index}
                                        className={
                                          !item.correct &&
                                          item.submitted?.toLowerCase()[
                                            index
                                          ] !== letter.toLowerCase()
                                            ? "letter-correction"
                                            : "letter-match"
                                        }
                                      >
                                        {letter}
                                      </span>
                                    ),
                                  )}
                                  {!item.correct && (
                                    <span>
                                      {item.submitted
                                        ? "You wrote “" + item.submitted + "”"
                                        : "Unanswered · 0 points"}
                                    </span>
                                  )}
                                </div>
                                <p>{item.definition}</p>
                                {!item.correct && (
                                  <p className="spelling-note">{item.note}</p>
                                )}
                              </div>
                              <span className="answer-num">0{i + 1}</span>
                            </article>
                          ))}
                        </div>
                        <div className="result-actions">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={share}
                          >
                            Share your {game.results.score * 20}%{" "}
                            <ArrowUpRight size={17} />
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              if (
                                auth.currentUser &&
                                !auth.currentUser.isAnonymous
                              ) {
                                openHistory();
                              } else {
                                setEmailLink(undefined);
                                setModal("save");
                              }
                            }}
                          >
                            <Mail size={16} />{" "}
                            {auth.currentUser && !auth.currentUser.isAnonymous
                              ? "View saved history"
                              : "Save my results"}
                          </button>
                        </div>
                      </>
                    ) : game.attempt ? (
                      <div>
                        <h2>Your answers are saved.</h2>
                        <p>
                          Your score and answers will be revealed when the
                          challenge closes.
                        </p>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={share}
                        >
                          Invite friends <ArrowUpRight size={17} />
                        </button>
                      </div>
                    ) : (
                      <p>No attempt was started for this session.</p>
                    )}
                  </div>
                  <aside>
                    <div className="standings-card card">
                      <span className="eyebrow">THE FRIENDLY LEADERBOARD</span>
                      <h2>
                        {standings?.closed
                          ? "Final standings"
                          : "The suspense is spelling."}
                      </h2>
                      {standings?.closed ? (
                        <ol className="standings">
                          {standings.rows.length ? (
                            standings.rows.map((r: any, i: number) => (
                              <li key={i}>
                                <b>{r.rank}</b>
                                <span>
                                  {r.displayName}
                                  {r.partial && <small>Partial attempt</small>}
                                </span>
                                <strong>{r.score * 20}%</strong>
                              </li>
                            ))
                          ) : (
                            <p>No players joined this challenge.</p>
                          )}
                        </ol>
                      ) : (
                        <>
                          <p>
                            Final standings appear when the challenge closes.
                          </p>
                          <div className="countdown">
                            <Clock size={16} />
                            {hours}h {minutes}m to the final word
                          </div>
                        </>
                      )}
                      {isLocalPreview && !standings?.closed && (
                        <button
                          className="text-button preview-control"
                          onClick={() =>
                            run(async () => {
                              await api("previewClose", {
                                challengeId: game.challenge.id,
                              });
                              setNow(Date.now());
                              setStandings(
                                await api("getStandings", {
                                  challengeId: game.challenge.id,
                                }),
                              );
                            })
                          }
                        >
                          Local preview: close this challenge
                        </button>
                      )}
                    </div>
                    <div className="rematch-card">
                      <button
                        className="rematch-icon"
                        aria-label="Create another round"
                        disabled={busy}
                        onClick={() => createPrivate(true)}
                      >
                        <RotateCcw size={23} />
                      </button>
                      <h3>Another round?</h3>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => createPrivate(true)}
                      >
                        Challenge these friends again <ArrowRight size={15} />
                      </button>
                    </div>
                  </aside>
                </div>
              </section>
            )}
            {auth.currentUser && (
              <RewardHub
                key={auth.currentUser.uid}
                playerId={auth.currentUser.uid}
                game={game}
                standings={standings}
              />
            )}
            <section className="mobile-section">
              <div className="download-buttons">
                <button
                  className="store-badge app-store-badge"
                  aria-label="App Store — iOS app coming soon"
                  onClick={() => {
                    setSubscribed(false);
                    setEmail("");
                    setModal("ios");
                    track("mobile_interest_clicked", "ios");
                  }}
                >
                  <img
                    src="/store-badges/app-store.svg"
                    alt="Download on the App Store"
                  />
                </button>
                <button
                  className="store-badge google-play-badge"
                  aria-label="Google Play — Android app coming soon"
                  onClick={() => {
                    setSubscribed(false);
                    setEmail("");
                    setModal("android");
                    track("mobile_interest_clicked", "android");
                  }}
                >
                  <img
                    src="/store-badges/google-play.png"
                    alt="Get it on Google Play"
                  />
                </button>
              </div>
            </section>
          </>
        )}
      </main>
      <footer>
        <span className="footer-brand">Spell-Bee.</span>
        <div>
          <button onClick={() => setModal("privacy")}>Privacy</button>
          <button onClick={() => setModal("settings")}>Preferences</button>
          <a href="mailto:runtimesquad@gmail.com">
            Say hello <ArrowUpRight size={12} />
          </a>
        </div>
      </footer>
      {ready && !consent && (
        <section className="consent-banner" aria-label="Optional analytics">
          <div>
            <strong>A little insight, only if you’re happy to share.</strong>
            <p>
              Optional analytics helps us improve the game. You can play either
              way.
            </p>
          </div>
          <div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => chooseConsent("decline")}
            >
              Decline
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => chooseConsent("allow")}
            >
              Allow analytics
            </button>
          </div>
        </section>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pendingEmailLink())
              setModal(null);
          }}
        >
          <section
            ref={modalRef}
            className={"modal " + (modal === "privacy" ? "privacy-modal" : "")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="close-modal"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            <div className="eyebrow">
              SPELL-BEE /{" "}
              {modal === "privacy"
                ? "PRIVACY"
                : modal === "history"
                  ? "YOUR HISTORY"
                  : "A LITTLE MORE"}
            </div>
            <h2 id="modal-title">{modalTitle}</h2>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            {(modal === "ios" || modal === "android") &&
              (subscribed ? (
                <>
                  <div className="success-circle">
                    <Check size={25} />
                  </div>
                  <p>
                    You’re on the list. We’ll use your email for this launch
                    notification only.
                  </p>
                  <button className="primary" onClick={() => setModal(null)}>
                    Sounds good <Check size={17} />
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const r = await api("launchSignup", {
                        email,
                        platform: modal,
                        consent: true,
                      });
                      const next = [...withdrawTokens, r.withdrawalToken];
                      setWithdrawTokens(next);
                      storage.set("withdrawals", JSON.stringify(next));
                      setSubscribed(true);
                    });
                  }}
                >
                  <p>
                    Enter your email if you’d like us to notify you when it
                    launches.
                  </p>
                  <label className="field-label" htmlFor="notify-email">
                    Email address
                  </label>
                  <input
                    id="notify-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <button className="primary" disabled={busy}>
                    Notify me <ArrowRight size={16} />
                  </button>
                  <p className="fine">
                    We’ll use your email for this launch notification. No
                    newsletters. Remove it anytime in Preferences.{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setModal("privacy")}
                    >
                      Privacy policy
                    </button>
                  </p>
                  <button
                    type="button"
                    className="text-button centered block"
                    onClick={() => setModal(null)}
                  >
                    No thanks
                  </button>
                </form>
              ))}
            {modal === "save" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    if (pendingEmailLink()) {
                      await completeSaveLink(email);
                      setModal(null);
                      setMessage(
                        "Your account is connected. Your progress is yours to keep.",
                      );
                      if (game)
                        accept(
                          await api("getChallenge", {
                            challengeId: game.challenge.id,
                          }),
                          true,
                        );
                      else accept(await api("getDailyChallenge"));
                    } else {
                      setEmailLink(await sendSaveLink(email));
                      setMessage(
                        "Local sign-in link is ready. No real email was sent.",
                      );
                    }
                  });
                }}
              >
                <p>
                  {pendingEmailLink()
                    ? "Confirm your email to finish saving your progress."
                    : auth.currentUser && !auth.currentUser.isAnonymous
                      ? "You’re signed in. Your game history stays with your account."
                      : "Finish as a guest. Save whenever you’re ready—with an email link, no password."}
                </p>
                <label className="field-label" htmlFor="save-email">
                  Email address
                </label>
                <input
                  id="save-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button className="primary" disabled={busy}>
                  {pendingEmailLink()
                    ? "Finish signing in"
                    : "Send me a sign-in link"}
                  <ArrowRight size={16} />
                </button>
                {emailLink && (
                  <a className="local-link" href={emailLink}>
                    Open local sign-in link <ArrowUpRight size={15} />
                  </a>
                )}
                <p className="fine">
                  Saving your account doesn’t subscribe you to launch
                  notifications.
                </p>
              </form>
            )}
            {modal === "history" && (
              <div className="history-list">
                {historyRows.length ? (
                  historyRows.map((h, i) => (
                    <button
                      key={i}
                      className="history-row"
                      disabled={h.expiredLink}
                      onClick={() =>
                        run(async () => {
                          const s = await api("getChallenge", {
                            challengeId: h.challengeId,
                          });
                          history.pushState({}, "", `/c/${h.challengeId}`);
                          setModal(null);
                          setGameMode("daily");
                          accept(s, true);
                        })
                      }
                    >
                      <span>
                        <strong>
                          {h.kind === "daily"
                            ? "Daily five"
                            : "Friend challenge"}
                        </strong>
                        <small>
                          {localDate(h.startedAt)} · {h.status}
                          {!h.ranked ? " · unranked history" : ""}
                        </small>
                      </span>
                      <b>
                        {h.score === null
                          ? h.status === "active"
                            ? "In progress"
                            : "Awaiting closure"
                          : h.score * 20 + "%"}
                      </b>
                    </button>
                  ))
                ) : (
                  <p>
                    Your first five words are waiting. Play a round to begin
                    your story.
                  </p>
                )}
              </div>
            )}
            {modal === "settings" && (
              <>
                <p>
                  Play your way. Optional choices are separate from your game
                  account.
                </p>
                <div className="preference">
                  <strong>Optional analytics</strong>
                  <span>{consent === "allow" ? "Allowed" : "Not allowed"}</span>
                </div>
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => chooseConsent("allow")}
                  >
                    Allow analytics
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => chooseConsent("decline")}
                  >
                    Decline analytics
                  </button>
                </div>
                <p className="fine">
                  {isLocalPreview
                    ? "This preview records consented events only in local emulators."
                    : "Analytics measures visits, repeat play, game progress and sharing only after you allow it. Reports cover consenting visitors."}
                </p>
                <div className="preference">
                  <strong>Launch notifications</strong>
                  <span>
                    {withdrawTokens.length
                      ? "Signup saved on this browser"
                      : "No saved signup"}
                  </span>
                </div>
                {withdrawTokens.length > 0 && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        for (const token of withdrawTokens)
                          await api("withdrawSignup", { token });
                        setWithdrawTokens([]);
                        storage.set("withdrawals", "[]");
                        setMessage("Launch-notification signups removed.");
                      })
                    }
                  >
                    Withdraw my launch requests
                  </button>
                )}
                {auth.currentUser && !auth.currentUser.isAnonymous && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await resetIdentity();
                        history.pushState({}, "", "/");
                        setGame(await api("getDailyChallenge"));
                        setStandings(null);
                        setView("home");
                        setModal(null);
                        setMessage(
                          "Signed out. You can keep playing as a guest.",
                        );
                      })
                    }
                  >
                    Sign out
                  </button>
                )}
                <div className="danger-zone">
                  <h3>
                    {auth.currentUser?.isAnonymous
                      ? "Clear my guest data"
                      : "Delete my account and data"}
                  </h3>
                  <p>
                    Disable this identity and queue deletion from live systems
                    within seven days.
                  </p>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Remove this identity and its game data? This cannot be undone.",
                        )
                      )
                        run(async () => {
                          await api("requestDeletion");
                          localStorage.removeItem(
                            "spellbee-rewards-" + auth.currentUser?.uid,
                          );
                          localStorage.removeItem(
                            "spellbee-adventure-" + auth.currentUser?.uid,
                          );
                          await resetIdentity();
                          setModal(null);
                          setGame(await api("getDailyChallenge"));
                          setView("home");
                          setMessage(
                            "Your old identity is disabled and its deletion is queued. You have a fresh guest session.",
                          );
                        });
                    }}
                  >
                    Delete my game data
                  </button>
                </div>
              </>
            )}
            {modal === "privacy" && <Privacy />}
          </section>
        </div>
      )}
    </>
  );
}
function Privacy() {
  return (
    <div className="privacy-content">
      <p className="fine">
        {isLocalPreview
          ? "Local review edition · October 29, 2026. Test data is stored in local Firebase emulators."
          : "Spell-Bee privacy notice · Effective October 29, 2026."}
      </p>
      <h3>Your game</h3>
      <p>
        We use a guest identifier, display name, answers, scores, and progress
        to run the game. Email-link accounts optionally save your history.
        Spell-Bee is intended for ages 13+ in the United States.
      </p>
      <h3>Adventure and teams</h3>
      <p>
        Adventure progress, boosters, and cosmetic rewards are stored on this
        browser for each player. Weekly teams store team names, membership, and
        correct-word contributions to show a shared total. Anyone with an invite
        code can join. Team records expire after 90 days; weekly contributions
        expire after two weeks. Account deletion also clears this browser’s
        adventure progress and queues membership and contribution deletion.
      </p>
      <h3>Your choices</h3>
      <p>
        Optional analytics is off until you allow it. Declining never blocks
        play. Change your choice in Preferences. Launch email requests are
        optional, platform-specific, and separate from accounts and analytics.
        No newsletters or unrelated marketing.
      </p>
      <h3>Challenge links last 90 days</h3>
      <p>
        Anyone with the link can open a challenge. Final standings show display
        names and scores after closure. Links and shared standings expire 90
        days after closure; afterward they show “This challenge has expired.”
        Your own saved history may remain without other players’ identities.
      </p>
      <h3>Approved retention policy</h3>
      <ul>
        <li>
          Accounts/history: while active; delete after 24 months of inactivity
          with a 30-day email warning.
        </li>
        <li>Unlinked guests: 90 days of inactivity.</li>
        <li>
          Google Analytics user/event setting: two months, activity reset off.
          Aggregated reports have different retention.
        </li>
        <li>Our raw analytics/referrals: 60 days.</li>
        <li>
          Launch signups: 30 days after the requested launch notice or 12 months
          after signup, whichever is earlier.
        </li>
        <li>Operational logs: 30 days. Backups: seven days.</li>
      </ul>
      <h3>Deletion and withdrawal</h3>
      <p>
        Use Preferences to withdraw launch requests, change analytics consent,
        or request deletion of game data. Account deletion requires proof of
        ownership. Hide identifying information immediately and complete live
        cleanup within seven days; old backup copies can remain seven more days.
        Reapply deletion instructions before restoring data.
      </p>
      <p>
        Analytics withdrawal stops future optional collection; deletion of
        historical identifiable analytics data is a separate request. Contact{" "}
        <a href="mailto:runtimesquad@gmail.com">runtimesquad@gmail.com</a> for
        help.
      </p>
      <h3>Emails and service operation</h3>
      <p>
        Firebase sends requested account sign-in emails. Launch notifications
        are not sent until the relevant app launches. Inactivity warnings are
        sent through a monitored operator workflow; account inactivity deletion
        waits until delivery is confirmed and at least 30 days have passed.
        Provider-required audit/security logs can have separate retention.
      </p>
      <p>
        The first release uses audio prompts and does not yet offer a
        hearing-accessible mode. Contact runtimesquad@gmail.com for privacy,
        deletion, or support requests.
      </p>
    </div>
  );
}
