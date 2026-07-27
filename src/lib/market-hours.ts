/** NYSE regular-session helpers (9:30–16:00 America/New_York). Skips weekends + major US holidays. */

const TZ = "America/New_York";
const OPEN_H = 9;
const OPEN_M = 30;
const CLOSE_H = 16;
const CLOSE_M = 0;

export type MarketPhase = "open" | "pre" | "closed";

export type MarketClock = {
  /** e.g. "1:05:32 PM ET" */
  timeEt: string;
  phase: MarketPhase;
  /** Countdown / status line for the UI */
  statusText: string;
  msRemaining: number;
};

type Ymd = { year: number; month: number; day: number };

type NyParts = Ymd & {
  hour: number;
  minute: number;
  second: number;
};

function partNum(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const v = parts.find((p) => p.type === type)?.value;
  return v ? Number(v) : 0;
}

function nyParts(date: Date): NyParts {
  // hour12: false + hourCycle h23 — some engines ignore hourCycle alone and
  // return 1–12 hours, which breaks "past 1:15 ET" checks in the afternoon.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: partNum(parts, "year"),
    month: partNum(parts, "month"),
    day: partNum(parts, "day"),
    hour: partNum(parts, "hour"),
    minute: partNum(parts, "minute"),
    second: partNum(parts, "second"),
  };
}

/** Offset of America/New_York from UTC at `instant`, in minutes (NY = UTC + offset). */
function nyOffsetMinutes(instant: Date): number {
  const p = nyParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - instant.getTime()) / 60_000;
}

