/**
 * Opportunity safety heuristics (requirement 32).
 *
 * These produce *cautions*, never accusations. The UI wording is "Exercise
 * caution", and the flags exist so a human admin can review — the platform
 * does not declare a posting fraudulent on the strength of a regex.
 */

export interface FraudSignal {
  code: string;
  label: string;
  severity: 1 | 2 | 3;
}

const PATTERNS: { code: string; label: string; severity: 1 | 2 | 3; pattern: RegExp }[] = [
  {
    code: 'PAYMENT_REQUIRED',
    label: 'Asks for a payment to apply or be considered',
    severity: 3,
    pattern: /\b(registration\s+(fee|charge|amount)|pay\s+(rs\.?|₹|inr)\s*\d|security\s+deposit|refundable\s+deposit|processing\s+charges?)\b/i,
  },
  {
    code: 'BANK_DETAILS_REQUESTED',
    label: 'Requests personal bank or card details',
    severity: 3,
    pattern: /\b(bank\s+account\s+(details|number)|debit\s+card|credit\s+card|upi\s+id|net\s?banking|cvv|atm\s+pin)\b/i,
  },
  {
    code: 'GUARANTEED_JOB',
    label: 'Claims a guaranteed job or guaranteed selection',
    severity: 2,
    pattern: /\b(100%\s+(job\s+)?guarantee|guaranteed\s+(job|placement|selection|offer)|assured\s+placement|direct\s+joining\s+without)\b/i,
  },
  {
    code: 'NO_INTERVIEW',
    label: 'Offers selection without any interview or assessment',
    severity: 2,
    pattern: /\b(no\s+interview\s+required|without\s+any\s+interview|direct\s+selection|instant\s+offer\s+letter)\b/i,
  },
  {
    code: 'UNREALISTIC_EARNINGS',
    label: 'Advertises unusually high earnings for the role level',
    severity: 2,
    pattern: /\b(earn\s+(up\s+to\s+)?(rs\.?|₹|inr)?\s*\d{2,},?\d*\s*(per\s+day|daily|weekly)|work\s+2\s+hours.*earn|unlimited\s+income)\b/i,
  },
  {
    code: 'PERSONAL_CONTACT_ONLY',
    label: 'Directs applicants to a personal messaging contact only',
    severity: 2,
    pattern: /\b(whats\s?app\s+(me|us|on)\s*[:-]?\s*(\+?\d[\d\s-]{7,})|telegram\s+(me|us|@))/i,
  },
  {
    code: 'URGENCY_PRESSURE',
    label: 'Uses high-pressure urgency language',
    severity: 1,
    pattern: /\b(limited\s+seats?\s+(only|left)|hurry\s+up|apply\s+within\s+\d+\s+hours?|last\s+\d+\s+seats?)\b/i,
  },
  {
    code: 'PERSONAL_DOCUMENTS_UPFRONT',
    label: 'Requests identity documents before any selection step',
    severity: 2,
    pattern: /\b(send\s+(your\s+)?(aadhaar|aadhar|pan\s+card|passport)\s+(copy|number)\s+(to|at))\b/i,
  },
];

/** Free email/messaging domains used as the only application channel. */
const UNTRUSTED_APPLY_HOSTS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'rediffmail.com',
  'wa.me', 'chat.whatsapp.com', 't.me', 'telegram.me', 'bit.ly', 'tinyurl.com',
];

export interface FraudAssessment {
  flags: string[];
  signals: FraudSignal[];
  /** 0–100; higher means more caution warranted. */
  score: number;
}

export function assessFraudRisk(input: {
  title: string;
  description?: string;
  rawText?: string;
  applicationUrl?: string;
  sourceUrl?: string;
  trustLevel?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  opportunityType?: string;
}): FraudAssessment {
  const haystack = [input.title, input.description, input.rawText].filter(Boolean).join('\n');
  const signals: FraudSignal[] = [];

  for (const rule of PATTERNS) {
    if (rule.pattern.test(haystack)) {
      signals.push({ code: rule.code, label: rule.label, severity: rule.severity });
    }
  }

  // A government posting legitimately charges an application fee, so the
  // payment signal is downgraded there rather than raised.
  const isGovernment = input.opportunityType?.startsWith('GOVERNMENT') || input.opportunityType === 'PSU_JOB';
  const filtered = isGovernment
    ? signals.filter((s) => s.code !== 'PAYMENT_REQUIRED')
    : signals;

  // Application URL host checks.
  for (const url of [input.applicationUrl, input.sourceUrl].filter(Boolean) as string[]) {
    try {
      const host = new URL(url).host.toLowerCase().replace(/^www\./, '');
      if (UNTRUSTED_APPLY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        filtered.push({
          code: 'UNVERIFIED_APPLY_CHANNEL',
          label: 'Applications are routed through a personal or shortened link',
          severity: 2,
        });
        break;
      }
    } catch {
      filtered.push({ code: 'INVALID_APPLY_URL', label: 'Application link is not a valid URL', severity: 2 });
      break;
    }
  }

  // A fresher salary far above the market band is worth a look, not an accusation.
  const isFresherType = ['INTERNSHIP', 'APPRENTICESHIP', 'TRAINEE'].includes(input.opportunityType ?? '');
  if (isFresherType && (input.salaryMax ?? 0) > 5_000_000) {
    filtered.push({
      code: 'UNUSUAL_COMPENSATION',
      label: 'Compensation is unusually high for this opportunity type',
      severity: 1,
    });
  }

  if (input.trustLevel === 'THIRD_PARTY' && filtered.length > 0) {
    filtered.push({
      code: 'THIRD_PARTY_SOURCE',
      label: 'Not published by a verified official source',
      severity: 1,
    });
  }

  const score = Math.min(
    100,
    filtered.reduce((sum, s) => sum + s.severity * 20, 0),
  );

  return {
    flags: [...new Set(filtered.map((s) => s.code))],
    signals: filtered,
    score,
  };
}

/** Score above which a posting is held for admin review rather than published. */
export const FRAUD_REVIEW_THRESHOLD = 60;
