/** NYSE regular-session helpers (9:30–16:00 America/New_York). Skips weekends + major US holidays. */

const TZ = "America/New_York";
const OPEN_H = 9;
const OPEN_M = 30;
const CLOSE_H = 16;
const CLOSE_M = 0;

export type MarketPhase = "open" | "pre" | "closed";

export type MarketClockInfo = {
  /** e.g. "1:05:32 PM ET" */
  timeEt: string;
  phase: MarketPhase;
  /** Countdown / status line for the UI */
  statusText: string;
  msRemaining: number;
};

type NyParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

function partNum(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const v = parts.find((p) => p.type === type)?.value;
  return v ? Number(v) : 0;
}

function nyParts(date: Date): NyParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: partNum(parts, "year"),
    month: partNum(parts, "month"),
    day: partNum(parts, "day"),
    hour: partNum(parts, "hour"),
    minute: partNum(parts, "minute"),
    second: partNum(parts, "second"),
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
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

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function weekdayIndex(year: number, month: number, day: number): number {
  // Noon UTC avoids edge cases; weekday for calendar date is stable.
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

/** Western (Gregorian) Easter Sunday — Anonymous algorithm. */
function easterSunday(year: number): { month: number; day: number } {
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
  return { month, day };
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): { year: number; month: number; day: number } {
  let day = 1;
  while (weekdayIndex(year, month, day) !== weekday) day += 1;
  day += (n - 1) * 7;
  return { year, month, day };
}

function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): { year: number; month: number; day: number } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let day = last;
  while (weekdayIndex(year, month, day) !== weekday) day -= 1;
  return { year, month, day };
}

function observedFixed(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const dow = weekdayIndex(year, month, day);
  if (dow === 0) return addCalendarDays(year, month, day, 1); // Sunday → Monday
  if (dow === 6) return addCalendarDays(year, month, day, -1); // Saturday → Friday
  return { year, month, day };
}

function ymdKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Major NYSE full-day closures (not early closes). */
function nyseHolidaySet(year: number): Set<string> {
  const set = new Set<string>();
  const add = (d: { year: number; month: number; day: number }) => {
    set.add(ymdKey(d.year, d.month, d.day));
  };

  add(observedFixed(year, 1, 1)); // New Year's
  add(nthWeekdayOfMonth(year, 1, 1, 3)); // MLK
  add(nthWeekdayOfMonth(year, 2, 1, 3)); // Presidents Day
  {
    const easter = easterSunday(year);
    add(addCalendarDays(easter.year ?? year, easter.month, easter.day, -2)); // Good Friday
  }
  add(lastWeekdayOfMonth(year, 5, 1)); // Memorial Day
  add(observedFixed(year, 6, 19)); // Juneteenth
  add(observedFixed(year, 7, 4)); // Independence Day
  add(nthWeekdayOfMonth(year, 9, 1, 1)); // Labor Day
  add(nthWeekdayOfMonth(year, 11, 4, 4)); // Thanksgiving
  add(observedFixed(year, 12, 25)); // Christmas

  return set;
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = weekdayIndex(year, month, day);
  return dow === 0 || dow === 6;
}

function isTradingDay(year: number, month: number, day: number): boolean {
  if (isWeekend(year, month, day)) return false;
  return !nyseHolidaySet(year).has(ymdKey(year, month, day));
}

