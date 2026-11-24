// A separate, public learning collection. Never drawn from ranked challenges.
export const adventureWorlds = [
  {
    name: "Flower Fields",
    icon: "🌼",
    color: "meadow",
    description: "Find your wings with familiar words.",
    levels: [
      [
        [
          "sun",
          "The bright star that lights our day.",
          "Think of a sunny morning.",
        ],
        ["bee", "An insect that makes honey.", "It rhymes with tree."],
        ["leaf", "A flat green part of a plant.", "It starts with l."],
        ["nest", "A home built by a bird.", "It rhymes with best."],
        ["pond", "A small body of still water.", "It rhymes with bond."],
      ],
      [
        ["bloom", "To open into a flower.", "There are two o letters."],
        ["honey", "A sweet food made by bees.", "It ends with ey."],
        [
          "petal",
          "One of the colorful parts of a flower.",
          "It starts with pet.",
        ],
        [
          "grass",
          "Low green plants that cover a lawn.",
          "The final s is doubled.",
        ],
        [
          "cloud",
          "A visible mass of tiny water drops in the sky.",
          "It starts with cl.",
        ],
      ],
      [
        [
          "garden",
          "A place where flowers or vegetables are grown.",
          "It ends with den.",
        ],
        [
          "flower",
          "The colorful part of a plant that makes seeds.",
          "Think flow, then er.",
        ],
        ["yellow", "The color of a ripe lemon.", "Double the l."],
        ["spring", "The season after winter.", "It begins with spr."],
        ["breeze", "A gentle wind.", "Use two e letters."],
      ],
      [
        ["rabbit", "A small animal with long ears.", "Double the b."],
        ["meadow", "A field of grass and wildflowers.", "It ends with dow."],
        [
          "branch",
          "A woody part that grows out from a tree trunk.",
          "It starts with br.",
        ],
        ["pollen", "A fine powder made by flowers.", "Double the l."],
        [
          "sunset",
          "The time when the sun disappears below the horizon.",
          "Join sun and set.",
        ],
      ],
    ],
  },
  {
    name: "Honey Hollow",
    icon: "🍯",
    color: "honey",
    description: "Follow the honey trail to trickier spellings.",
    levels: [
      [
        ["nectar", "A sweet liquid found in flowers.", "It ends with tar."],
        ["orchard", "Land planted with fruit trees.", "It begins with orch."],
        ["harvest", "To gather a crop when it is ready.", "It ends with vest."],
        ["blossom", "A flower on a tree or bush.", "Double the s."],
        [
          "shelter",
          "A place that protects from bad weather.",
          "It starts with shel.",
        ],
      ],
      [
        ["journey", "A trip from one place to another.", "It ends with ney."],
        ["curious", "Eager to learn or know more.", "It ends with ious."],
        ["whisper", "To speak very softly.", "Begin with wh."],
        [
          "sunshine",
          "Light that comes directly from the sun.",
          "Join sun and shine.",
        ],
        [
          "treasure",
          "Something valuable that is carefully kept.",
          "It begins with trea.",
        ],
      ],
      [
        [
          "honeycomb",
          "A structure of wax cells built by bees.",
          "Join honey and comb.",
        ],
        [
          "butterfly",
          "An insect with large colorful wings.",
          "Join butter and fly.",
        ],
        ["beautiful", "Very pleasing to look at.", "Begin with beau."],
        ["woodland", "Land covered with trees.", "Join wood and land."],
        ["fragrant", "Having a pleasant smell.", "It ends with grant."],
      ],
      [
        [
          "adventure",
          "An exciting or unusual experience.",
          "It begins with adven.",
        ],
        [
          "discovery",
          "The act of finding something new.",
          "It ends with very.",
        ],
        ["delicious", "Very pleasant to taste.", "It ends with cious."],
        [
          "hibernate",
          "To spend winter in a resting state.",
          "It starts with hiber.",
        ],
        [
          "wildflower",
          "A flower growing without being planted by people.",
          "Join wild and flower.",
        ],
      ],
    ],
  },
  {
    name: "Royal Gardens",
    icon: "👑",
    color: "royal",
    description: "Let your confidence bloom with a royal challenge.",
    levels: [
      [
        [
          "pollinate",
          "To carry pollen so a plant can make seeds.",
          "Double the l.",
        ],
        [
          "chrysalis",
          "The stage between a caterpillar and a butterfly.",
          "Begin with chry.",
        ],
        ["perennial", "A plant that lives for several years.", "Double the n."],
        [
          "botanical",
          "Relating to the study of plants.",
          "It begins with botan.",
        ],
        [
          "ecosystem",
          "Living things and their shared environment.",
          "Join eco and system.",
        ],
      ],
      [
        [
          "camouflage",
          "A disguise that helps something blend into its surroundings.",
          "It ends with flage.",
        ],
        [
          "iridescent",
          "Showing shifting rainbow colors in the light.",
          "It ends with scent.",
        ],
        [
          "flourishing",
          "Growing strongly and successfully.",
          "Begin with flour.",
        ],
        ["magnificent", "Very grand or impressive.", "It begins with magni."],
        [
          "metamorphosis",
          "A major change in an animal’s form as it grows.",
          "It begins with meta.",
        ],
      ],
      [
        [
          "photosynthesis",
          "The process by which plants use light to make food.",
          "Join photo and synthesis.",
        ],
        [
          "biodiversity",
          "The variety of living things in an environment.",
          "Join bio and diversity.",
        ],
        [
          "horticulture",
          "The art of growing gardens.",
          "It begins with horti.",
        ],
        [
          "conservation",
          "The protection of nature and resources.",
          "It ends with vation.",
        ],
        [
          "environment",
          "The surroundings in which something lives.",
          "Keep the n before ment.",
        ],
      ],
      [
        [
          "resilience",
          "The ability to recover after a difficulty.",
          "It ends with ience.",
        ],
        [
          "extraordinary",
          "Very unusual or remarkable.",
          "Join extra and ordinary.",
        ],
        [
          "perseverance",
          "Continuing to try despite difficulty.",
          "It ends with ance.",
        ],
        ["effervescent", "Bubbly and full of energy.", "Double the f."],
        [
          "accomplishment",
          "Something successfully achieved through effort.",
          "Double the c.",
        ],
      ],
    ],
  },
];
export const adventureLevels = adventureWorlds.flatMap((world, worldIndex) =>
  world.levels.map((words, index) => ({
    id: worldIndex * 4 + index + 1,
    world: world.name,
    words: words.map(([word, definition, hint]) => ({
      word,
      definition,
      hint,
    })),
  })),
);
export function adventureStars(score: number) {
  return score;
}
export function weekStart(now = Date.now()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function correctAdventurePositions(
  level: number,
  answers: unknown,
): number[] {
  const entry = adventureLevels.find((l) => l.id === level);
  if (
    !entry ||
    !Array.isArray(answers) ||
    answers.length !== 5 ||
    answers.some((a) => typeof a !== "string" || a.length > 100)
  )
    throw Error("Finish a five-word adventure level first.");
  return entry.words.flatMap((w, i) =>
    answers[i].trim().toLowerCase() === w.word ? [i] : [],
  );
}
