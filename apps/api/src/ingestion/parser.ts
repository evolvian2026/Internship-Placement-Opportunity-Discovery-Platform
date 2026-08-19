import { DEGREES, SKILL_LOOKUP, canonicalizeSkills, type Degree } from '@odp/shared';
import { parseCompensation } from '../lib/money';
import { parseLooseDate } from '../lib/dates';
import { stripHtml } from '../lib/text';

/**
 * Parser: pulls structured facts out of the free text a source publishes.
 *
 * Guiding rule (requirement 53): extract only what the text *states*.
 * Every function here returns `null`/`undefined` when it is not confident,
 * so the normalizer records "Not Specified" instead of a guess.
 */

const DEGREE_PATTERNS: { pattern: RegExp; degree: Degree }[] = [
  { pattern: /\bb\.?\s?tech\b/i, degree: 'B_TECH' },
  { pattern: /\bb\.?\s?e\.?\b(?!\w)/i, degree: 'B_E' },
  { pattern: /\bb\.?\s?sc\b/i, degree: 'B_SC' },
  { pattern: /\bb\.?\s?com\b/i, degree: 'B_COM' },
  { pattern: /\bb\.?\s?a\.?\b(?!\w)/i, degree: 'B_A' },
  { pattern: /\bbca\b/i, degree: 'BCA' },
  { pattern: /\bbba\b/i, degree: 'BBA' },
  { pattern: /\bb\.?\s?pharm\b/i, degree: 'B_PHARM' },
  { pattern: /\bmbbs\b/i, degree: 'MBBS' },
  { pattern: /\bm\.?\s?tech\b/i, degree: 'M_TECH' },
  { pattern: /\bm\.?\s?e\.?\b(?!\w)/i, degree: 'M_E' },
  { pattern: /\bm\.?\s?sc\b/i, degree: 'M_SC' },
  { pattern: /\bm\.?\s?com\b/i, degree: 'M_COM' },
  { pattern: /\bmca\b/i, degree: 'MCA' },
  { pattern: /\bmba\b/i, degree: 'MBA' },
  { pattern: /\bpgdm\b/i, degree: 'PGDM' },
  { pattern: /\bph\.?\s?d\b/i, degree: 'PHD' },
  { pattern: /\bdiploma\b/i, degree: 'DIPLOMA' },
  { pattern: /\biti\b/i, degree: 'ITI' },
];

const BRANCH_PATTERNS: { pattern: RegExp; branch: string }[] = [
  { pattern: /\b(cse|computer\s+science(\s+(and|&)\s+engineering)?)\b/i, branch: 'CSE' },
  { pattern: /\b(it|information\s+technology)\b/i, branch: 'IT' },
  { pattern: /\b(ece|electronics\s*(and|&)?\s*communication)\b/i, branch: 'ECE' },
  { pattern: /\b(eee|electrical\s*(and|&)?\s*electronics)\b/i, branch: 'EEE' },
  { pattern: /\b(mechanical|mech\b)/i, branch: 'Mechanical' },
  { pattern: /\bcivil\b/i, branch: 'Civil' },
  { pattern: /\bchemical\b/i, branch: 'Chemical' },
  { pattern: /\belectrical\b/i, branch: 'Electrical' },
  { pattern: /\belectronics\b/i, branch: 'Electronics' },
  { pattern: /\baerospace\b/i, branch: 'Aerospace' },
  { pattern: /\bautomobile\b/i, branch: 'Automobile' },
  { pattern: /\bbio\s?technology\b/i, branch: 'Biotechnology' },
  { pattern: /\binstrumentation\b/i, branch: 'Instrumentation' },
  { pattern: /\bmetallurgy\b/i, branch: 'Metallurgy' },
  { pattern: /\bproduction\b/i, branch: 'Production' },
];

export function extractDegrees(text: string): Degree[] {
  const found = new Set<Degree>();
  for (const { pattern, degree } of DEGREE_PATTERNS) {
    if (pattern.test(text)) found.add(degree);
  }
  // Explicit enum tokens, e.g. a JSON feed that already uses our taxonomy.
  for (const degree of DEGREES) {
    if (new RegExp(`\\b${degree}\\b`).test(text)) found.add(degree);
  }
  return [...found];
}

export function extractBranches(text: string): string[] {
  if (/\ball\s+branch(es)?\b/i.test(text) || /\bany\s+(discipline|specialization|stream|branch)\b/i.test(text)) {
    return ['All Branches'];
  }
  const found = new Set<string>();
  for (const { pattern, branch } of BRANCH_PATTERNS) {
    if (pattern.test(text)) found.add(branch);
  }
  return [...found];
}

