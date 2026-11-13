import { createContext, useContext, useSyncExternalStore } from "react";
import { chainSource, type Source } from "./source";
import type { Sync, SyncState } from "./sync";

export const SourceContext = createContext<Source>(chainSource);
export const useSource = () => useContext(SourceContext);

export const SyncContext = createContext<Sync | null>(null);
export function useSync(): Sync {
  const s = useContext(SyncContext);
  if (!s) throw new Error("No sync in scope");
  return s;
}
export function useVows(): SyncState {
  const sync = useSync();
  return useSyncExternalStore(sync.subscribe, sync.get);
}

// What a page needs to act on the chain without knowing how: who is connected, how to send a call, how to tell the person.
export type Actions = {
  me: string | null;
  demo: boolean;
  act: (busy: string, done: string, fn: string, args: unknown[], value?: bigint) => Promise<void>;
  connect: () => void;
  notice: (msg: string) => void;
  invalid: (msg: string) => void;
};
export const ActionsContext = createContext<Actions | null>(null);
export function useActions(): Actions {
  const a = useContext(ActionsContext);
  if (!a) throw new Error("No actions in scope");
  return a;
}
