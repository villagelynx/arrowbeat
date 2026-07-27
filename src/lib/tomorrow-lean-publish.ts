import {
  getTomorrowLeanPublishInfo,
  type TomorrowLeanPublishInfo,
  type TomorrowLeanPublishPhase,
} from "./market-hours";
import type { TomorrowSignal } from "./signal";

const STORAGE_PREFIX = "arrowbeat:tomorrow-lean:";

export type DisplayedTomorrowLean = {
  lean: TomorrowSignal;
  stamp: string;
  phase: TomorrowLeanPublishPhase;
  publish: TomorrowLeanPublishInfo;
};

function storageKey(publishDateKey: string) {
  return `${STORAGE_PREFIX}${publishDateKey}`;
}

function readLocked(publishDateKey: string): TomorrowSignal | null {
  try {
    const raw = sessionStorage.getItem(storageKey(publishDateKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TomorrowSignal;
    if (
      !parsed ||
      typeof parsed.probabilityHigher !== "number" ||
      typeof parsed.probabilityLower !== "number" ||
      (parsed.bias !== "up" && parsed.bias !== "down")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLocked(publishDateKey: string, lean: TomorrowSignal) {
  try {
    sessionStorage.setItem(storageKey(publishDateKey), JSON.stringify(lean));
  } catch {
    // Private mode / quota — still show live lean for this tick.
  }
}

/**
 * Resolve the tomorrow card lean + stamp.
 * After the active 1:15 ET publish (through the next trading day's 1:15),
 * snapshot into sessionStorage so 15-min market refreshes do not twitch the %.
 * If past publish with no lock yet, compute from live and lock immediately.
 */
export function resolveDisplayedTomorrowLean(
  live: TomorrowSignal | null,
  now: Date = new Date(),
): DisplayedTomorrowLean | null {
  if (!live) return null;

  const publish = getTomorrowLeanPublishInfo(now);

  if (publish.phase === "preview" || !publish.shouldLock) {
    return { lean: live, stamp: publish.stamp, phase: publish.phase, publish };
  }

  // Published / off-session: prefer the locked snapshot for this publish slot.
  const locked = readLocked(publish.publishDateKey);
  if (locked) {
    return { lean: locked, stamp: publish.stamp, phase: publish.phase, publish };
  }

  writeLocked(publish.publishDateKey, live);
  return { lean: live, stamp: publish.stamp, phase: publish.phase, publish };
}