export function extractGraduationYears(text: string): number[] {
  const years = new Set<number>();
  const thisYear = new Date().getFullYear();

  // "2025 & 2026 batch", "batch of 2026", "2024/2025/2026 pass-outs"
  const batchContext = text.match(
    /(?:batch|pass[\s-]?out|passing[\s-]?out|graduat\w*)[^.\n]{0,60}|[^.\n]{0,60}(?:batch|pass[\s-]?out)/gi,
  );
  const haystack = batchContext?.join(' ') ?? '';
  for (const m of haystack.matchAll(/\b(20\d{2})\b/g)) {
    const year = Number(m[1]);
    if (year >= thisYear - 6 && year <= thisYear + 6) years.add(year);
  }
  return [...years].sort();
}

export function extractCgpa(text: string): number | null {
  // "minimum 7.0 CGPA", "CGPA of 6.5 and above", "7 CGPA"
  const patterns = [
    /(?:min(?:imum)?|at\s+least|above|not\s+less\s+than)[^.\n]{0,20}?(\d(?:\.\d+)?)\s*(?:cgpa|gpa)/i,
    /(?:cgpa|gpa)[^.\n]{0,25}?(?:min(?:imum)?|of|:|above|>=?)\s*(\d(?:\.\d+)?)/i,
    /(\d(?:\.\d+)?)\s*(?:cgpa|gpa)\s*(?:and\s+above|or\s+above|\+)/i,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const value = Number(m[1]);
      if (value > 0 && value <= 10) return value;
    }
  }
  return null;
}

export function extractPercentage(text: string): number | null {
  const patterns = [
    /(?:min(?:imum)?|at\s+least|above|not\s+less\s+than)[^.\n]{0,20}?(\d{2}(?:\.\d+)?)\s*%/i,
    /(\d{2}(?:\.\d+)?)\s*%\s*(?:and\s+above|or\s+above|aggregate|throughout)/i,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const value = Number(m[1]);
      if (value >= 30 && value <= 100) return value;
    }
  }
  return null;
}

export function extractBacklogs(text: string): number | null {
  if (/\b(no|zero|nil)\s+(active\s+|current\s+|standing\s+)?backlogs?\b/i.test(text)) return 0;
  if (/\bbacklogs?\s+(are\s+)?not\s+(allowed|permitted|accepted)\b/i.test(text)) return 0;
  const m = text.match(/(?:max(?:imum)?|not\s+more\s+than|up\s+to)\s+(\d+)\s+backlogs?/i);
  if (m) return Number(m[1]);
  return null;
}

export function extractExperience(text: string): { min: number | null; max: number | null } {
  if (/\b(fresher|freshers|entry[\s-]level|0\s*(?:-|–|to)\s*1\s*year)\b/i.test(text)) {
    return { min: 0, max: /\b0\s*(?:-|–|to)\s*1\s*year/i.test(text) ? 1 : 0 };
  }

  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min <= max && max <= 50) return { min, max };
  }

  const plus = text.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/i);
  if (plus) return { min: Number(plus[1]), max: null };

  const min = text.match(/(?:min(?:imum)?|at\s+least)\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
  if (min) return { min: Number(min[1]), max: null };

  return { min: null, max: null };
}

export function extractAgeLimit(text: string): { min: number | null; max: number | null } {
  const range = text.match(/age[^.\n]{0,30}?(\d{2})\s*(?:-|–|to)\s*(\d{2})\s*years?/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };

  const max = text.match(/(?:max(?:imum)?\s+age|age\s+limit|not\s+(?:more|exceed(?:ing)?)\s+than)[^.\n]{0,25}?(\d{2})\s*years?/i);
  if (max) {
    const value = Number(max[1]);
    if (value >= 18 && value <= 70) return { min: null, max: value };
  }

  const min = text.match(/min(?:imum)?\s+age[^.\n]{0,20}?(\d{2})\s*years?/i);
  if (min) return { min: Number(min[1]), max: null };

  return { min: null, max: null };
}

export function extractVacancies(text: string): number | null {
  const m = text.match(/(?:no\.?\s*of\s*(?:posts?|vacanc(?:y|ies))|vacanc(?:y|ies)|total\s+posts?)\s*[:\-–]?\s*(\d{1,6})/i);
  if (m) {
    const value = Number(m[1]);
    if (value > 0 && value <= 1_000_000) return value;
  }
  return null;
}

export function extractDuration(text: string): number | null {
  const m = text.match(/(?:duration|period)[^.\n]{0,20}?(\d{1,2})\s*(month|week|year)s?/i);
  if (m) {
    const value = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'month') return value;
    if (unit === 'year') return value * 12;
    if (unit === 'week') return Math.max(1, Math.round(value / 4));
  }
  const simple = text.match(/\b(\d{1,2})\s*(?:-|–)?\s*months?\s+(?:internship|program|training)/i);
  if (simple) return Number(simple[1]);
  return null;
}