function nextTradingDay(
  year: number,
  month: number,
  day: number,
): { year: number; month: number; day: number } {
  let cur = addCalendarDays(year, month, day, 1);
  // Cap search in case of bad holiday data
  for (let i = 0; i < 14; i++) {
    if (isTradingDay(cur.year, cur.month, cur.day)) return cur;
    cur = addCalendarDays(cur.year, cur.month, cur.day, 1);
  }
  return cur;
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

/**
 * Regular-session clock for the dashboard.
 * Open: countdown to 4:00 PM ET close.
 * Pre-market / closed: countdown to next 9:30 AM ET open.
 */
export function getMarketClock(now: Date = new Date()): MarketClockInfo {
  const p = nyParts(now);
  const timeEt = formatTimeEt(now);
  const openToday = nyLocalToDate(p.year, p.month, p.day, OPEN_H, OPEN_M);
  const closeToday = nyLocalToDate(p.year, p.month, p.day, CLOSE_H, CLOSE_M);
  const trading = isTradingDay(p.year, p.month, p.day);

  if (trading && now.getTime() >= openToday.getTime() && now.getTime() < closeToday.getTime()) {
    const msRemaining = closeToday.getTime() - now.getTime();
    return {
      timeEt,
      phase: "open",
      statusText: `Closes in ${formatCountdown(msRemaining)}`,
      msRemaining,
    };
  }

  let openAt: Date;
  let phase: MarketPhase;

  if (trading && now.getTime() < openToday.getTime()) {
    openAt = openToday;
    phase = "pre";
  } else {
    const next = trading
      ? nextTradingDay(p.year, p.month, p.day)
      : isTradingDay(p.year, p.month, p.day)
        ? { year: p.year, month: p.month, day: p.day }
        : (() => {
            // Weekend / holiday: if somehow still before open on a trading day handled above;
            // otherwise walk forward from today (including today if it's a future open — not applicable).
            if (!trading) {
              // If today isn't a session, next open is next trading day's 9:30.
              const n = nextTradingDay(p.year, p.month, p.day);
              // nextTradingDay starts at +1; if today is holiday we're past any open.
              return n;
            }
            return nextTradingDay(p.year, p.month, p.day);
          })();
    // After close or non-trading day → next session open
    const n =
      trading && now.getTime() >= closeToday.getTime()
        ? nextTradingDay(p.year, p.month, p.day)
        : nextTradingDay(addCalendarDays(p.year, p.month, p.day, -1).year === p.year &&
            false
            ? p.year
            : p.year, p.month, p.day);
    // Simplify: after the branches above, compute cleanly
    void next;
    void n;
    const day =
      trading && now.getTime() >= closeToday.getTime()
        ? nextTradingDay(p.year, p.month, p.day)
        : !trading
          ? (() => {
              // Walk from today inclusive in case we need — but holidays/weekends have no open today
              let cur = { year: p.year, month: p.month, day: p.day };
              for (let i = 0; i < 14; i++) {
                if (isTradingDay(cur.year, cur.month, cur.day)) {
                  const open = nyLocalToDate(cur.year, cur.month, cur.day, OPEN_H, OPEN_M);
                  if (open.getTime() > now.getTime()) return cur;
                }
                cur = addCalendarDays(cur.year, cur.month, cur.day, 1);
              }
              return cur;
            })()
          : nextTradingDay(p.year, p.month, p.day);
    openAt = nyLocalToDate(day.year, day.month, day.day, OPEN_H, OPEN_M);
    phase = "closed";
  }

  // Recompute openAt cleanly without the messy void branches above
  if (!(trading && now.getTime() < openToday.getTime())) {
    let cur =
      trading && now.getTime() >= closeToday.getTime()
        ? nextTradingDay(p.year, p.month, p.day)
        : { year: p.year, month: p.month, day: p.day };
    if (!(trading && now.getTime() >= closeToday.getTime())) {
      // Non-trading: find next trading day from today (inclusive walk)
      for (let i = 0; i < 14; i++) {
        if (isTradingDay(cur.year, cur.month, cur.day)) {
          const candidate = nyLocalToDate(cur.year, cur.month, cur.day, OPEN_H, OPEN_M);
          if (candidate.getTime() > now.getTime()) {
            openAt = candidate;
            break;
          }
        }
        cur = addCalendarDays(cur.year, cur.month, cur.day, 1);
        openAt = nyLocalToDate(cur.year, cur.month, cur.day, OPEN_H, OPEN_M);
      }
    } else {
      openAt = nyLocalToDate(cur.year, cur.month, cur.day, OPEN_H, OPEN_M);
    }
    phase = "closed";
  }

  const msRemaining = Math.max(0, openAt.getTime() - now.getTime());
  const statusText =
    phase === "pre"
      ? `Opens in ${formatCountdown(msRemaining)}`
      : `Closed · opens in ${formatCountdown(msRemaining)}`;

  return { timeEt, phase, statusText, msRemaining };
}
