/**
 * storage.ts — localStorage persistence (settings, loadout, the run and the log the reset did not reach).
 * Browser-local storage: doesn't sync across devices, and clearing browser data loses it — state this to the user on delivery.
 *
 * Every value is stored as JSON under a scoped "fp" prefix ("fp." at root for the default user,
 * "fp@<scope>." on subpath hosts such as GitHub Pages, and ":u/<user>." for extra profiles).
 * Nothing read here is trusted: callers sanitise what they get (a stored value can be stale,
 * hand-edited or from an older build).
 */

export const DEFAULT_USER = "default";

const ROOT_PREFIX = "fp.";

// Builds before the story update wrote these three keys under "game.". They are moved
// across once, the first time storage is touched, and the old keys are removed.
const LEGACY_PREFIX = "game.";
const LEGACY_KEYS = ["loadout", "muted", "reducedMotion"] as const;

// Known per-save keys copied non-destructively when migrating from legacy root "fp."
// onto a GitHub Pages repository subpath scope for the default user.
const KNOWN_KEYS = [
  "run",
  "meta",
  "said",
  "seen",
  "loadout",
  "muted",
  "reducedMotion",
  "vfxQuality",
  "highScore",
] as const;

const SAVE_WIPE_KEYS = ["run", "meta", "said", "seen", "loadout"] as const;
const PROFILE_WIPE_KEYS = ["muted", "reducedMotion", "vfxQuality", "highScore"] as const;

let ready = false;
let migrated = false;
let hostScope = "";
let activeUser = DEFAULT_USER;
const userListeners = new Set<() => void>();

/** Normalizes any raw profile name or query parameter to a safe lowercase ID (max 24 chars). */
export function normalizeUserId(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_USER;
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
  return clean || DEFAULT_USER;
}

/**
 * Resolves a subpath deployment scope (e.g. GitHub Pages `/FinalProtocol_Demo/` -> `finalprotocol_demo`).
 * Root deployments (`/`, `/index.html`, or Node/test environments without window) return `""`.
 */
export function resolveHostScope(pathname?: string): string {
  const raw =
    pathname ??
    (typeof window !== "undefined" ? window.location?.pathname : undefined);
  if (typeof raw !== "string" || !raw) return "";
  const clean = raw
    .replace(/\/index\.html$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, "");
  return clean;
}

/** Computes the localStorage key prefix for a given host scope and user ID. */
export function prefixFor(scope: string, userId: string): string {
  if (!scope && userId === DEFAULT_USER) return ROOT_PREFIX;
  if (scope && userId === DEFAULT_USER) return `fp@${scope}.`;
  if (!scope && userId !== DEFAULT_USER) return `fp:u/${userId}.`;
  return `fp@${scope}:u/${userId}.`;
}

/** Computes the metadata key prefix holding host-scoped profile list and save timestamps. */
export function saverMetaPrefix(scope: string): string {
  return scope ? `fp@${scope}:__saver.` : "fp:__saver.";
}

// The old mute key was written by two modules in two encodings: JSON true/false by the
// battle store and "1"/"0" by the audio system, each misreading the other's. Both are
// accepted here; from now on there is one writer's encoding, JSON.
function legacyValue(key: (typeof LEGACY_KEYS)[number], raw: string): string | null {
  if (key === "loadout") return raw;
  if (raw === "true" || raw === "1") return "true";
  if (raw === "false" || raw === "0") return "false";
  return null;
}

function migrateLegacy(): void {
  if (migrated) return;
  migrated = true;
  try {
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(LEGACY_PREFIX + key);
      if (raw === null) continue;
      // A value already saved under the new prefix is newer: it wins.
      if (localStorage.getItem(ROOT_PREFIX + key) === null) {
        const value = legacyValue(key, raw);
        if (value !== null) localStorage.setItem(ROOT_PREFIX + key, value);
      }
      localStorage.removeItem(LEGACY_PREFIX + key);
    }
  } catch {
    // no storage (node, private mode, blocked iframe): there is nothing to migrate
  }
}

