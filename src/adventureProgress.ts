export type Booster = "slow" | "letter" | "hint";
export type BoosterInventory = Record<Booster, number>;
export const chestBoosters: BoosterInventory = {
  slow: 2,
  letter: 2,
  hint: 2,
};
export const starterBoosters = (): BoosterInventory => ({
  slow: 0,
  letter: 0,
  hint: 0,
});
export type AdventureWord = { word: string; definition: string; hint: string };
export type AdventureLevel = {
  id: number;
  world: string;
  words: AdventureWord[];
};
export type ChestPrize =
  | { kind: Booster; amount: number; label: string }
  | { kind: "accessory"; accessory: number; label: string };
export type AdventureProgress = {
  ownedAccessories?: number[];
  lastChestPrize?: ChestPrize;
  boosters: BoosterInventory;
  boosterVersion?: number;
  best: Record<string, number>;
  honey: number;
  opened: number;
  accessory: number;
  active: null | {
    level: number;
    answers: string[];
    boosts: string[];
    draft: string;
    feedback?: boolean | null;
  };
  pending: { level: number; answers: string[] }[];
};
export const newAdventure = (): AdventureProgress => ({
  ownedAccessories: [],
  boosters: starterBoosters(),
  boosterVersion: 2,
  best: {},
  honey: 0,
  opened: 0,
  accessory: 0,
  active: null,
  pending: [],
});
export const starsFor = (score: number) => score;
export function completeAdventure(
  data: AdventureProgress,
  level: number,
  answers: string[],
  words: AdventureWord[],
) {
  const score = answers.reduce(
    (sum, answer, i) =>
      sum + Number(answer.trim().toLowerCase() === words[i].word),
    0,
  );
  const previous = data.best[level];
  const earned =
    (previous === undefined ? 10 : 0) +
    Math.max(0, score - (previous ?? 0)) * 5;
  return {
    score,
    earned,
    progress: {
      ...data,
      best: { ...data.best, [level]: Math.max(previous ?? 0, score) },
      honey: data.honey + earned,
      active: null,
      pending: [...data.pending, { level, answers }],
    },
  };
}
export const levelUnlocked = (data: AdventureProgress, level: number) =>
  level === 1 || data.best[level - 1] !== undefined;

export function restoreAdventure(data: AdventureProgress): AdventureProgress {
  if (data.boosters && data.boosterVersion === 2)
    return {
      ...data,
      ownedAccessories:
        data.ownedAccessories ??
        Array.from({ length: Math.min(data.opened, 4) }, (_, i) => i + 1),
    };
  const boosters = starterBoosters();
  for (const kind of Object.keys(boosters) as Booster[]) {
    const earned = data.opened * chestBoosters[kind];
    boosters[kind] = data.boosters
      ? Math.min(data.boosters[kind] ?? 0, earned)
      : earned;
  }
  return {
    ...data,
    boosters,
    boosterVersion: 2,
    ownedAccessories:
      data.ownedAccessories ??
      Array.from({ length: Math.min(data.opened, 4) }, (_, i) => i + 1),
  };
}
export function chooseChestPrize(
  data: AdventureProgress,
  random = Math.random,
): ChestPrize {
  const prizes: ChestPrize[] = [
    { kind: "slow", amount: 2, label: "2 slow replays" },
    { kind: "letter", amount: 2, label: "2 letter reveals" },
    { kind: "hint", amount: 2, label: "2 spelling hints" },
  ];
  const names = ["Daisy crown", "Honey bow", "Sparkle wings", "Garden crown"];
  for (let i = 0; i < names.length; i++)
    if (!data.ownedAccessories?.includes(i + 1))
      prizes.push({ kind: "accessory", accessory: i + 1, label: names[i] });
  return prizes[
    Math.min(
      prizes.length - 1,
      Math.max(0, Math.floor(random() * prizes.length)),
    )
  ];
}
export function claimAdventureChest(
  data: AdventureProgress,
  prize = chooseChestPrize(data),
): AdventureProgress {
  if (data.opened >= 4 || data.honey < (data.opened + 1) * 100) return data;
  const boosters = { ...data.boosters };
  const ownedAccessories = [...(data.ownedAccessories || [])];
  if (prize.kind === "accessory") {
    if (ownedAccessories.includes(prize.accessory)) return data;
    ownedAccessories.push(prize.accessory);
  } else boosters[prize.kind] += prize.amount;
  return {
    ...data,
    boosters,
    ownedAccessories,
    lastChestPrize: prize,
    opened: data.opened + 1,
    accessory: prize.kind === "accessory" ? prize.accessory : data.accessory,
  };
}
export function spendBooster(
  data: AdventureProgress,
  kind: Booster,
): AdventureProgress {
  if (data.boosters[kind] <= 0) return data;
  return {
    ...data,
    boosters: { ...data.boosters, [kind]: data.boosters[kind] - 1 },
  };
}
