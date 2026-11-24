export const DAY = 86_400_000;
export const CHALLENGE_LIFETIME = 90 * DAY;
export function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}
export function scoreAnswers(answers: { correct: boolean }[]) {
  return answers.reduce((n, a) => n + Number(a.correct), 0);
}
export function dailyWindow(now: number) {
  const date = new Date(now).toISOString().slice(0, 10);
  const opensAt = Date.parse(date + "T00:00:00.000Z");
  return { date, opensAt, closesAt: opensAt + DAY };
}
export function rankScores<T extends { score: number }>(rows: T[]) {
  let previous: number | undefined,
    rank = 0;
  return [...rows]
    .sort((a, b) => b.score - a.score)
    .map((row, index) => {
      if (row.score !== previous) rank = index + 1;
      previous = row.score;
      return { ...row, rank };
    });
}
export function addMonths(time: number, months: number) {
  const d = new Date(time);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}
export function assertLocalEnvironment(env: NodeJS.ProcessEnv) {
  if (
    env.FUNCTIONS_EMULATOR !== "true" ||
    env.GCLOUD_PROJECT !== "demo-spell-bee" ||
    !/^127\.0\.0\.1:\d+$/.test(env.FIRESTORE_EMULATOR_HOST || "") ||
    !/^127\.0\.0\.1:\d+$/.test(env.FIREBASE_AUTH_EMULATOR_HOST || "")
  )
    throw Error(
      "Local preview only: Firebase emulators and demo-spell-bee required. Production execution is disabled.",
    );
}
