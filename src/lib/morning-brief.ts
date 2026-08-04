/**
 * Morning brief gates at 5:00 AM America/New_York (US Eastern).
 */

const TZ = "America/New_York";
const RELEASE_H = 5;
const RELEASE_M = 0;

export type MorningBriefGate = {
  /** True when now is on/after today's 5:00 AM ET. */
  released: boolean;
  /** Calendar date (NY) the unlocked brief is for, or the upcoming release day. */
  sessionDate: string;
  /** Wall-clock of this morning's 5:00 AM ET release. */
  releaseAt: Date;
  /** Next unlock if currently locked; otherwise next calendar day's 5am. */
  nextReleaseAt: Date;
  msUntilRelease: number;
  /** e.g. "5:00 AM ET" */
  releaseLabel: string;
};

function partNum(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const v = parts.find((p) => p.type === type)?.value;
  return v ? Number(v) : 0;
}

function nyParts(date: Date) {
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

  let hour = partNum(parts, "hour");
  if (hour === 24) hour = 0;
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value?.toLowerCase();
  if (dayPeriod === "pm" && hour < 12) hour += 12;
  if (dayPeriod === "am" && hour === 12) hour = 0;

  return {
    year: partNum(parts, "year"),
    month: partNum(parts, "month"),
    day: partNum(parts, "day"),
    hour,
    minute: partNum(parts, "minute"),
    second: partNum(parts, "second"),
  };
}

function nyOffsetMinutes(instant: Date): number {
  const p = nyParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - instant.getTime()) / 60_000;
}

function nyLocalToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = nyOffsetMinutes(guess);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60_000);
}

function addDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getMorningBriefGate(now = new Date()): MorningBriefGate {
  const p = nyParts(now);
  const releaseAt = nyLocalToDate(p.year, p.month, p.day, RELEASE_H, RELEASE_M);
  const released = now.getTime() >= releaseAt.getTime();
  const nextDay = addDays(p.year, p.month, p.day, 1);
  const nextReleaseAt = released
    ? nyLocalToDate(nextDay.year, nextDay.month, nextDay.day, RELEASE_H, RELEASE_M)
    : releaseAt;

  return {
    released,
    sessionDate: formatYmd(p.year, p.month, p.day),
    releaseAt,
    nextReleaseAt,
    msUntilRelease: Math.max(0, nextReleaseAt.getTime() - now.getTime()),
    releaseLabel: "5:00 AM ET",
  };
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
