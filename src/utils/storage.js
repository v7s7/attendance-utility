import { useEffect, useState } from "react";

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// useState that survives a page reload in this browser. If storage is blocked
// (private window, policy) it still works, it just forgets on reload.
export function useStoredState(key, fallback, fix = (v) => v) {
  const [value, setValue] = useState(() => fix(load(key, fallback)));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage blocked; keep the value in memory only
    }
  }, [key, value]);

  return [value, setValue];
}
