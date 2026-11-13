import { useSyncExternalStore } from "react";
import { nowSec } from "./chain";

// One shared one-second clock. Only components that call useNow() re-render each second, not the whole app, and the
// timer only runs while one of them is mounted and the tab is visible.
let listeners = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let value = nowSec();
const subs = new Set<() => void>();

function start() {
  if (timer || listeners === 0) return;
  timer = setInterval(() => {
    if (document.hidden) return;
    value = nowSec();
    subs.forEach((f) => f());
  }, 1000);
}

function subscribe(f: () => void) {
  subs.add(f);
  listeners += 1;
  value = nowSec();
  start();
  return () => {
    subs.delete(f);
    listeners -= 1;
    if (listeners === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export const useNow = (): number => useSyncExternalStore(subscribe, () => value);
