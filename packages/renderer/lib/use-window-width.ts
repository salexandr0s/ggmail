import { useSyncExternalStore } from "react";

function subscribe(update: () => void) {
  window.addEventListener("resize", update);
  return () => window.removeEventListener("resize", update);
}

export function useWindowWidthValue(measure: (width: number) => number) {
  return useSyncExternalStore(subscribe, () => measure(window.innerWidth));
}