function seedSubpathFromRoot(scope: string): void {
  if (!scope) return;
  const meta = saverMetaPrefix(scope);
  try {
    if (localStorage.getItem(`${meta}seeded`) !== null) return;
    const targetPrefix = prefixFor(scope, DEFAULT_USER);
    for (const key of KNOWN_KEYS) {
      const rootVal = localStorage.getItem(ROOT_PREFIX + key);
      if (rootVal !== null && localStorage.getItem(targetPrefix + key) === null) {
        localStorage.setItem(targetPrefix + key, rootVal);
      }
    }
    localStorage.setItem(`${meta}seeded`, "1");
  } catch {
    // ignore unavailable storage
  }
}

function readStoredUsers(scope: string): string[] {
  const meta = saverMetaPrefix(scope);
  try {
    const raw = localStorage.getItem(`${meta}users`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const id = normalizeUserId(entry);
      if (id !== DEFAULT_USER) seen.add(id);
    }
    return [...seen];
  } catch {
    return [];
  }
}

function registerUser(scope: string, userId: string): void {
  if (userId === DEFAULT_USER) return;
  const meta = saverMetaPrefix(scope);
  const existing = readStoredUsers(scope);
  if (existing.includes(userId)) return;
  try {
    localStorage.setItem(`${meta}users`, JSON.stringify([...existing, userId]));
  } catch {
    // ignore quota / blocked storage
  }
}

function readSessionActive(key: string): string | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeSessionActive(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    // ignore private mode / sandbox restrictions
  }
}

function syncUserQueryParam(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!window.location?.href || typeof window.history?.replaceState !== "function") return;
    const url = new URL(window.location.href);
    if (userId === DEFAULT_USER) url.searchParams.delete("user");
    else url.searchParams.set("user", userId);
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore opaque origins or mock windows in tests
  }
}