/** Convert a New York wall-clock time to a UTC Date. */
function nyLocalToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = utcGuess - nyOffsetMinutes(new Date(utcGuess)) * 60_000;
  utc = utcGuess - nyOffsetMinutes(new Date(utc)) * 60_000;
  return new Date(utc);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function addCalendarDays(year: number, month: number, day: number, delta: number): Ymd {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function weekdayIndex(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

/** Western (Gregorian) Easter Sunday — Anonymous algorithm. */
function easterSunday(year: number): Ymd {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Ymd {
  let day = 1;
  while (weekdayIndex(year, month, day) !== weekday) day += 1;
  day += (n - 1) * 7;
  return { year, month, day };
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Ymd {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let day = last;
  while (weekdayIndex(year, month, day) !== weekday) day -= 1;
  return { year, month, day };
}

function observedFixed(year: number, month: number, day: number): Ymd {
  const dow = weekdayIndex(year, month, day);
  if (dow === 0) return addCalendarDays(year, month, day, 1); // Sunday → Monday
  if (dow === 6) return addCalendarDays(year, month, day, -1); // Saturday → Friday
  return { year, month, day };
}

function ymdKey({ year, month, day }: Ymd) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Major NYSE full-day closures (not early closes). */
function nyseHolidaySet(year: number): Set<string> {
  const set = new Set<string>();
  const add = (d: Ymd) => set.add(ymdKey(d));

  add(observedFixed(year, 1, 1)); // New Year's
  add(nthWeekdayOfMonth(year, 1, 1, 3)); // MLK
  add(nthWeekdayOfMonth(year, 2, 1, 3)); // Presidents Day
  {
    const easter = easterSunday(year);
    add(addCalendarDays(easter.year, easter.month, easter.day, -2)); // Good Friday
  }
  add(lastWeekdayOfMonth(year, 5, 1)); // Memorial Day
  add(observedFixed(year, 6, 19)); // Juneteenth
  add(observedFixed(year, 7, 4)); // Independence Day
  add(nthWeekdayOfMonth(year, 9, 1, 1)); // Labor Day
  add(nthWeekdayOfMonth(year, 11, 4, 4)); // Thanksgiving
  add(observedFixed(year, 12, 25)); // Christmas

  return set;
}

function isNyseHoliday(ymd: Ymd): boolean {
  // Observed New Year's can land on Dec 31 of the prior year.
  for (const y of [ymd.year - 1, ymd.year, ymd.year + 1]) {
    if (nyseHolidaySet(y).has(ymdKey(ymd))) return true;
  }
  return false;
}

function isTradingDay(ymd: Ymd): boolean {
  const dow = weekdayIndex(ymd.year, ymd.month, ymd.day);
  if (dow === 0 || dow === 6) return false;
  return !isNyseHoliday(ymd);
}

/** Next trading day at/after `start` (inclusive) whose regular open is still in the future. */
function nextOpenDate(now: Date, start: Ymd): Date {
  let cur = start;
  for (let i = 0; i < 14; i++) {
    if (isTradingDay(cur)) {
      const open = nyLocalToDate(cur.year, cur.month, cur.day, OPEN_H, OPEN_M);
      if (open.getTime() > now.getTime()) return open;
    }
    cur = addCalendarDays(cur.year, cur.month, cur.day, 1);
  }
  return nyLocalToDate(cur.year, cur.month, cur.day, OPEN_H, OPEN_M);
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${pad2(s)}s`;
  return `${m}m ${pad2(s)}s`;
}

function formatTimeEt(date: Date): string {
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
  return `${clock} ET`;
}

/** Daily recompute / publish time for tomorrow's lean (weekdays). */
export const TOMORROW_LEAN_PUBLISH_H = 13;
export const TOMORROW_LEAN_PUBLISH_M = 15;

export type TomorrowLeanPublishPhase = "preview" | "published" | "offsession";

export type TomorrowLeanPublishInfo = {
  phase: TomorrowLeanPublishPhase;
  /** ET YYYY-MM-DD for the trading day whose 1:15 slot is active or most recently published. */
  publishDateKey: string;
  /** When true, freeze the displayed lean for `publishDateKey` (sessionStorage). */
  shouldLock: boolean;
  /** Short UI stamp, e.g. "Updated 1:15 ET" / "Preview · updates at 1:15 ET". */
  stamp: string;
};

export function etDateKey(now: Date = new Date()): string {
  const p = nyParts(now);
  return ymdKey({ year: p.year, month: p.month, day: p.day });
}

export function isNyseTradingDay(now: Date = new Date()): boolean {
  const p = nyParts(now);
  return isTradingDay({ year: p.year, month: p.month, day: p.day });
}

function weekdayLongNy(ymd: Ymd): string {
  const noon = nyLocalToDate(ymd.year, ymd.month, ymd.day, 12, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
  }).format(noon);
}

function previousTradingDay(start: Ymd): Ymd {
  let cur = addCalendarDays(start.year, start.month, start.day, -1);
  for (let i = 0; i < 14; i++) {
    if (isTradingDay(cur)) return cur;
    cur = addCalendarDays(cur.year, cur.month, cur.day, -1);
  }
  return cur;
}

function nextTradingDayExclusive(start: Ymd): Ymd {
  let cur = addCalendarDays(start.year, start.month, start.day, 1);
  for (let i = 0; i < 14; i++) {
    if (isTradingDay(cur)) return cur;
    cur = addCalendarDays(cur.year, cur.month, cur.day, 1);
  }
  return cur;
}

/** True when the America/New_York wall clock is at/after 1:15 on `p`'s calendar day. */
function isAtOrPastTomorrowLeanPublish(p: NyParts): boolean {
  return (
    p.hour > TOMORROW_LEAN_PUBLISH_H ||
    (p.hour === TOMORROW_LEAN_PUBLISH_H && p.minute >= TOMORROW_LEAN_PUBLISH_M)
  );
}

/**
 * Tomorrow-lean publish schedule at 1:15pm America/New_York on trading days.
 *
 * Publish window runs from a trading day's 1:15 ET until the next trading day's
 * 1:15 ET (through the close, evening, overnight, and next morning).
 * Weekends / holidays keep the prior trading day's publish; stamp points at the
 * next 1:15.
 */
export function getTomorrowLeanPublishInfo(now: Date = new Date()): TomorrowLeanPublishInfo {
  const p = nyParts(now);
  const today: Ymd = { year: p.year, month: p.month, day: p.day };
  const trading = isTradingDay(today);
  const pastPublishToday = isAtOrPastTomorrowLeanPublish(p);

  // Fresh publish for today's session day at/after 1:15 ET.
  if (trading && pastPublishToday) {
    return {
      phase: "published",
      publishDateKey: ymdKey(today),
      shouldLock: true,
      stamp: "Updated 1:15 ET",
    };
  }

  // Before today's 1:15, or a non-session day: stay on the prior trading day's
  // 1:15 publish (locked "Updated 1:15 ET" overnight / through the weekend).
  const prev = previousTradingDay(today);

  if (trading) {
    return {
      phase: "published",
      publishDateKey: ymdKey(prev),
      shouldLock: true,
      stamp: "Updated 1:15 ET",
    };
  }

  const next = nextTradingDayExclusive(today);
  return {
    phase: "offsession",
    publishDateKey: ymdKey(prev),
    shouldLock: true,
    stamp: `Next update ${weekdayLongNy(next)} 1:15 ET`,
  };
}

/**
 * Regular-session clock for the dashboard.
 * Open: countdown to 4:00 PM ET close.
 * Pre-market / closed: countdown to next 9:30 AM ET open.
 */
export function getMarketClock(now: Date = new Date()): MarketClock {
  const p = nyParts(now);
  const today: Ymd = { year: p.year, month: p.month, day: p.day };
  const timeEt = formatTimeEt(now);
  const openToday = nyLocalToDate(p.year, p.month, p.day, OPEN_H, OPEN_M);
  const closeToday = nyLocalToDate(p.year, p.month, p.day, CLOSE_H, CLOSE_M);
  const trading = isTradingDay(today);
  const t = now.getTime();

  if (trading && t >= openToday.getTime() && t < closeToday.getTime()) {
    const msRemaining = closeToday.getTime() - t;
    return {
      timeEt,
      phase: "open",
      statusText: `Closes in ${formatCountdown(msRemaining)}`,
      msRemaining,
    };
  }

  if (trading && t < openToday.getTime()) {
    const msRemaining = openToday.getTime() - t;
    return {
      timeEt,
      phase: "pre",
      statusText: `Opens in ${formatCountdown(msRemaining)}`,
      msRemaining,
    };
  }

  // After close, weekend, or holiday → next regular open
  const openAt = nextOpenDate(now, today);
  const msRemaining = Math.max(0, openAt.getTime() - t);
  return {
    timeEt,
    phase: "closed",
    statusText: `Closed · opens in ${formatCountdown(msRemaining)}`,
    msRemaining,
  };
}
