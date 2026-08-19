import { NOT_SPECIFIED } from '@odp/shared';

/**
 * Salary/stipend formatting.
 *
 * Never fabricates a number: when a posting does not state compensation the
 * label is "Not Specified" (requirement 7/53).
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  SGD: 'S$',
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
}

/** 1_200_000 -> "12 LPA"; used for annual INR salaries. */
function toLakhs(amount: number): string {
  const lakhs = amount / 100_000;
  return Number.isInteger(lakhs) ? String(lakhs) : lakhs.toFixed(1);
}

export function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  currency = 'INR',
  period: string | null | undefined = 'YEAR',
): string {
  if (min == null && max == null) return NOT_SPECIFIED;

  const symbol = currencySymbol(currency);
  const isAnnualInr = currency.toUpperCase() === 'INR' && (period ?? 'YEAR') === 'YEAR';

  if (isAnnualInr) {
    if (min != null && max != null) {
      return min === max ? `${symbol}${toLakhs(min)} LPA` : `${symbol}${toLakhs(min)}–${toLakhs(max)} LPA`;
    }
    const value = (min ?? max) as number;
    return `${symbol}${toLakhs(value)} LPA${min == null ? ' (max)' : '+'}`;
  }

  const suffix = period === 'MONTH' ? '/month' : period === 'YEAR' ? '/year' : '';
  const fmt = (n: number) => n.toLocaleString('en-IN');
  if (min != null && max != null) {
    return min === max ? `${symbol}${fmt(min)}${suffix}` : `${symbol}${fmt(min)}–${fmt(max)}${suffix}`;
  }
  return `${symbol}${fmt((min ?? max) as number)}${suffix}`;
}

export function formatStipend(
  min: number | null | undefined,
  max: number | null | undefined,
  currency = 'INR',
): string | null {
  if (min == null && max == null) return null;
  const symbol = currencySymbol(currency);
  const fmt = (n: number) => n.toLocaleString('en-IN');
  if (min != null && max != null) {
    return min === max ? `${symbol}${fmt(min)}/month` : `${symbol}${fmt(min)}–${fmt(max)}/month`;
  }
  return `${symbol}${fmt((min ?? max) as number)}/month`;
}

/**
 * Best-effort extraction of a compensation range from free text.
 * Returns nulls when nothing can be read confidently — the caller then stores
 * "Not Specified" instead of a guess.
 */
export function parseCompensation(text: string): {
  min: number | null;
  max: number | null;
  period: 'YEAR' | 'MONTH' | null;
} {
  const normalized = text.toLowerCase().replace(/,/g, '');

  // "8-12 LPA", "8 to 12 lpa", "12 lpa"
  const lpaRange = normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs? per annum|lac)/);
  if (lpaRange) {
    return { min: Math.round(Number(lpaRange[1]) * 100_000), max: Math.round(Number(lpaRange[2]) * 100_000), period: 'YEAR' };
  }
  const lpaSingle = normalized.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakhs? per annum|lac)/);
  if (lpaSingle) {
    const v = Math.round(Number(lpaSingle[1]) * 100_000);
    return { min: v, max: v, period: 'YEAR' };
  }

  // "₹25000/month", "25000 per month", "Rs. 20000 - 30000 per month"
  const monthRange = normalized.match(
    /(?:₹|rs\.?|inr)?\s*(\d{4,7})\s*(?:-|–|to)\s*(?:₹|rs\.?|inr)?\s*(\d{4,7})\s*(?:\/|per\s+)?month/,
  );
  if (monthRange) {
    return { min: Number(monthRange[1]), max: Number(monthRange[2]), period: 'MONTH' };
  }
  const monthSingle = normalized.match(/(?:₹|rs\.?|inr)?\s*(\d{4,7})\s*(?:\/|per\s+)?month/);
  if (monthSingle) {
    const v = Number(monthSingle[1]);
    return { min: v, max: v, period: 'MONTH' };
  }

  return { min: null, max: null, period: null };
}