function ensureReady(): void {
  if (ready) return;
  ready = true;
  hostScope = resolveHostScope();
  migrateLegacy();
  seedSubpathFromRoot(hostScope);

  const meta = saverMetaPrefix(hostScope);
  const search = typeof window !== "undefined" ? window.location?.search ?? "" : "";
  const queryMatch = /(?:^|[?&#])user=([^&#]*)/.exec(search);
  if (queryMatch) {
    let decoded = queryMatch[1];
    try {
      decoded = decodeURIComponent(decoded.replace(/\+/g, " "));
    } catch {
      // keep raw slice when malformed
    }
    activeUser = normalizeUserId(decoded);
    writeSessionActive(`${meta}active`, activeUser);
    registerUser(hostScope, activeUser);
    return;
  }

  const fromSession = readSessionActive(`${meta}active`);
  if (fromSession !== null) {
    activeUser = normalizeUserId(fromSession);
    return;
  }

  try {
    const fromLocal = localStorage.getItem(`${meta}active`);
    activeUser = fromLocal !== null ? normalizeUserId(fromLocal) : DEFAULT_USER;
  } catch {
    activeUser = DEFAULT_USER;
  }
}

function readStampMap(scope: string): Record<string, number> {
  const meta = saverMetaPrefix(scope);
  try {
    const raw = localStorage.getItem(`${meta}stamps`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === "number" && Number.isFinite(val)) result[normalizeUserId(key)] = val;
    }
    return result;
  } catch {
    return {};
  }
}

function notifyUsers(): void {
  userListeners.forEach((listener) => listener());
}

function readWithPrefix<T>(prefix: string, key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(prefix + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    ensureReady();
    return readWithPrefix(prefixFor(hostScope, activeUser), key, fallback);
  },

  set<T>(key: string, value: T): void {
    ensureReady();
    try {
      localStorage.setItem(prefixFor(hostScope, activeUser) + key, JSON.stringify(value));
    } catch {
      // fails silently when storage is full/in private mode, without affecting the game
    }
  },

  remove(key: string): void {
    ensureReady();
    try {
      localStorage.removeItem(prefixFor(hostScope, activeUser) + key);
    } catch {
      // same as set(): storage unavailable is not a game error
    }
  },

  /** A stored on/off setting. Anything that is not exactly `true` or `false` is the fallback. */
  flag(key: string, fallback = false): boolean {
    const value = this.get<unknown>(key, fallback);
    return typeof value === "boolean" ? value : fallback;
  },

  getHostScope(): string {
    ensureReady();
    return hostScope;
  },

  getUser(): string {
    ensureReady();
    return activeUser;
  },

  listUsers(): string[] {
    ensureReady();
    const list = [DEFAULT_USER, ...readStoredUsers(hostScope)];
    if (activeUser !== DEFAULT_USER && !list.includes(activeUser)) list.push(activeUser);
    return list;
  },

  setUser(rawUser: string): string {
    ensureReady();
    const id = normalizeUserId(rawUser);
    activeUser = id;
    const meta = saverMetaPrefix(hostScope);
    writeSessionActive(`${meta}active`, id);
    try {
      if (id === DEFAULT_USER) localStorage.removeItem(`${meta}active`);
      else localStorage.setItem(`${meta}active`, id);
    } catch {
      // ignore unavailable storage
    }
    registerUser(hostScope, id);
    syncUserQueryParam(id);
    notifyUsers();
    return id;
  },

  peekForUser<T>(rawUser: string, key: string, fallback: T): T {
    ensureReady();
    return readWithPrefix(prefixFor(hostScope, normalizeUserId(rawUser)), key, fallback);
  },

  getSavedAt(rawUser?: string): number | null {
    ensureReady();
    const userId = rawUser === undefined ? activeUser : normalizeUserId(rawUser);
    const stamps = readStampMap(hostScope);
    return stamps[userId] ?? null;
  },

  touchSavedAt(rawUser?: string, time = Date.now()): void {
    ensureReady();
    const userId = rawUser === undefined ? activeUser : normalizeUserId(rawUser);
    const stamps = readStampMap(hostScope);
    stamps[userId] = time;
    try {
      localStorage.setItem(`${saverMetaPrefix(hostScope)}stamps`, JSON.stringify(stamps));
    } catch {
      // ignore quota / blocked storage
    }
  },

  clearUserSave(rawUser?: string, removeProfile = false): string {
    ensureReady();
    const target = rawUser === undefined ? activeUser : normalizeUserId(rawUser);
    const targetPrefix = prefixFor(hostScope, target);
    const meta = saverMetaPrefix(hostScope);
    try {
      for (const key of SAVE_WIPE_KEYS) localStorage.removeItem(targetPrefix + key);
      const stamps = readStampMap(hostScope);
      if (target in stamps) {
        delete stamps[target];
        if (Object.keys(stamps).length === 0) localStorage.removeItem(`${meta}stamps`);
        else localStorage.setItem(`${meta}stamps`, JSON.stringify(stamps));
      }
      if (removeProfile && target !== DEFAULT_USER) {
        for (const key of PROFILE_WIPE_KEYS) localStorage.removeItem(targetPrefix + key);
        const remaining = readStoredUsers(hostScope).filter((entry) => entry !== target);
        if (remaining.length === 0) localStorage.removeItem(`${meta}users`);
        else localStorage.setItem(`${meta}users`, JSON.stringify(remaining));
      }
    } catch {
      // ignore blocked storage
    }

    if (removeProfile && target !== DEFAULT_USER && target === activeUser) {
      return this.setUser(DEFAULT_USER);
    }
    notifyUsers();
    return activeUser;
  },

  subscribeUser(listener: () => void): () => void {
    userListeners.add(listener);
    return () => {
      userListeners.delete(listener);
    };
  },

  resetForTests(): void {
    ready = false;
    migrated = false;
    hostScope = "";
    activeUser = DEFAULT_USER;
    userListeners.clear();
  },
};

export const highScore = {
  get: () => storage.get<number>("highScore", 0),
  set: (v: number) => storage.set("highScore", v),
};
