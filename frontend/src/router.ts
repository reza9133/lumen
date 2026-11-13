import { useEffect, useState } from "react";

export type Route =
  | { name: "home"; vow: number | null }
  | { name: "vow"; id: number }
  | { name: "keepers" }
  | { name: "keeper"; address: string }
  | { name: "activity" }
  | { name: "protocol" }
  | { name: "pulse" }
  | { name: "space" };

const ADDR = /^0x[0-9a-fA-F]{40}$/;

// "#/keepers", "#/keeper/0x…", "#/vow/12" and the older "#vow=12" (a vow open over the sky).
export function parseHash(hash: string): Route {
  const old = /^#vow=(\d+)$/.exec(hash);
  if (old) return { name: "home", vow: Number(old[1]) };
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  switch (parts[0]) {
    case "vow":
      return /^\d+$/.test(parts[1] ?? "") ? { name: "vow", id: Number(parts[1]) } : { name: "home", vow: null };
    case "keepers":
      return { name: "keepers" };
    case "keeper":
      return ADDR.test(parts[1] ?? "") ? { name: "keeper", address: parts[1].toLowerCase() } : { name: "keepers" };
    case "activity":
      return { name: "activity" };
    case "protocol":
      return { name: "protocol" };
    case "pulse":
      return { name: "pulse" };
    case "space":
      return { name: "space" };
    default:
      return { name: "home", vow: null };
  }
}

export const href = {
  home: "#/",
  vow: (id: number) => `#/vow/${id}`,
  keepers: "#/keepers",
  keeper: (a: string) => `#/keeper/${a.toLowerCase()}`,
  activity: "#/activity",
  protocol: "#/protocol",
  pulse: "#/pulse",
  space: "#/space",
};

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}
