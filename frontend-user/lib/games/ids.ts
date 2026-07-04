// ID mapping + per-game metadata (spec §7) — single source of truth on the
// client. UI id (route slug) ≠ GameSettings key. The API accepts the UI id.

export type GameUiId =
  | "updown"
  | "btcupdown"
  | "niftynumber"
  | "btcnumber"
  | "niftybracket"
  | "niftyjackpot"
  | "btcjackpot";

export const SETTINGS_KEY: Record<GameUiId, string> = {
  updown: "niftyUpDown",
  btcupdown: "btcUpDown",
  niftynumber: "niftyNumber",
  btcnumber: "btcNumber",
  niftybracket: "niftyBracket",
  niftyjackpot: "niftyJackpot",
  btcjackpot: "btcJackpot",
};

export type Mechanic = "updown" | "number" | "bracket" | "jackpot";
export type Asset = "NIFTY" | "BTC";

export interface GameMeta {
  id: GameUiId;
  title: string;
  asset: Asset;
  mechanic: Mechanic;
  blurb: string;
}

export const GAME_META: Record<GameUiId, GameMeta> = {
  updown: { id: "updown", title: "Nifty Up / Down", asset: "NIFTY", mechanic: "updown", blurb: "Predict the next 15-min move" },
  btcupdown: { id: "btcupdown", title: "BTC Up / Down", asset: "BTC", mechanic: "updown", blurb: "24×7 Bitcoin 15-min rounds" },
  niftynumber: { id: "niftynumber", title: "Nifty Number", asset: "NIFTY", mechanic: "number", blurb: "Guess the closing decimals" },
  btcnumber: { id: "btcnumber", title: "BTC Number", asset: "BTC", mechanic: "number", blurb: "Guess the last two digits" },
  niftybracket: { id: "niftybracket", title: "Nifty Bracket", asset: "NIFTY", mechanic: "bracket", blurb: "Buy / Sell the band" },
  niftyjackpot: { id: "niftyjackpot", title: "Nifty Jackpot", asset: "NIFTY", mechanic: "jackpot", blurb: "Predict the price, top the pool" },
  btcjackpot: { id: "btcjackpot", title: "BTC Jackpot", asset: "BTC", mechanic: "jackpot", blurb: "Predict BTC, split the bank" },
};

export const ALL_GAME_IDS: GameUiId[] = Object.keys(GAME_META) as GameUiId[];

export function isGameUiId(x: string): x is GameUiId {
  return x in GAME_META;
}

export function settingsKey(id: GameUiId): string {
  return SETTINGS_KEY[id];
}