export function extractDeadline(text: string): Date | null {
  const patterns = [
    /(?:last\s+date|apply\s+(?:by|before)|application\s+(?:deadline|closes?|last\s+date)|deadline|closing\s+date)[^\n]{0,15}?[:\-–]?\s*([0-9]{1,2}[-/.\s][A-Za-z0-9]{1,9}[-/.\s][0-9]{2,4})/i,
    /(?:last\s+date|apply\s+by|deadline)[^\n]{0,15}?[:\-–]?\s*([A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const parsed = parseLooseDate(m[1].replace(/\s+/g, ' ').trim());
      // A deadline far in the past is almost certainly a mis-parse.
      if (parsed && parsed.getTime() > Date.now() - 365 * 24 * 60 * 60 * 1000) return parsed;
    }
  }
  return null;
}

export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();

  for (const [alias, canonical] of SKILL_LOOKUP.entries()) {
    // Escape regex metacharacters in skills like "C++" and ".NET".
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = /^[a-z0-9]/.test(alias) ? '\\b' : '(?:^|[\\s,(])';
    const trailing = /[a-z0-9]$/.test(alias) ? '\\b' : '(?:$|[\\s,.)])';
    if (new RegExp(`${boundary}${escaped}${trailing}`, 'i').test(lower)) {
      found.add(canonical);
    }
  }
  return canonicalizeSkills([...found]);
}

/** Splits a bullet-ish block into individual list items. */
export function extractBullets(text: string, headings: string[]): string[] {
  const clean = stripHtml(text);
  for (const heading of headings) {
    const pattern = new RegExp(
      `${heading}\\s*[:\\-–]?\\s*\\n?([\\s\\S]{0,2000}?)(?:\\n\\s*\\n|\\n(?=[A-Z][a-z]+\\s*[:\\-–])|$)`,
      'i',
    );
    const m = clean.match(pattern);
    if (!m) continue;

    const items = m[1]
      .split(/\n|(?:^|\s)[•▪●]\s*|(?:^|\s)-\s+|(?:^|\s)\*\s+/)
      .map((s) => s.replace(/^[\s•▪●*\-–\d.)]+/, '').trim())
      .filter((s) => s.length > 3 && s.length < 500);

    if (items.length) return items.slice(0, 25);
  }
  return [];
}

export function extractSelectionProcess(text: string): string[] {
  const bullets = extractBullets(text, ['selection process', 'selection procedure', 'hiring process', 'interview process', 'recruitment process']);
  if (bullets.length) return bullets;

  // "Online Test -> Technical Interview -> HR Interview"
  const arrow = text.match(/((?:[A-Za-z][A-Za-z\s]{2,30})(?:\s*(?:->|→|>>|then)\s*[A-Za-z][A-Za-z\s]{2,30}){1,6})/);
  if (arrow) {
    return arrow[1]
      .split(/\s*(?:->|→|>>|then)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function extractApplicationFee(text: string): string | null {
  const m = text.match(/(?:application\s+fee|examination\s+fee|fee)\s*[:\-–]?\s*((?:₹|rs\.?|inr)\s*[\d,]+(?:\s*\/-)?[^\n.]{0,60})/i);
  return m ? m[1].trim().slice(0, 200) : null;
}

/** Everything the parser can pull out of one posting's text. */
export function parseOpportunityText(text: string): {
  degrees: Degree[];
  branches: string[];
  graduationYears: number[];
  minCgpa: number | null;
  minPercentage: number | null;
  maxBacklogs: number | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  minAge: number | null;
  maxAge: number | null;
  skills: string[];
  vacancies: number | null;
  durationMonths: number | null;
  deadline: Date | null;
  applicationFee: string | null;
  selectionProcess: string[];
  responsibilities: string[];
  requirements: string[];
  requiredDocuments: string[];
  compensation: ReturnType<typeof parseCompensation>;
} {
  const clean = stripHtml(text);
  const experience = extractExperience(clean);
  const age = extractAgeLimit(clean);

  return {
    degrees: extractDegrees(clean),
    branches: extractBranches(clean),
    graduationYears: extractGraduationYears(clean),
    minCgpa: extractCgpa(clean),
    minPercentage: extractPercentage(clean),
    maxBacklogs: extractBacklogs(clean),
    minExperienceYears: experience.min,
    maxExperienceYears: experience.max,
    minAge: age.min,
    maxAge: age.max,
    skills: extractSkills(clean),
    vacancies: extractVacancies(clean),
    durationMonths: extractDuration(clean),
    deadline: extractDeadline(clean),
    applicationFee: extractApplicationFee(clean),
    selectionProcess: extractSelectionProcess(clean),
    responsibilities: extractBullets(clean, ['responsibilities', 'key responsibilities', 'what you will do', 'roles and responsibilities', 'job description']),
    requirements: extractBullets(clean, ['requirements', 'eligibility criteria', 'who can apply', 'qualifications', 'required skills']),
    requiredDocuments: extractBullets(clean, ['documents required', 'required documents', 'documents to be submitted']),
    compensation: parseCompensation(clean),
  };
}
