// Where the app reads from. The same pages run on the chain and on the local rehearsal (demo.ts), so a page never
// knows which one it is looking at.
import {
  nowSec, readActivity, readChanges, readKeepers, readList, readPosition, readProfile, readPulse, readStats, readVow, readVowsOf,
  type Changes, type FeedEntry, type Position, type Profile, type Pulse, type Stats, type Vow,
} from "./chain";

export interface Source {
  readonly kind: "chain" | "demo";
  now(): number;
  pulse(): Promise<Pulse>;
  stats(): Promise<Stats>;
  list(offset: number, limit: number): Promise<Vow[]>;
  vow(id: number): Promise<Vow>;
  changes(cursor: number): Promise<Changes>;
  activity(offset: number, limit: number): Promise<FeedEntry[]>;
  keepers(offset: number, limit: number): Promise<{ total: number; rows: Profile[] }>;
  profile(who: string): Promise<Profile>;
  vowsOf(who: string, cursor: number, limit: number): Promise<{ rows: Vow[]; next: number }>;
  position(id: number, who: string): Promise<Position>;
}

export const chainSource: Source = {
  kind: "chain",
  now: nowSec,
  pulse: readPulse,
  stats: readStats,
  list: readList,
  vow: readVow,
  changes: readChanges,
  activity: readActivity,
  keepers: readKeepers,
  profile: readProfile,
  vowsOf: readVowsOf,
  position: readPosition,
};
