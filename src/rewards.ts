import type { GameState } from "./api";
export type Word = NonNullable<GameState["results"]>["items"][number];
export type Rewards = {
  rounds: Record<string, { day: string; daily: boolean; score: number }>;
  words: Record<string, Word>;
  mastered: string[];
  outfit: string;
  rivals: Record<
    string,
    { name: string; wins: number; draws: number; losses: number }
  >;
  matches: string[];
};
export const emptyRewards = (): Rewards => ({
  rounds: {},
  words: {},
  mastered: [],
  outfit: "classic",
  rivals: {},
  matches: [],
});
export function recordRound(
  previous: Rewards,
  game: GameState,
  day: string,
): Rewards {
  if (!game.results || !game.attempt) return previous;
  const next = structuredClone(previous);
  next.rounds[game.attempt.id] = {
    day,
    daily: game.challenge.kind === "daily",
    score: game.results.score,
  };
  for (const item of game.results.items) {
    next.words[item.word] = item;
    if (item.correct && !next.mastered.includes(item.word))
      next.mastered.push(item.word);
  }
  return next;
}
export function rewardStats(data: Rewards, today: string) {
  const rounds = Object.values(data.rounds);
  const days = new Set(rounds.filter((r) => r.daily).map((r) => r.day));
  let cursor = Date.parse(today + "T00:00:00Z");
  if (!days.has(today)) cursor -= 86400000;
  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak++;
    cursor -= 86400000;
  }
  const correct = rounds.reduce((n, r) => n + r.score, 0);
  return {
    streak,
    rounds: rounds.length,
    accuracy: rounds.length
      ? Math.round((correct / (rounds.length * 5)) * 100)
      : 0,
    perfect: rounds.some((r) => r.score === 5),
    challenges: rounds.filter((r) => !r.daily).length,
    best: Math.max(0, ...rounds.map((r) => r.score)),
    xp: rounds.length * 10 + correct * 5,
  };
}
