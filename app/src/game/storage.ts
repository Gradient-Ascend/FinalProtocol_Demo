/**
 * storage.ts — localStorage persistence (settings, loadout, the run and the log the reset did not reach).
 * Browser-local storage: doesn't sync across devices, and clearing browser data loses it — state this to the user on delivery.
 *
 * Every value is stored as JSON under the "fp." prefix. Nothing read here is trusted:
 * callers sanitise what they get (a stored value can be stale, hand-edited or from an older build).
 */

const PREFIX = "fp.";

// Builds before the story update wrote these three keys under "game.". They are moved
// across once, the first time storage is touched, and the old keys are removed.
const LEGACY_PREFIX = "game.";
const LEGACY_KEYS = ["loadout", "muted", "reducedMotion"] as const;

let migrated = false;

// The old mute key was written by two modules in two encodings: JSON true/false by the
// battle store and "1"/"0" by the audio system, each misreading the other's. Both are
// accepted here; from now on there is one writer's encoding, JSON.
function legacyValue(key: (typeof LEGACY_KEYS)[number], raw: string): string | null {
  if (key === "loadout") return raw;
  if (raw === "true" || raw === "1") return "true";
  if (raw === "false" || raw === "0") return "false";
  return null;
}

function migrate(): void {
  if (migrated) return;
  migrated = true;
  try {
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(LEGACY_PREFIX + key);
      if (raw === null) continue;
      // A value already saved under the new prefix is newer: it wins.
      if (localStorage.getItem(PREFIX + key) === null) {
        const value = legacyValue(key, raw);
        if (value !== null) localStorage.setItem(PREFIX + key, value);
      }
      localStorage.removeItem(LEGACY_PREFIX + key);
    }
  } catch {
    // no storage (node, private mode, blocked iframe): there is nothing to migrate
  }
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    migrate();
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    migrate();
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // fails silently when storage is full/in private mode, without affecting the game
    }
  },
  remove(key: string): void {
    migrate();
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // same as set(): storage unavailable is not a game error
    }
  },
  /** A stored on/off setting. Anything that is not exactly `true` or `false` is the fallback. */
  flag(key: string, fallback = false): boolean {
    const value = this.get<unknown>(key, fallback);
    return typeof value === "boolean" ? value : fallback;
  },
};

export const highScore = {
  get: () => storage.get<number>("highScore", 0),
  set: (v: number) => storage.set("highScore", v),
};
