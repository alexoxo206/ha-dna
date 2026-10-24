export type LayerId =
  | "kick"
  | "hatClosed"
  | "hatOpen"
  | "clap"
  | "crashHa"
  | "ride"
  | "shaker";

export type PatternId = "classic" | "femDip" | "hats" | "allure";

export type StepMap = Record<LayerId, number[]>;

export const PATTERN_META: Record<
  PatternId,
  { label: string; blurb: string }
> = {
  classic: {
    label: "Classic Ha",
    blurb: "Kick four-on-the-floor, hats on the ands, crash + HA on 4",
  },
  femDip: {
    label: "Fem Dip",
    blurb: "Hat chatter into the dip. Crash on 4 is the floor cue",
  },
  hats: {
    label: "Ha Layer",
    blurb: "Hats, shaker, crash + HA on 4 — sits on top of a full song",
  },
  allure: {
    label: "Allure",
    blurb: "Harder ha. Pickup crash into 4, extra claps, 16th hats into the dip",
  },
};

const z = (n: number) => Array.from({ length: n }, () => 0);

function steps(hits: Partial<Record<LayerId, number[]>>): StepMap {
  const empty = z(16);
  return {
    kick: hits.kick ?? empty,
    hatClosed: hits.hatClosed ?? empty,
    hatOpen: hits.hatOpen ?? empty,
    clap: hits.clap ?? empty,
    crashHa: hits.crashHa ?? empty,
    ride: hits.ride ?? empty,
    shaker: hits.shaker ?? empty,
  };
}

export const PATTERNS: Record<PatternId, StepMap> = {
  classic: steps({
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hatClosed: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    hatOpen: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    crashHa: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    shaker: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  }),
  femDip: steps({
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0],
    hatClosed: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    hatOpen: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    crashHa: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    ride: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    shaker: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
  }),
  hats: steps({
    hatClosed: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    hatOpen: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    crashHa: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    shaker: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
  }),
  allure: steps({
    kick: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hatClosed: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1],
    hatOpen: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    crashHa: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    ride: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    shaker: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  }),
};

export const LAYER_LABELS: Record<LayerId, string> = {
  kick: "Kick",
  hatClosed: "Closed hat",
  hatOpen: "Open hat",
  clap: "Clap",
  crashHa: "Crash + HA",
  ride: "Ride",
  shaker: "Shaker",
};
