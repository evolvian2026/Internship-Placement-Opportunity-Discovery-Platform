/** Date helpers. All boundaries are computed in the server's local timezone. */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysUntil(date: Date | null | undefined, from: Date = new Date()): number | null {
  if (!date) return null;
  return Math.ceil((startOfDay(date).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function isPast(date: Date | null | undefined, from: Date = new Date()): boolean {
  if (!date) return false;
  return date.getTime() < from.getTime();
}

/** "28 August 2026" — the format used across opportunity pages. */
export function formatLongDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Parse a date from an external source. Returns null rather than guessing,
 * because an invented deadline is worse than a missing one.
 */
export function parseLooseDate(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    const d = new Date(input < 1e12 ? input * 1000 : input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input !== 'string') return null;

  const text = input.trim();
  if (!text) return null;

  // ISO / RFC formats parse natively.
  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) return native;

  // dd-mm-yyyy and dd/mm/yyyy, common on Indian government portals.
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "28 August 2026" / "28 Aug 2026"
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const d = new Date(`${named[2]} ${named[1]}, ${named[3]}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
