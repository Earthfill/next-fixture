// ---------------------------------------------------------------------------
// Site-local date helpers — "today" in the site's timezone (not UTC).
// ---------------------------------------------------------------------------
// `new Date().toISOString()` returns UTC, which lags the site's local day by
// up to a few hours. Using UTC to compute "today" means that shortly after
// local midnight the fixture window still starts on the previous day, surfacing
// yesterday's (finished) matches on the homepage.
//
// These helpers resolve the date in SITE_TIMEZONE so fixture windows and
// date-scoped cache keys roll over at the audience's local midnight.

export const SITE_TIMEZONE =
  process.env.SITE_TIMEZONE || process.env.CRON_TZ || "Europe/London";

/** Format a Date as "YYYY-MM-DD" in the site's timezone. */
export function toSiteDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's date in the site's timezone ("YYYY-MM-DD"). */
export function siteToday(): string {
  return toSiteDate(new Date());
}
