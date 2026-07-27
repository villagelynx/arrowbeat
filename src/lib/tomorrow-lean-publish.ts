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
 * After 1:15 ET on a trading day, snapshot into sessionStorage so 15-min market
 * refreshes do not twitch the displayed %.
 */
export function resolveDisplayedTomorrowLean(
  live: TomorrowSignal | null,
  now: Date = new Date(),
): DisplayedTomorrowLean | null {
  if (!live) return null;

  const publish = getTomorrowLeanPublishInfo(now);

  if (publish.phase === "preview") {
    return { lean: live, stamp: publish.stamp, phase: publish.phase, publish };
  }

  if (publish.phase === "published") {
    const locked = readLocked(publish.publishDateKey);
    if (locked) {
      return { lean: locked, stamp: publish.stamp, phase: publish.phase, publish };
    }
    writeLocked(publish.publishDateKey, live);
    return { lean: live, stamp: publish.stamp, phase: publish.phase, publish };
  }

  // Weekend / holiday: keep last trading day's published lean when it still
  // targets the same next session; otherwise show live calendar lean.
  const locked = readLocked(publish.publishDateKey);
  if (locked && locked.asOfDate === live.asOfDate) {
    return { lean: locked, stamp: publish.stamp, phase: publish.phase, publish };
  }

  return { lean: live, stamp: publish.stamp, phase: publish.phase, publish };
}
